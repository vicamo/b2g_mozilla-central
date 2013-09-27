/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/MmsMessage.h"

#include "jsapi.h" // For OBJECT_TO_JSVAL and JS_NewDateObjectMsec
#include "jsfriendapi.h" // For js_DateGetMsecSinceEpoch
#include "mozilla/dom/MmsAttachment.h"
#include "mozilla/dom/mobilemessage/Constants.h" // For MessageType
#include "mozilla/dom/mobilemessage/SmsTypes.h"
#include "nsDOMLists.h" // For nsDOMStringList
#include "nsJSUtils.h"
#include "nsTArrayHelpers.h"

using namespace mozilla::dom::mobilemessage;
using namespace mozilla::dom;

NS_IMPL_ISUPPORTS1(MmsMessage, nsIDOMMozMmsMessage)

MmsMessage::MmsMessage(int32_t aId,
                       const uint64_t aThreadId,
                       DeliveryState aDelivery,
                       const nsTArray<DeliveryStatus>& aDeliveryStatus,
                       const nsAString& aSender,
                       const nsTArray<nsString>& aReceivers,
                       double aTimestamp,
                       bool aRead,
                       const nsAString& aSubject,
                       const nsAString& aSmil,
                       const nsTArray<nsCOMPtr<nsIDOMMozMmsAttachment> >& aAttachments,
                       double aExpiryDate)
  : mId(aId),
    mThreadId(aThreadId),
    mDelivery(aDelivery),
    mDeliveryStatus(aDeliveryStatus),
    mSender(aSender),
    mReceivers(aReceivers),
    mTimestamp(aTimestamp),
    mRead(aRead),
    mSubject(aSubject),
    mSmil(aSmil),
    mAttachments(aAttachments),
    mExpiryDate(aExpiryDate)
{
}

MmsMessage::MmsMessage(const MmsMessageData& aData)
  : mId(aData.id())
  , mThreadId(aData.threadId())
  , mDelivery(aData.delivery())
  , mDeliveryStatus(aData.deliveryStatus())
  , mSender(aData.sender())
  , mReceivers(aData.receivers())
  , mTimestamp(aData.timestamp())
  , mRead(aData.read())
  , mSubject(aData.subject())
  , mSmil(aData.smil())
  , mExpiryDate(aData.expiryDate())
{
  uint32_t len = aData.attachments().Length();
  mAttachments.SetCapacity(len);
  for (uint32_t i = 0; i < len; i++) {
    const MmsAttachmentData &element = aData.attachments()[i];
    mAttachments.AppendElement(new MmsAttachment(element));
  }
}

/**
 * A helper function to convert the JS value to an integer value for time.
 *
 * @params aCx
 *         The JS context.
 * @params aTime
 *         Can be an object or a number.
 * @params aReturn
 *         The integer value to return.
 * @return NS_OK if the convertion succeeds.
 */
static nsresult
convertTimeToDouble(JSContext* aCx,
                    const JS::Value& aTime,
                    double& aReturn)
{
  if (aTime.isObject()) {
    JS::Rooted<JSObject*> timestampObj(aCx, &aTime.toObject());
    if (!JS_ObjectIsDate(aCx, timestampObj)) {
      return NS_ERROR_INVALID_ARG;
    }
    aReturn = js_DateGetMsecSinceEpoch(timestampObj);
  } else {
    if (!aTime.isNumber()) {
      return NS_ERROR_INVALID_ARG;
    }
    aReturn = aTime.toNumber();
  }
  return NS_OK;
}

/* static */ nsresult
MmsMessage::Create(int32_t aId,
                   const uint64_t aThreadId,
                   const nsAString& aDelivery,
                   const JS::Value& aDeliveryStatus,
                   const nsAString& aSender,
                   const JS::Value& aReceivers,
                   const JS::Value& aTimestamp,
                   bool aRead,
                   const nsAString& aSubject,
                   const nsAString& aSmil,
                   const JS::Value& aAttachments,
                   const JS::Value& aExpiryDate,
                   JSContext* aCx,
                   nsIDOMMozMmsMessage** aMessage)
{
  *aMessage = nullptr;

  // Set |delivery|.
  DeliveryState delivery;
  if (aDelivery.Equals(DELIVERY_SENT)) {
    delivery = eDeliveryState_Sent;
  } else if (aDelivery.Equals(DELIVERY_RECEIVED)) {
    delivery = eDeliveryState_Received;
  } else if (aDelivery.Equals(DELIVERY_SENDING)) {
    delivery = eDeliveryState_Sending;
  } else if (aDelivery.Equals(DELIVERY_NOT_DOWNLOADED)) {
    delivery = eDeliveryState_NotDownloaded;
  } else if (aDelivery.Equals(DELIVERY_ERROR)) {
    delivery = eDeliveryState_Error;
  } else {
    return NS_ERROR_INVALID_ARG;
  }

  // Set |deliveryStatus|.
  if (!aDeliveryStatus.isObject()) {
    return NS_ERROR_INVALID_ARG;
  }
  JS::Rooted<JSObject*> deliveryStatusObj(aCx, &aDeliveryStatus.toObject());
  if (!JS_IsArrayObject(aCx, deliveryStatusObj)) {
    return NS_ERROR_INVALID_ARG;
  }

  uint32_t length;
  JS_ALWAYS_TRUE(JS_GetArrayLength(aCx, deliveryStatusObj, &length));

  nsTArray<DeliveryStatus> deliveryStatus;
  JS::Rooted<JS::Value> statusJsVal(aCx);
  for (uint32_t i = 0; i < length; ++i) {
    if (!JS_GetElement(aCx, deliveryStatusObj, i, &statusJsVal) ||
        !statusJsVal.isString()) {
      return NS_ERROR_INVALID_ARG;
    }

    nsDependentJSString statusStr;
    statusStr.init(aCx, statusJsVal.toString());

    DeliveryStatus status;
    if (statusStr.Equals(DELIVERY_STATUS_NOT_APPLICABLE)) {
      status = eDeliveryStatus_NotApplicable;
    } else if (statusStr.Equals(DELIVERY_STATUS_SUCCESS)) {
      status = eDeliveryStatus_Success;
    } else if (statusStr.Equals(DELIVERY_STATUS_PENDING)) {
      status = eDeliveryStatus_Pending;
    } else if (statusStr.Equals(DELIVERY_STATUS_ERROR)) {
      status = eDeliveryStatus_Error;
    } else if (statusStr.Equals(DELIVERY_STATUS_REJECTED)) {
      status = eDeliveryStatus_Reject;
    } else if (statusStr.Equals(DELIVERY_STATUS_MANUAL)) {
      status = eDeliveryStatus_Manual;
    } else {
      return NS_ERROR_INVALID_ARG;
    }

    deliveryStatus.AppendElement(status);
  }

  // Set |receivers|.
  if (!aReceivers.isObject()) {
    return NS_ERROR_INVALID_ARG;
  }
  JS::Rooted<JSObject*> receiversObj(aCx, &aReceivers.toObject());
  if (!JS_IsArrayObject(aCx, receiversObj)) {
    return NS_ERROR_INVALID_ARG;
  }

  JS_ALWAYS_TRUE(JS_GetArrayLength(aCx, receiversObj, &length));

  nsTArray<nsString> receivers;
  JS::Rooted<JS::Value> receiverJsVal(aCx);
  for (uint32_t i = 0; i < length; ++i) {
    if (!JS_GetElement(aCx, receiversObj, i, &receiverJsVal) ||
        !receiverJsVal.isString()) {
      return NS_ERROR_INVALID_ARG;
    }

    nsDependentJSString receiverStr;
    receiverStr.init(aCx, receiverJsVal.toString());
    receivers.AppendElement(receiverStr);
  }

  // Set |timestamp|.
  double timestamp;
  nsresult rv = convertTimeToDouble(aCx, aTimestamp, timestamp);
  NS_ENSURE_SUCCESS(rv, rv);

  // Set |attachments|.
  if (!aAttachments.isObject()) {
    return NS_ERROR_INVALID_ARG;
  }
  JS::Rooted<JSObject*> attachmentsObj(aCx, &aAttachments.toObject());
  if (!JS_IsArrayObject(aCx, attachmentsObj)) {
    return NS_ERROR_INVALID_ARG;
  }

  nsTArray<nsCOMPtr<nsIDOMMozMmsAttachment> > attachments;
  JS_ALWAYS_TRUE(JS_GetArrayLength(aCx, attachmentsObj, &length));

  JS::Rooted<JS::Value> attachmentJsVal(aCx);
  for (uint32_t i = 0; i < length; ++i) {
    if (!JS_GetElement(aCx, attachmentsObj, i, &attachmentJsVal)) {
      return NS_ERROR_INVALID_ARG;
    }

    nsCOMPtr<nsIDOMMozMmsAttachment> attachment;
    rv = MmsAttachment::Create(attachmentJsVal, aCx,
                               getter_AddRefs(attachment));
    NS_ENSURE_SUCCESS(rv, rv);

    attachments.AppendElement(attachment);
  }

  // Set |expiryDate|.
  double expiryDate;
  rv = convertTimeToDouble(aCx, aExpiryDate, expiryDate);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDOMMozMmsMessage> message = new MmsMessage(aId,
                                                         aThreadId,
                                                         delivery,
                                                         deliveryStatus,
                                                         aSender,
                                                         receivers,
                                                         timestamp,
                                                         aRead,
                                                         aSubject,
                                                         aSmil,
                                                         attachments,
                                                         expiryDate);
  message.forget(aMessage);
  return NS_OK;
}

bool
MmsMessage::GetData(ContentParent* aParent,
                    MmsMessageData& aData)
{
  NS_ASSERTION(aParent, "aParent is null");

  aData.id() = mId;
  aData.threadId() = mThreadId;
  aData.delivery() = mDelivery;
  aData.deliveryStatus() = mDeliveryStatus;
  aData.sender().Assign(mSender);
  aData.receivers() = mReceivers;
  aData.timestamp() = mTimestamp;
  aData.read() = mRead;
  aData.subject() = mSubject;
  aData.smil() = mSmil;
  aData.expiryDate() = mExpiryDate;

  aData.attachments().SetCapacity(mAttachments.Length());
  for (uint32_t i = 0; i < mAttachments.Length(); i++) {
    MmsAttachment* attachment =
      static_cast<MmsAttachment*>(mAttachments[i].get());
    if (!attachment->GetData(aParent, *aData.attachments().AppendElement())) {
      return false;
    }
  }

  return true;
}

NS_IMETHODIMP
MmsMessage::GetType(nsAString& aType)
{
  aType = NS_LITERAL_STRING("mms");
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetId(int32_t* aId)
{
  *aId = this->Id();
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetThreadId(uint64_t* aThreadId)
{
  *aThreadId = this->ThreadId();
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetDelivery(nsAString& aDelivery)
{
  switch (mDelivery) {
    case eDeliveryState_Received:
      aDelivery = DELIVERY_RECEIVED;
      break;
    case eDeliveryState_Sending:
      aDelivery = DELIVERY_SENDING;
      break;
    case eDeliveryState_Sent:
      aDelivery = DELIVERY_SENT;
      break;
    case eDeliveryState_Error:
      aDelivery = DELIVERY_ERROR;
      break;
    case eDeliveryState_NotDownloaded:
      aDelivery = DELIVERY_NOT_DOWNLOADED;
      break;
    case eDeliveryState_Unknown:
    case eDeliveryState_EndGuard:
    default:
      MOZ_CRASH("We shouldn't get any other delivery state!");
  }

  return NS_OK;
}

already_AddRefed<nsIDOMDOMStringList>
MmsMessage::DeliveryStatus() const
{
  // TODO Bug 850525 It'd be better to depend on the delivery of MmsMessage
  // to return a more correct value. Ex, if .delivery = 'received', we should
  // also make .deliveryStatus = null, since the .deliveryStatus is useless.
  uint32_t length = mDeliveryStatus.Length();
  if (length == 0) {
    return nullptr;
  }

  nsRefPtr<nsDOMStringList> deliveryStatus = new nsDOMStringList();
  for (uint32_t i = 0; i < length; ++i) {
    switch (mDeliveryStatus[i]) {
      case eDeliveryStatus_NotApplicable:
        deliveryStatus->Add(DELIVERY_STATUS_NOT_APPLICABLE);
        break;
      case eDeliveryStatus_Success:
        deliveryStatus->Add(DELIVERY_STATUS_SUCCESS);
        break;
      case eDeliveryStatus_Pending:
        deliveryStatus->Add(DELIVERY_STATUS_PENDING);
        break;
      case eDeliveryStatus_Error:
        deliveryStatus->Add(DELIVERY_STATUS_ERROR);
        break;
      case eDeliveryStatus_Reject:
        deliveryStatus->Add(DELIVERY_STATUS_REJECTED);
        break;
      case eDeliveryStatus_Manual:
        deliveryStatus->Add(DELIVERY_STATUS_MANUAL);
        break;
      case eDeliveryStatus_EndGuard:
      default:
        MOZ_CRASH("We shouldn't get any other delivery status!");
    }
  }

  return deliveryStatus.forget();
}

NS_IMETHODIMP
MmsMessage::GetDeliveryStatus(nsIDOMDOMStringList** aDeliveryStatus)
{
  nsRefPtr<nsIDOMDOMStringList> result = this->DeliveryStatus();
  result.forget(aDeliveryStatus);
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetSender(nsAString& aSender)
{
  aSender = mSender;
  return NS_OK;
}

already_AddRefed<nsIDOMDOMStringList>
MmsMessage::Receivers() const
{
  nsRefPtr<nsDOMStringList> receivers = new nsDOMStringList();

  for (uint32_t i = 0; i < mReceivers.Length(); i++) {
    receivers->Add(mReceivers[i]);
  }

  return receivers.forget();
}

NS_IMETHODIMP
MmsMessage::GetReceivers(nsIDOMDOMStringList** aReceivers)
{
  nsRefPtr<nsIDOMDOMStringList> result = this->Receivers();
  result.forget(aReceivers);
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetTimestamp(JSContext* cx, JS::Value* aDate)
{
  Date date = this->Timestamp();
  JSObject *obj = JS_NewDateObjectMsec(cx, date.TimeStamp());
  NS_ENSURE_TRUE(obj, NS_ERROR_FAILURE);

  *aDate = OBJECT_TO_JSVAL(obj);
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetRead(bool* aRead)
{
  *aRead = this->Read();
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetSubject(nsAString& aSubject)
{
  aSubject = mSubject;
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetSmil(nsAString& aSmil)
{
  aSmil = mSmil;
  return NS_OK;
}

already_AddRefed<MmsAttachmentList>
MmsMessage::Attachments() const
{
  nsRefPtr<MmsAttachmentList> attachments = mAttachments;
  return attachments.forget();
}

NS_IMETHODIMP
MmsMessage::GetAttachments(JSContext* aCx, JS::Value* aAttachments)
{
#if 0
  uint32_t length = mAttachments.Length();

  JS::Rooted<JSObject*> attachments(aCx, JS_NewArrayObject(aCx, length, nullptr));
  NS_ENSURE_TRUE(attachments, NS_ERROR_OUT_OF_MEMORY);

  for (uint32_t i = 0; i < length; ++i) {
    nsCOMPtr<nsIDOMMozMmsAttachment> &attachment = mAttachments[i];
    JS::Rooted<JS::Value> value(aCx);
    JS::Rooted<JSObject*> global(aCx, JS::CurrentGlobalOrNull(aCx));

    nsresult rv = nsContentUtils::WrapNative(aCx, global, attachment,
                                             &NS_GET_IID(nsIDOMMozMmsAttachment),
                                             &value);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!JS_SetElement(aCx, attachments, i, &value)) {
      return NS_ERROR_FAILURE;
    }
  }

  aAttachments->setObject(*attachments);
#endif
  return NS_OK;
}

NS_IMETHODIMP
MmsMessage::GetExpiryDate(JSContext* cx, JS::Value* aDate)
{
  Date date = this->ExpiryDate();
  JSObject *obj = JS_NewDateObjectMsec(cx, date.TimeStamp());
  NS_ENSURE_TRUE(obj, NS_ERROR_FAILURE);

  *aDate = OBJECT_TO_JSVAL(obj);
  return NS_OK;
}
