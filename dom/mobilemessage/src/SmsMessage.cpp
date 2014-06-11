/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SmsMessage.h"

#include "mozilla/dom/mobilemessage/Constants.h" // For MessageType
#include "mozilla/dom/mobilemessage/SmsTypes.h"

namespace {

mozilla::dom::SmsDeliveryState
ToWebIdlSmsDeliveryState(mozilla::dom::mobilemessage::DeliveryState aIpdlState)
{
  using mozilla::dom::SmsDeliveryState;
  using namespace mozilla::dom::mobilemessage;

  switch (aIpdlState) {
    case eDeliveryState_Received:
      return SmsDeliveryState::Received;
    case eDeliveryState_Sending:
      return SmsDeliveryState::Sending;
    case eDeliveryState_Sent:
      return SmsDeliveryState::Sent;
    case eDeliveryState_Error:
      return SmsDeliveryState::Error;
    default:
      MOZ_CRASH("We shouldn't get any other ipdl sms delivery state!");
      break;
  }

  return SmsDeliveryState::EndGuard_;
}

mozilla::dom::mobilemessage::DeliveryState
ToIpdlDeliveryState(mozilla::dom::SmsDeliveryState aWebidlState)
{
  using mozilla::dom::SmsDeliveryState;
  using namespace mozilla::dom::mobilemessage;

  switch (aWebidlState) {
    case SmsDeliveryState::Received:
      return eDeliveryState_Received;
    case SmsDeliveryState::Sending:
      return eDeliveryState_Sending;
    case SmsDeliveryState::Sent:
      return eDeliveryState_Sent;
    case SmsDeliveryState::Error:
      return eDeliveryState_Error;
    default:
      MOZ_CRASH("We shouldn't get any other webidl sms delivery state!");
      break;
  }

  return eDeliveryState_EndGuard;
}

mozilla::dom::SmsDeliveryStatus
ToWebIdlSmsDeliveryStatus(mozilla::dom::mobilemessage::DeliveryStatus aIpdlStatus)
{
  using mozilla::dom::SmsDeliveryStatus;
  using namespace mozilla::dom::mobilemessage;

  switch (aIpdlStatus) {
    case eDeliveryStatus_NotApplicable:
      return SmsDeliveryStatus::Not_applicable;
    case eDeliveryStatus_Success:
      return SmsDeliveryStatus::Success;
    case eDeliveryStatus_Pending:
      return SmsDeliveryStatus::Pending;
    case eDeliveryStatus_Error:
      return SmsDeliveryStatus::Error;
    default:
      MOZ_CRASH("We shouldn't get any other ipdl sms delivery status!");
      break;
  }

  return SmsDeliveryStatus::EndGuard_;
}

mozilla::dom::mobilemessage::DeliveryStatus
ToIpdlDeliveryStatus(mozilla::dom::SmsDeliveryStatus aWebidlStatus)
{
  using mozilla::dom::SmsDeliveryStatus;
  using namespace mozilla::dom::mobilemessage;

  switch (aWebidlStatus) {
    case SmsDeliveryStatus::Not_applicable:
      return eDeliveryStatus_NotApplicable;
    case SmsDeliveryStatus::Success:
      return eDeliveryStatus_Success;
    case SmsDeliveryStatus::Pending:
      return eDeliveryStatus_Pending;
    case SmsDeliveryStatus::Error:
      return eDeliveryStatus_Error;
    default:
      MOZ_CRASH("We shouldn't get any other webidl sms delivery status!");
      break;
  }

  return eDeliveryStatus_EndGuard;
}

mozilla::dom::SmsMessageClass
ToWebIdlSmsMessageClass(mozilla::dom::mobilemessage::MessageClass aIpdlMessageClass)
{
  using mozilla::dom::SmsMessageClass;
  using namespace mozilla::dom::mobilemessage;

  switch (aIpdlMessageClass) {
    case eMessageClass_Normal:
      return SmsMessageClass::Normal;
    case eMessageClass_Class0:
      return SmsMessageClass::Class_0;
    case eMessageClass_Class1:
      return SmsMessageClass::Class_1;
    case eMessageClass_Class2:
      return SmsMessageClass::Class_2;
    case eMessageClass_Class3:
      return SmsMessageClass::Class_3;
    default:
      MOZ_CRASH("We shouldn't get any other ipdl sms message class!");
      break;
  }

  return SmsMessageClass::EndGuard_;
}

mozilla::dom::mobilemessage::MessageClass
ToIpdlMessageClass(mozilla::dom::SmsMessageClass aWebidlMessageClass)
{
  using mozilla::dom::SmsMessageClass;
  using namespace mozilla::dom::mobilemessage;

  switch (aWebidlMessageClass) {
    case SmsMessageClass::Normal:
      return eMessageClass_Normal;
    case SmsMessageClass::Class_0:
      return eMessageClass_Class0;
    case SmsMessageClass::Class_1:
      return eMessageClass_Class1;
    case SmsMessageClass::Class_2:
      return eMessageClass_Class2;
    case SmsMessageClass::Class_3:
      return eMessageClass_Class3;
    default:
      MOZ_CRASH("We shouldn't get any other webidl sms message class!");
      break;
  }

  return eMessageClass_EndGuard;
}

} // anonymous namespace

namespace mozilla {
namespace dom {

namespace mobilemessage {

MobileMessageCommon::MobileMessageCommon(MobileMessageType aType,
                                         int32_t aId,
                                         uint64_t aThreadId,
                                         const nsAString& aIccId,
                                         const nsAString& aSender,
                                         uint64_t aTimestamp,
                                         uint64_t aSentTimestamp,
                                         bool aRead)
  : mType(aType), mId(aId), mThreadId(aThreadId), mIccId(aIccId)
  , mSender(aSender), mTimestamp(aTimestamp), mSentTimestamp(aSentTimestamp)
  , mRead(aRead)
{
}

} // namespace mobilemessage

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE_0(SmsMessage)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(SmsMessage)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
  NS_INTERFACE_MAP_ENTRY(nsISmsMessage)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(SmsMessage)
NS_IMPL_CYCLE_COLLECTING_RELEASE(SmsMessage)

SmsMessage::SmsMessage(int32_t aId,
                       uint64_t aThreadId,
                       const nsAString& aIccId,
                       SmsDeliveryState aDelivery,
                       SmsDeliveryStatus aDeliveryStatus,
                       const nsAString& aSender,
                       const nsAString& aReceiver,
                       const nsAString& aBody,
                       SmsMessageClass aMessageClass,
                       uint64_t aTimestamp,
                       uint64_t aSentTimestamp,
                       uint64_t aDeliveryTimestamp,
                       bool aRead)
  : MobileMessageCommon(MobileMessageType::Sms, aId, aThreadId, aIccId, aSender,
                        aTimestamp, aSentTimestamp, aRead)
  , mDelivery(aDelivery)
  , mDeliveryStatus(aDeliveryStatus)
  , mReceiver(aReceiver)
  , mBody(aBody)
  , mMessageClass(aMessageClass)
  , mDeliveryTimestamp(aDeliveryTimestamp)
{
  SetIsDOMBinding();
}

SmsMessage::SmsMessage(const SmsMessageData& aData)
  : MobileMessageCommon(MobileMessageType::Sms, aData.id(), aData.threadId(),
                        aData.iccId(), aData.sender(), aData.timestamp(),
                        aData.sentTimestamp(), aData.read())
  , mDelivery(ToWebIdlSmsDeliveryState(aData.delivery()))
  , mDeliveryStatus(ToWebIdlSmsDeliveryStatus(aData.deliveryStatus()))
  , mReceiver(aData.receiver())
  , mBody(aData.body())
  , mMessageClass(ToWebIdlSmsMessageClass(aData.messageClass()))
  , mDeliveryTimestamp(aData.deliveryTimestamp())
{
  SetIsDOMBinding();
}

/* static */ already_AddRefed<SmsMessage>
SmsMessage::Constructor(const GlobalObject& aGlobal,
                        int32_t aId,
                   uint64_t aThreadId,
                   const nsAString& aIccId,
                   SmsDeliveryState& aDelivery,
                   SmsDeliveryStatus& aDeliveryStatus,
                   const nsAString& aSender,
                   const nsAString& aReceiver,
                   const nsAString& aBody,
                   SmsMessageClass& aMessageClass,
                   uint64_t aTimestamp,
                   uint64_t aSentTimestamp,
                   uint64_t aDeliveryTimestamp,
                   bool aRead,
                   ErrorResult& aRv)
{
  nsRefPtr<SmsMessage> message =
    new SmsMessage(aId, aThreadId, aIccId, delivery, deliveryStatus, aSender,
                   aReceiver, aBody, messageClass, aTimestamp, aSentTimestamp,
                   aDeliveryTimestamp, aRead);
  return message.forget();
}

JSObject*
SmsMessage::WrapObject(JSContext* aCx)
{
  return MozSmsMessageBinding::Wrap(aCx, this);
}

bool
SmsMessage::GetData(SmsMessageData& aData) const
{
  aData.id() = Id();
  aData.threadId() = ThreadId();
  GetIccId(aData.iccId());
  aData.delivery() = ToIpdlDeliveryState(Delivery());
  aData.deliveryStatus() = ToIpdlDeliveryStatus(DeliveryStatus());
  GetSender(aData.sender());
  GetReceiver(aData.receiver());
  GetBody(aData.body());
  aData.messageClass() = ToIpdlMessageClass(MessageClass());
  aData.timestamp() = Timestamp();
  aData.sentTimestamp() = SentTimestamp();
  aData.deliveryTimestamp() = DeliveryTimestamp();
  aData.read() = Read();

  return true;
}

} // namespace dom
} // namespace mozilla
