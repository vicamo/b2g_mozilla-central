/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et ft=cpp : */
/* Copyright 2012 Mozilla Foundation and Mozilla contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <sys/syscall.h>
#include <time.h>

#if defined(__i386__)
#include <linux/ioctl.h>
#include <linux/rtc.h>
#else
#include <linux/android_alarm.h>
#endif

#include "mozilla/DebugOnly.h"
#include "mozilla/FileUtils.h"
#include "mozilla/Hal.h"
#include "mozilla/Monitor.h"
#include "mozilla/RefPtr.h"
#include "nsIRunnable.h"
#include "nsThreadUtils.h"

namespace mozilla {
namespace hal_impl {

namespace {

#if defined(__i386__)
const char *alarmDeviceName = "/dev/rtc0";
#else
const char *alarmDeviceName = "/dev/alarm";
#endif

const char *wakeLockFilename = "/sys/power/wake_lock";
const char *wakeUnlockFilename = "/sys/power/wake_unlock";

/**
 * RAII class to help us remember to close file descriptors.
 */
bool
WriteToFile(const char *filename, const char *toWrite)
{
  int fd = open(filename, O_WRONLY);
  ScopedClose autoClose(fd);
  if (fd < 0) {
    HAL_LOG(("Unable to open file %s.", filename));
    return false;
  }

  if (write(fd, toWrite, strlen(toWrite)) < 0) {
    HAL_LOG(("Unable to write to file %s.", filename));
    return false;
  }

  return true;
}

// We can read wakeLockFilename to find out whether the cpu wake lock
// is already acquired, but reading and parsing it is a lot more work
// than tracking it ourselves, and it won't be accurate anyway (kernel
// internal wake locks aren't counted here.)
bool sCpuSleepAllowed = true;

// Some CPU wake locks may be acquired internally in HAL. We use a counter to
// keep track of these needs. Note we have to hold |sInternalLockCpuMonitor|
// when reading or writing this variable to ensure thread-safe.
int32_t sInternalLockCpuCount = 0;

Monitor* sInternalLockCpuMonitor = nullptr;

void
UpdateCpuSleepState()
{
  sInternalLockCpuMonitor->AssertCurrentThreadOwns();
  bool allowed = sCpuSleepAllowed && !sInternalLockCpuCount;
  WriteToFile(allowed ? wakeUnlockFilename : wakeLockFilename, "gecko");
}

void
InternalLockCpu() {
  MonitorAutoLock monitor(*sInternalLockCpuMonitor);
  ++sInternalLockCpuCount;
  UpdateCpuSleepState();
}

void
InternalUnlockCpu() {
  MonitorAutoLock monitor(*sInternalLockCpuMonitor);
  --sInternalLockCpuCount;
  UpdateCpuSleepState();
}

// This thread will wait for the alarm firing by a blocking IO.
pthread_t sAlarmFireWatcherThread;

// If |sAlarmData| is non-null, it's owned by the alarm-watcher thread.
struct AlarmData {
public:
  AlarmData(int aFd) : mFd(aFd),
                       mGeneration(sNextGeneration++),
                       mShuttingDown(false) {}
  ScopedClose mFd;
  int mGeneration;
  bool mShuttingDown;

  static int sNextGeneration;

};

int AlarmData::sNextGeneration = 0;

AlarmData* sAlarmData = nullptr;

class AlarmFiredEvent : public nsRunnable {
public:
  AlarmFiredEvent(int aGeneration) : mGeneration(aGeneration) {}

  NS_IMETHOD Run() {
    // Guard against spurious notifications caused by an alarm firing
    // concurrently with it being disabled.
    if (sAlarmData && !sAlarmData->mShuttingDown &&
        mGeneration == sAlarmData->mGeneration) {
      hal::NotifyAlarmFired();
    }
    // The fired alarm event has been delivered to the observer (if needed);
    // we can now release a CPU wake lock.
    InternalUnlockCpu();
    return NS_OK;
  }

private:
  int mGeneration;
};

// Runs on alarm-watcher thread.
void
DestroyAlarmData(void* aData)
{
  AlarmData* alarmData = static_cast<AlarmData*>(aData);
  delete alarmData;
}

void*
WaitForAlarm(void* aData)
{
  pthread_cleanup_push(DestroyAlarmData, aData);

  AlarmData* alarmData = static_cast<AlarmData*>(aData);

  while (!alarmData->mShuttingDown) {
#if defined(__i386__)
    int retval;
    unsigned long data;

    /* This blocks until the alarm ring causes an interrupt */
    retval = read(alarmData->mFd, &data, sizeof data);
    if (retval == -1) {
      continue;
    }
#else
    int alarmTypeFlags = 0;

    // ALARM_WAIT apparently will block even if an alarm hasn't been
    // programmed, although this behavior doesn't seem to be
    // documented.  We rely on that here to avoid spinning the CPU
    // while awaiting an alarm to be programmed.
    do {
      alarmTypeFlags = ioctl(alarmData->mFd, ANDROID_ALARM_WAIT);
    } while (alarmTypeFlags < 0 && errno == EINTR &&
             !alarmData->mShuttingDown);

    if (alarmData->mShuttingDown ||
        alarmTypeFlags < 0 ||
        !(alarmTypeFlags & ANDROID_ALARM_RTC_WAKEUP_MASK)) {
      continue;
    }
#endif

    // To make sure the observer can get the alarm firing notification
    // *on time* (the system won't sleep during the process in any way),
    // we need to acquire a CPU wake lock before firing the alarm event.
    InternalLockCpu();
    nsRefPtr<AlarmFiredEvent> event =
      new AlarmFiredEvent(alarmData->mGeneration);
    NS_DispatchToMainThread(event);
  }

  pthread_cleanup_pop(1);
  return nullptr;
}

// Runs on alarm-watcher thread.
void
ShutDownAlarm(int aSigno)
{
  if (aSigno == SIGUSR1 && sAlarmData) {
    sAlarmData->mShuttingDown = true;
  }
  return;
}

} // anonymous namespace

bool
GetCpuSleepAllowed()
{
  return sCpuSleepAllowed;
}

void
SetCpuSleepAllowed(bool aAllowed)
{
  MonitorAutoLock monitor(*sInternalLockCpuMonitor);
  sCpuSleepAllowed = aAllowed;
  UpdateCpuSleepState();
}

bool
EnableAlarm()
{
  MOZ_ASSERT(!sAlarmData);

  int alarmFd = open(alarmDeviceName, O_RDONLY);
  if (alarmFd < 0) {
    HAL_LOG(("Failed to open alarm device: %s.", strerror(errno)));
    return false;
  }

  nsAutoPtr<AlarmData> alarmData(new AlarmData(alarmFd));

  struct sigaction actions;
  memset(&actions, 0, sizeof(actions));
  sigemptyset(&actions.sa_mask);
  actions.sa_flags = 0;
  actions.sa_handler = ShutDownAlarm;
  if (sigaction(SIGUSR1, &actions, nullptr)) {
    HAL_LOG(("Failed to set SIGUSR1 signal for alarm-watcher thread."));
    return false;
  }

  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);

  // Initialize the monitor for internally locking CPU to ensure thread-safe
  // before running the alarm-watcher thread.
  sInternalLockCpuMonitor = new Monitor("sInternalLockCpuMonitor");
  int status = pthread_create(&sAlarmFireWatcherThread, &attr, WaitForAlarm,
                              alarmData.get());
  if (status) {
    alarmData = nullptr;
    delete sInternalLockCpuMonitor;
    HAL_LOG(("Failed to create alarm-watcher thread. Status: %d.", status));
    return false;
  }

  pthread_attr_destroy(&attr);

  // The thread owns this now.  We only hold a pointer.
  sAlarmData = alarmData.forget();
  return true;
}

void
DisableAlarm()
{
  MOZ_ASSERT(sAlarmData);

  // NB: this must happen-before the thread cancellation.
  sAlarmData = nullptr;

  // The cancel will interrupt the thread and destroy it, freeing the
  // data pointed at by sAlarmData.
  DebugOnly<int> err = pthread_kill(sAlarmFireWatcherThread, SIGUSR1);
  MOZ_ASSERT(!err);

  delete sInternalLockCpuMonitor;
}

bool
SetAlarm(int32_t aSeconds, int32_t aNanoseconds)
{
  if (!sAlarmData) {
    HAL_LOG(("We should have enabled the alarm."));
    return false;
  }

  int result;
#if defined(__i386__)
  struct rtc_time rtc_tm;
  struct tm tm;
  time_t t;

  t = aSeconds + (aNanoseconds ? 1 : 0);
  gmtime_r(&t, &tm);
  memcpy(&rtc_tm, &tm, sizeof rtc_tm);

  result = ioctl(sAlarmData->mFd, RTC_ALM_SET, &rtc_tm);
#else
  struct timespec ts;
  ts.tv_sec = aSeconds;
  ts.tv_nsec = aNanoseconds;

  // Currently we only support RTC wakeup alarm type.
  result = ioctl(sAlarmData->mFd,
                 ANDROID_ALARM_SET(ANDROID_ALARM_RTC_WAKEUP), &ts);
#endif

  if (result < 0) {
    HAL_LOG(("Unable to set alarm: %s.", strerror(errno)));
    return false;
  }

  return true;
}

} // hal_impl
} // mozilla
