/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et ft=cpp : */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <errno.h>
#include <fcntl.h>
#include <string.h>

#include "mozilla/Hal.h"

namespace mozilla {
namespace hal_impl {

namespace {

int sRtcFd = -1;

} // anonymous namespace

bool
EnableAlarm()
{
  MOZ_ASSERT(sRtcFd < 0);

  sRtcFd = open("/dev/rtc0", O_RDONLY);
  if (sRtcFd < 0) {
    HAL_LOG(("Failed to open rtc device: %s.", strerror(errno)));
    return false;
  }

  return true;
}

void
DisableAlarm()
{
  MOZ_ASSERT(sRtcFd >= 0);
}

bool
SetAlarm(int32_t aSeconds, int32_t aNanoseconds)
{
  if (sRtcFd < 0) {
    HAL_LOG(("We should have enabled the alarm."));
    return false;
  }

  return true;
}

} // hal_impl
} // namespace mozilla
