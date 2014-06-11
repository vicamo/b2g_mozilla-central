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

/* static */ nsresult
MobileMessageThread::Create(uint64_t aId,
                            const JS::Value& aParticipants,
                            uint64_t aTimestamp,
                            const nsAString& aLastMessageSubject,
                            const nsAString& aBody,
                            uint64_t aUnreadCount,
                            const nsAString& aLastMessageType,
                            JSContext* aCx,
                            nsIMobileMessageThread** aThread)
{
  *aThread = nullptr;

  // Participants.
  nsTArray<nsString> participants;
  {
    if (!aParticipants.isObject()) {
      return NS_ERROR_INVALID_ARG;
    }

    JS::Rooted<JSObject*> obj(aCx, &aParticipants.toObject());
    if (!JS_IsArrayObject(aCx, obj)) {
      return NS_ERROR_INVALID_ARG;
    }

    uint32_t length;
    MOZ_ALWAYS_TRUE(JS_GetArrayLength(aCx, obj, &length));
    NS_ENSURE_TRUE(length, NS_ERROR_INVALID_ARG);

    for (uint32_t i = 0; i < length; ++i) {
      JS::Rooted<JS::Value> val(aCx);

      if (!JS_GetElement(aCx, obj, i, &val) || !val.isString()) {
        return NS_ERROR_INVALID_ARG;
      }

      nsDependentJSString str;
      str.init(aCx, val.toString());
      participants.AppendElement(str);
    }
  }

  // Set |lastMessageType|.
  MobileMessageType lastMessageType;
  if (aLastMessageType.Equals(MESSAGE_TYPE_SMS)) {
    lastMessageType = MobileMessageType::Sms;
  } else if (aLastMessageType.Equals(MESSAGE_TYPE_MMS)) {
    lastMessageType = MobileMessageType::Mms;
  } else {
    return NS_ERROR_INVALID_ARG;
  }

  nsCOMPtr<nsIMobileMessageThread> thread =
    new MobileMessageThread(aId, participants, aTimestamp, aLastMessageSubject,
                            aBody, aUnreadCount, lastMessageType);
  thread.forget(aThread);
  return NS_OK;
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
