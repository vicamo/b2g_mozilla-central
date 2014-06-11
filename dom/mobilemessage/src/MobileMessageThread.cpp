/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MobileMessageThread.h"

#include "jsapi.h" // For JS array APIs
#include "mozilla/dom/mobilemessage/Constants.h" // For MessageType
#include "mozilla/dom/mobilemessage/SmsTypes.h"
#include "mozilla/dom/MozMobileMessageThreadBinding.h"
#include "nsJSUtils.h" // For nsDependentJSString

namespace {

mozilla::dom::MobileMessageType
ToWebIdlMobileMessageType(mozilla::dom::mobilemessage::MessageType aIpcType)
{
  using mozilla::dom::MobileMessageType;
  using namespace mozilla::dom::mobilemessage;

  switch (aIpcType) {
    case eMessageType_SMS:
      return MobileMessageType::Sms;
    case eMessageType_MMS:
      return MobileMessageType::Mms;
    default:
      MOZ_CRASH("We shouldn't get any other ipdl message type!");
      break;
  }

  return MobileMessageType::EndGuard_;
}

mozilla::dom::mobilemessage::MessageType
ToIpdlMobileMessageType(mozilla::dom::MobileMessageType aWebidlType)
{
  using mozilla::dom::MobileMessageType;
  using namespace mozilla::dom::mobilemessage;

  switch (aWebidlType) {
    case MobileMessageType::Sms:
      return eMessageType_SMS;
    case MobileMessageType::Mms:
      return eMessageType_MMS;
    default:
      MOZ_CRASH("We shouldn't get any other webidl message type!");
      break;
  }

  return eMessageType_EndGuard;
}

} // anonymous namespace

namespace mozilla {
namespace dom {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE_0(MobileMessageThread)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MobileMessageThread)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
  NS_INTERFACE_MAP_ENTRY(nsIMobileMessageThread)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(MobileMessageThread)
NS_IMPL_CYCLE_COLLECTING_RELEASE(MobileMessageThread)

/* static */ already_AddRefed<MobileMessageThread>
MobileMessageThread::Constructor(const GlobalObject& aGlobal,
                                 uint64_t aId,
                                 const Sequence<nsString>& aParticipants,
                                 uint64_t aTimestamp,
                                 const nsAString& aLastMessageSubject,
                                 const nsAString& aBody,
                                 uint64_t aUnreadCount,
                                 MobileMessageType aLastMessageType,
                                 ErrorResult& aRv)
{
  nsRefPtr<MobileMessageThread> thread =
    new MobileMessageThread(aId, participants, aTimestamp, aLastMessageSubject,
                            aBody, aUnreadCount, lastMessageType);
  return thread.forget();
}

MobileMessageThread::MobileMessageThread(uint64_t aId,
                                         const nsTArray<nsString>& aParticipants,
                                         uint64_t aTimestamp,
                                         const nsAString& aLastMessageSubject,
                                         const nsAString& aBody,
                                         uint64_t aUnreadCount,
                                         MobileMessageType aLastMessageType)
  : mId(aId)
  , mLastMessageSubject(aLastMessageSubject)
  , mBody(aBody)
  , mUnreadCount(aUnreadCount)
  , mParticipants(new DOMStringList())
  , mTimestamp(aTimestamp)
  , mLastMessageType(aLastMessageType)
{
  MOZ_ASSERT(aParticipants.Length());

  mParticipants->StringArray() = aParticipants;

  SetIsDOMBinding();
}

MobileMessageThread::MobileMessageThread(const ThreadData& aData)
  : mId(aData.id())
  , mLastMessageSubject(aData.lastMessageSubject())
  , mBody(aData.body())
  , mUnreadCount(aData.unreadCount())
  , mParticipants(new DOMStringList())
  , mTimestamp(aData.timestamp())
  , mLastMessageType(ToWebIdlMobileMessageType(aData.lastMessageType()))
{
  MOZ_ASSERT(aData.participants().Length());

  mParticipants->StringArray() = aData.participants();

  SetIsDOMBinding();
}

JSObject*
MobileMessageThread::WrapObject(JSContext* aCx)
{
  return MozMobileMessageThreadBinding::Wrap(aCx, this);
}

bool
MobileMessageThread::GetData(ThreadData& aData) const
{
  aData.id() = Id();
  aData.participants() = mParticipants->StringArray();
  aData.timestamp() = Timestamp();
  GetLastMessageSubject(aData.lastMessageSubject());
  GetBody(aData.body());
  aData.unreadCount() = UnreadCount();
  aData.lastMessageType() = ToIpdlMobileMessageType(LastMessageType());

  return true;
}

} // namespace dom
} // namespace mozilla
