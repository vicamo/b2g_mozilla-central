/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_system_gonk_ModemWorker_h
#define mozilla_system_gonk_ModemWorker_h

#include <mozilla/ipc/UnixSocket.h>
#include "Modem.h"

namespace mozilla {
namespace system {
namespace gonk {

class ModemWorker;

class ModemWorkerBuf
{
public:
  NS_INLINE_DECL_REFCOUNTING

private:
  ModemWorkerBuf();

  void Reset();
  void ProcessIncoming(const UnixSocketRawData& aSocketData);

private:
  nsTArray<uint8_t> mIncomingBuffer;
  nsTArray<uint8_t> mOutgoingBuffer;
};

class ModemWorker
{
public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(ModemWorker)

  ModemWorker(Modem* aModem,
              const uint32_t aClientId);

  void Start();

public:
  void ReceiveRilMessage(UnixSocketRawData* aMessage);
  void PostRilMessage(const void* aData,
                      const size_t aSize);

private:
  Modem* mModem;
  const uint32_t mClientId;
  bool mStarted;
  nsRefPtr<ModemWorkerBuf> mBuf;
};

} // namespace gonk
} // namespace system
} // namespace mozilla

#endif // mozilla_system_gonk_ModemWorker_h
