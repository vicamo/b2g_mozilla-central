/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ModemWorker.h"

using namespace mozilla::system::gonk;

namespace {

nsCOMPtr<nsIThread> workerThread;

void
DispatchToWorkerThread(nsIRunnable* aRunnable)
{
  MOZ_ASSERT(NS_IsMainThread());
  NS_ENSURE_TRUE(workerThread);

  workerThread->Dispatch(aRunnable);
}

void
DispatchToMainThread(nsIRunnable* aRunnable)
{
  MOZ_ASSERT(!NS_IsMainThread());
  NS_DispatchToMainThread(aRunnable);
}

class ReceiveRilMessageTask : public nsRunnable
{
public:
  ReceiveMessageTask(ModemWorker* aModemWorker,
                     UnixSocketRawData* aSocketData)
    : mModemWorker(aModemWorker)
    , mSocketData(aSocketData)
  {
    MOZ_ASSERT(NS_IsMainThread());
  }

  NS_IMETHOD Run()
  {
    MOZ_ASSERT(!NS_IsMainThread());

    // FIXME:
  }

private:
  nsRefPtr<ModemWorker> mModemWorker;
  nsAutoPtr<UnixSocketRawData> mSocketData;
};

class PostRilMessageTask : public nsRunnable
{
public:
  PostMessageTask(ModemWorker* aModemWorker,
                  UnixSocketRawData* aSocketData)
    : mModemWorker(aModemWorker)
    , mSocketData(aSocketData)
  {
    MOZ_ASSERT(!NS_IsMainThread());
  }

  NS_IMETHOD Run()
  {
    MOZ_ASSERT(NS_IsMainThread());

    // FIXME:
  }

private:
  nsRefPtr<ModemWorker> mModemWorker;
  UnixSocketRawData* mSocketData;
};

} // anonymous namespace

ModemWorkerBuf::ModemWorkerBuf()
  : mIncomingBuffer(1024)
  , mOutgoingBuffer(1024)
{
  this->Reset();
}

ModemWorker::ModemWorker(Modem* aModem,
                         const uint32_t aClientId)
  : mModem(aModem)
  , mClientId(aClientId)
{
  MOZ_ASSERT(NS_IsMainThread());
}

void
ModemWorker::Start()
{
  MOZ_ASSERT(NS_IsMainThread());
  NS_ENSURE_TRUE(mModem);
  NS_ENSURE_TRUE(!mStarted);

  if (!workerThread) {
    nsCOMPtr<nsIThreadManager> tm = do_GetService(NS_THREADMANAGER_CONTRACTID);
    nsresult rv = tm->NewThread(0, 0, getter_AddRefs(workerThread));
    if (NS_FAILED(rv)) {
      return;
    }

    NS_SetThreadName(workerThread, NS_LITERAL_STRING("ModemWorker"));
  }

  mStarted = true;

  mBuf = new ModemWorkerBuf();

  RilConsumer::Register(mClientId, this);
}

void
ModemWorker::ReceiveRilMessage(UnixSocketRawData* aSocketData)
{
  DispatchToWorkerThread(new ReceiveRilMessageTask(this, aSocketData));
}

void
ModemWorker::PostRilMessage(const void* aData,
                            const size_t aSize)
{
  MOZ_ASSERT(aData && aSize);

  UnixSocketRawData* socketData = new UnixSocketRawData(aData, aSize);
  DispatchToMainThread(new PostRilMessageTask(this, socketData));
}
