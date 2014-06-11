/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MmsMessage.h"

#include "jsapi.h" // For JS array APIs
#include "mozilla/dom/ContentParent.h"
#include "mozilla/dom/ipc/Blob.h"
#include "mozilla/dom/mobilemessage/Constants.h" // For MessageType
#include "mozilla/dom/mobilemessage/SmsTypes.h"
#include "nsDOMFile.h" // For nsDOMFileBase
#include "nsJSUtils.h" // For nsDependentJSString

namespace {

mozilla::dom::MmsDeliveryState
ToWebIdlMmsDeliveryState(mozilla::dom::mobilemessage::DeliveryState aIpcState)
{
  using mozilla::dom::MmsDeliveryState;
  using namespace mozilla::dom::mobilemessage;

  switch (aIpcState) {
    case eDeliveryState_Received:
      return MmsDeliveryState::Received;
    case eDeliveryState_Sending:
      return MmsDeliveryState::Sending;
    case eDeliveryState_Sent:
      return MmsDeliveryState::Sent;
    case eDeliveryState_Error:
      return MmsDeliveryState::Error;
    case eDeliveryState_NotDownloaded:
      return MmsDeliveryState::Not_downloaded;
    default:
      MOZ_CRASH("We shouldn't get any other ipdl mms delivery state!");
      break;
  }

  return MmsDeliveryState::EndGuard_;
}

mozilla::dom::mobilemessage::DeliveryState
ToIpdlDeliveryState(mozilla::dom::MmsDeliveryState aWebidlState)
{
  using mozilla::dom::MmsDeliveryState;
  using namespace mozilla::dom::mobilemessage;

  switch (aWebidlState) {
    case MmsDeliveryState::Received:
      return eDeliveryState_Received;
    case MmsDeliveryState::Sending:
      return eDeliveryState_Sending;
    case MmsDeliveryState::Sent:
      return eDeliveryState_Sent;
    case MmsDeliveryState::Error:
      return eDeliveryState_Error;
    case MmsDeliveryState::Not_downloaded:
      return eDeliveryState_NotDownloaded;
    default:
      MOZ_CRASH("We shouldn't get any other webidl mms delivery state!");
      break;
  }

  return eDeliveryState_EndGuard;
}

mozilla::dom::MmsDeliveryStatus
ToWebIdlMmsDeliveryStatus(mozilla::dom::mobilemessage::DeliveryStatus aIpcStatus)
{
  using mozilla::dom::MmsDeliveryStatus;
  using namespace mozilla::dom::mobilemessage;

  switch (aIpcStatus) {
    case eDeliveryStatus_NotApplicable:
      return MmsDeliveryStatus::Not_applicable;
    case eDeliveryStatus_Success:
      return MmsDeliveryStatus::Success;
    case eDeliveryStatus_Pending:
      return MmsDeliveryStatus::Pending;
    case eDeliveryStatus_Error:
      return MmsDeliveryStatus::Error;
    case eDeliveryStatus_Reject:
      return MmsDeliveryStatus::Reject;
    case eDeliveryStatus_Manual:
      return MmsDeliveryStatus::Manual;
    default:
      MOZ_CRASH("We shouldn't get any other ipdl mms delivery status!");
      break;
  }

  return MmsDeliveryStatus::EndGuard_;
}

mozilla::dom::mobilemessage::DeliveryStatus
ToIpdlDeliveryStatus(mozilla::dom::MmsDeliveryStatus aWebidlStatus)
{
  using mozilla::dom::MmsDeliveryStatus;
  using namespace mozilla::dom::mobilemessage;

  switch (aWebidlStatus) {
    case MmsDeliveryStatus::Not_applicable:
      return eDeliveryStatus_NotApplicable;
    case MmsDeliveryStatus::Success:
      return eDeliveryStatus_Success;
    case MmsDeliveryStatus::Pending:
      return eDeliveryStatus_Pending;
    case MmsDeliveryStatus::Error:
      return eDeliveryStatus_Error;
    case MmsDeliveryStatus::Reject:
      return eDeliveryStatus_Reject;
    case MmsDeliveryStatus::Manual:
      return eDeliveryStatus_Manual;
    default:
      MOZ_CRASH("We shouldn't get any other webidl mms delivery status!");
      break;
  }

  return eDeliveryStatus_EndGuard;
}

mozilla::dom::MmsReadStatus
ToWebIdlMmsReadStatus(mozilla::dom::mobilemessage::ReadStatus aIpcStatus)
{
  using mozilla::dom::MmsReadStatus;
  using namespace mozilla::dom::mobilemessage;

  switch (aIpcStatus) {
    case eReadStatus_NotApplicable:
      return MmsReadStatus::Not_applicable;
    case eReadStatus_Success:
      return MmsReadStatus::Success;
    case eReadStatus_Pending:
      return MmsReadStatus::Pending;
    case eReadStatus_Error:
      return MmsReadStatus::Error;
    default:
      MOZ_CRASH("We shouldn't get any other ipdl mms read status!");
      break;
  }

  return MmsReadStatus::EndGuard_;
}

mozilla::dom::mobilemessage::ReadStatus
ToIpdlReadStatus(mozilla::dom::MmsReadStatus aWebidlStatus)
{
  using mozilla::dom::MmsReadStatus;
  using namespace mozilla::dom::mobilemessage;

  switch (aWebidlStatus) {
    case MmsReadStatus::Not_applicable:
      return eReadStatus_NotApplicable;
    case MmsReadStatus::Success:
      return eReadStatus_Success;
    case MmsReadStatus::Pending:
      return eReadStatus_Pending;
    case MmsReadStatus::Error:
      return eReadStatus_Error;
    default:
      MOZ_CRASH("We shouldn't get any other webidl mms read status!");
      break;
  }

  return eReadStatus_EndGuard;
}

} // anonymous namespace

namespace mozilla {
namespace dom {

/**
 * MmsDeliveryInfo
 */

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE_0(MmsDeliveryInfo)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MmsDeliveryInfo)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(MmsDeliveryInfo)
NS_IMPL_CYCLE_COLLECTING_RELEASE(MmsDeliveryInfo)

MmsDeliveryInfo::MmsDeliveryInfo(const nsAString& aReceiver,
                                 MmsDeliveryStatus aDeliveryStatus,
                                 uint64_t aDeliveryTimestamp,
                                 MmsReadStatus aReadStatus,
                                 uint64_t aReadTimestamp)
  : mReceiver(aReceiver)
  , mDeliveryStatus(aDeliveryStatus)
  , mDeliveryTimestamp(aDeliveryTimestamp)
  , mReadStatus(aReadStatus)
  , mReadTimestamp(aReadTimestamp)
{
  SetIsDOMBinding();
}

JSObject*
MmsDeliveryInfo::WrapObject(JSContext* aCx)
{
  return MozMmsDeliveryInfoBinding::Wrap(aCx, this);
}

/**
 * MmsDeliveryInfoArray
 */

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(MmsDeliveryInfoArray, mItems)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MmsDeliveryInfoArray)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(MmsDeliveryInfoArray)
NS_IMPL_CYCLE_COLLECTING_RELEASE(MmsDeliveryInfoArray)

MmsDeliveryInfoArray::MmsDeliveryInfoArray(const nsTArray<MmsDeliveryInfoData>& aItems)
{
  for (uint32_t index = 0; index < aItems.Length(); ++index) {
    const MmsDeliveryInfoData &data = aItems[index];

    mItems.AppendElement(new MmsDeliveryInfo(data.receiver(),
                                             ToWebIdlMmsDeliveryStatus(data.deliveryStatus()),
                                             data.deliveryTimestamp(),
                                             ToWebIdlMmsReadStatus(data.readStatus()),
                                             data.readTimestamp()));
  }

  SetIsDOMBinding();
}

MmsDeliveryInfoArray::MmsDeliveryInfoArray(const nsTArray<MmsDeliveryInfoParameters>& aItems)
{
  for (uint32_t index = 0; index < aItems.Length(); ++index) {
    const MmsDeliveryInfoParameters &params = aItems[index];

    MmsDeliveryStatus deliveryStatus(MmsDeliveryStatus::Not_applicable);
    if (!params.mDeliveryStatus.IsNull()) {
      deliveryStatus = params.mDeliveryStatus.Value();
    }

    uint64_t deliveryTimestamp =
      params.mDeliveryTimestamp.IsNull() ? 0 : params.mDeliveryTimestamp.Value();

    MmsReadStatus readStatus = MmsReadStatus::Not_applicable;
    if (!params.mReadStatus.IsNull()) {
      readStatus = params.mReadStatus.Value();
    }

    uint64_t readTimestamp =
      params.mReadTimestamp.IsNull() ? 0 : params.mReadTimestamp.Value();

    mItems.AppendElement(new MmsDeliveryInfo(params.mReceiver, deliveryStatus,
                                             deliveryTimestamp, readStatus,
                                             readTimestamp));
  }

  SetIsDOMBinding();
}

JSObject*
MmsDeliveryInfoArray::WrapObject(JSContext* aCx)
{
  return MozMmsDeliveryInfoArrayBinding::Wrap(aCx, this);
}

already_AddRefed<MmsDeliveryInfo>
MmsDeliveryInfoArray::Item(uint32_t aIndex)
{
  nsRefPtr<MmsDeliveryInfo> result;

  if (aIndex < mItems.Length()) {
    result = mItems[aIndex];
  }

  return result.forget();
}

already_AddRefed<MmsDeliveryInfo>
MmsDeliveryInfoArray::IndexedGetter(uint32_t aIndex,
                                    bool& aFound) const
{
  nsRefPtr<MmsDeliveryInfo> result;

  if (aIndex < mItems.Length()) {
    aFound = true;
    result = mItems[aIndex];
  } else {
    aFound = false;
  }

  return result.forget();
}

/**
 * MmsAttachment
 */

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(MmsAttachment, mContent)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MmsAttachment)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(MmsAttachment)
NS_IMPL_CYCLE_COLLECTING_RELEASE(MmsAttachment)

MmsAttachment::MmsAttachment(const nsAString& aId,
                             const nsAString& aLocation,
                             nsIDOMBlob* aContent)
  : mId(aId)
  , mLocation(aLocation)
  , mContent(aContent)
{
  SetIsDOMBinding();
}

JSObject*
MmsAttachment::WrapObject(JSContext* aCx)
{
  return MozMmsAttachmentBinding::Wrap(aCx, this);
}

/**
 * MmsAttachmentArray
 */

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(MmsAttachmentArray, mItems)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MmsAttachmentArray)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(MmsAttachmentArray)
NS_IMPL_CYCLE_COLLECTING_RELEASE(MmsAttachmentArray)

MmsAttachmentArray::MmsAttachmentArray(const nsTArray<MmsAttachmentData>& aItems)
{
  for (uint32_t index = 0; index < aItems.Length(); ++index) {
    const MmsAttachmentData &data = aItems[index];

    nsRefPtr<nsIDOMBlob> content;
    if (data.contentParent()) {
      content = static_cast<BlobParent*>(data.contentParent())->GetBlob();
    } else if (data.contentChild()) {
      content = static_cast<BlobChild*>(data.contentChild())->GetBlob();
    } else {
      NS_WARNING("MmsMessage: Unable to get attachment content.");
    }

    mItems.AppendElement(new MmsAttachment(data.id(), data.location(), content));
  }

  SetIsDOMBinding();
}

MmsAttachmentArray::MmsAttachmentArray(const nsTArray<MmsAttachmentParameters>& aItems)
{
  for (uint32_t index = 0; index < aItems.Length(); ++index) {
    const MmsAttachmentParameters &params = aItems[index];
    mItems.AppendElement(new MmsAttachment(params.mId,
                                           params.mLocation,
                                           params.mContent));
  }

  SetIsDOMBinding();
}

JSObject*
MmsAttachmentArray::WrapObject(JSContext* aCx)
{
  return MozMmsAttachmentArrayBinding::Wrap(aCx, this);
}

already_AddRefed<MmsAttachment>
MmsAttachmentArray::Item(uint32_t aIndex)
{
  nsRefPtr<MmsAttachment> result;

  if (aIndex < mItems.Length()) {
    result = mItems[aIndex];
  }

  return result.forget();
}

already_AddRefed<MmsAttachment>
MmsAttachmentArray::IndexedGetter(uint32_t aIndex,
                                  bool& aFound) const
{
  nsRefPtr<MmsAttachment> result;

  if (aIndex < mItems.Length()) {
    aFound = true;
    result = mItems[aIndex];
  } else {
    aFound = false;
  }

  return result.forget();
}

/**
 * MmsMessage
 */

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(MmsMessage,
                                      mDeliveryInfo, mReceivers, mAttachments)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MmsMessage)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
  NS_INTERFACE_MAP_ENTRY(nsIMmsMessage)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(MmsMessage)
NS_IMPL_CYCLE_COLLECTING_RELEASE(MmsMessage)

MmsMessage::MmsMessage(int32_t aId,
                       uint64_t aThreadId,
                       const nsAString& aIccId,
                       MmsDeliveryState aDelivery,
                       const nsTArray<MmsDeliveryInfoParameters>& aDeliveryInfo,
                       const nsAString& aSender,
                       const nsTArray<nsString>& aReceivers,
                       uint64_t aTimestamp,
                       uint64_t aSentTimestamp,
                       bool aRead,
                       const nsAString& aSubject,
                       const nsAString& aSmil,
                       const nsTArray<MmsAttachmentParameters>& aAttachments,
                       uint64_t aExpiryDate,
                       bool aReadReportRequested)
  : MobileMessageCommon(MobileMessageType::Mms, aId, aThreadId, aIccId, aSender,
                        aTimestamp, aSentTimestamp, aRead)
  , mDelivery(aDelivery)
  , mReceivers(new DOMStringList())
  , mSubject(aSubject)
  , mSmil(aSmil)
  , mExpiryDate(aExpiryDate)
  , mReadReportRequested(aReadReportRequested)
{
  if (aDeliveryInfo.Length()) {
    mDeliveryInfo = new MmsDeliveryInfoArray(aDeliveryInfo);
  }

  mReceivers->StringArray() = aReceivers;

  if (aAttachments.Length()) {
    mAttachments = new MmsAttachmentArray(aAttachments);
  }

  SetIsDOMBinding();
}

MmsMessage::MmsMessage(const mobilemessage::MmsMessageData& aData)
  : MobileMessageCommon(MobileMessageType::Mms, aData.id(), aData.threadId(),
                        aData.iccId(), aData.sender(), aData.timestamp(),
                        aData.sentTimestamp(), aData.read())
  , mDelivery(ToWebIdlMmsDeliveryState(aData.delivery()))
  , mReceivers(new DOMStringList())
  , mSubject(aData.subject())
  , mSmil(aData.smil())
  , mExpiryDate(aData.expiryDate())
  , mReadReportRequested(aData.readReportRequested())
{
  if (aData.deliveryInfo().Length()) {
    mDeliveryInfo = new MmsDeliveryInfoArray(aData.deliveryInfo());
  }

  mReceivers->StringArray() = aData.receivers();

  if (aData.attachments().Length()) {
    mAttachments = new MmsAttachmentArray(aData.attachments());
  }

  SetIsDOMBinding();
}

/* static */ nsresult
MmsMessage::Create(int32_t aId,
                   uint64_t aThreadId,
                   const nsAString& aIccId,
                   const nsAString& aDelivery,
                   const JS::Value& aDeliveryInfo,
                   const nsAString& aSender,
                   const JS::Value& aReceivers,
                   uint64_t aTimestamp,
                   uint64_t aSentTimestamp,
                   bool aRead,
                   const nsAString& aSubject,
                   const nsAString& aSmil,
                   const JS::Value& aAttachments,
                   uint64_t aExpiryDate,
                   bool aIsReadReportRequested,
                   JSContext* aCx,
                   nsIMmsMessage** aMessage)
{
  *aMessage = nullptr;

  // Set |delivery|.
  MmsDeliveryState delivery;
  if (aDelivery.Equals(DELIVERY_SENT)) {
    delivery = MmsDeliveryState::Sent;
  } else if (aDelivery.Equals(DELIVERY_RECEIVED)) {
    delivery = MmsDeliveryState::Received;
  } else if (aDelivery.Equals(DELIVERY_SENDING)) {
    delivery = MmsDeliveryState::Sending;
  } else if (aDelivery.Equals(DELIVERY_NOT_DOWNLOADED)) {
    delivery = MmsDeliveryState::Not_downloaded;
  } else if (aDelivery.Equals(DELIVERY_ERROR)) {
    delivery = MmsDeliveryState::Error;
  } else {
    return NS_ERROR_INVALID_ARG;
  }

  // Set |deliveryInfo|.
  if (!aDeliveryInfo.isObject()) {
    return NS_ERROR_INVALID_ARG;
  }
  JS::Rooted<JSObject*> deliveryInfoObj(aCx, &aDeliveryInfo.toObject());
  if (!JS_IsArrayObject(aCx, deliveryInfoObj)) {
    return NS_ERROR_INVALID_ARG;
  }

  uint32_t length;
  MOZ_ALWAYS_TRUE(JS_GetArrayLength(aCx, deliveryInfoObj, &length));

  FallibleTArray<MmsDeliveryInfoParameters> deliveryInfo;
  NS_ENSURE_TRUE(deliveryInfo.SetLength(length), NS_ERROR_OUT_OF_MEMORY);

  JS::Rooted<JS::Value> infoJsVal(aCx);
  for (uint32_t i = 0; i < length; ++i) {
    if (!JS_GetElement(aCx, deliveryInfoObj, i, &infoJsVal) ||
        !infoJsVal.isObject()) {
      return NS_ERROR_INVALID_ARG;
    }

    MmsDeliveryInfoParameters &info = deliveryInfo[i];
    if (!info.Init(aCx, infoJsVal)) {
      return NS_ERROR_TYPE_ERR;
    }
  }

  // Set |receivers|.
  if (!aReceivers.isObject()) {
    return NS_ERROR_INVALID_ARG;
  }
  JS::Rooted<JSObject*> receiversObj(aCx, &aReceivers.toObject());
  if (!JS_IsArrayObject(aCx, receiversObj)) {
    return NS_ERROR_INVALID_ARG;
  }

  MOZ_ALWAYS_TRUE(JS_GetArrayLength(aCx, receiversObj, &length));

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

  // Set |attachments|.
  if (!aAttachments.isObject()) {
    return NS_ERROR_INVALID_ARG;
  }
  JS::Rooted<JSObject*> attachmentsObj(aCx, &aAttachments.toObject());
  if (!JS_IsArrayObject(aCx, attachmentsObj)) {
    return NS_ERROR_INVALID_ARG;
  }

  MOZ_ALWAYS_TRUE(JS_GetArrayLength(aCx, attachmentsObj, &length));

  FallibleTArray<MmsAttachmentParameters> attachments;
  NS_ENSURE_TRUE(attachments.SetLength(length), NS_ERROR_OUT_OF_MEMORY);

  JS::Rooted<JS::Value> attachmentJsVal(aCx);
  for (uint32_t i = 0; i < length; ++i) {
    if (!JS_GetElement(aCx, attachmentsObj, i, &attachmentJsVal)) {
      return NS_ERROR_INVALID_ARG;
    }

    MmsAttachmentParameters &attachment = attachments[i];
    if (!attachment.Init(aCx, attachmentJsVal)) {
      return NS_ERROR_TYPE_ERR;
    }
  }

  nsCOMPtr<nsIMmsMessage> message =
    new MmsMessage(aId, aThreadId, aIccId, delivery, deliveryInfo, aSender,
                   receivers, aTimestamp, aSentTimestamp, aRead, aSubject,
                   aSmil, attachments, aExpiryDate, aIsReadReportRequested);
  message.forget(aMessage);

  return NS_OK;
}

JSObject*
MmsMessage::WrapObject(JSContext* aCx)
{
  return MozMmsMessageBinding::Wrap(aCx, this);
}

bool
MmsMessage::GetData(ContentParent* aParent,
                    mobilemessage::MmsMessageData& aData) const
{
  using mobilemessage::DeliveryStatus;
  using mobilemessage::ReadStatus;

  NS_ASSERTION(aParent, "aParent is null");

  aData.id() = mId;
  aData.threadId() = mThreadId;
  aData.iccId() = mIccId;
  aData.delivery() = ToIpdlDeliveryState(mDelivery);
  aData.sender().Assign(mSender);
  aData.receivers() = mReceivers->StringArray();
  aData.timestamp() = mTimestamp;
  aData.sentTimestamp() = mSentTimestamp;
  aData.read() = mRead;
  aData.subject() = mSubject;
  aData.smil() = mSmil;
  aData.expiryDate() = mExpiryDate;
  aData.readReportRequested() = mReadReportRequested;

  uint32_t length = mDeliveryInfo ? mDeliveryInfo->Length() : 0;
  FallibleTArray<MmsDeliveryInfoData> deliveryInfo;
  NS_ENSURE_TRUE(deliveryInfo.SetLength(length), NS_ERROR_OUT_OF_MEMORY);

  for (uint32_t i = 0; i < length; i++) {
    MmsDeliveryInfoData &infoData = deliveryInfo[i];
    nsRefPtr<MmsDeliveryInfo> info(mDeliveryInfo->Item(i));

    info->GetReceiver(infoData.receiver());
    infoData.deliveryStatus() = ToIpdlDeliveryStatus(info->DeliveryStatus());
    infoData.deliveryTimestamp() = info->DeliveryTimestamp();
    infoData.readStatus() = ToIpdlReadStatus(info->ReadStatus());
    infoData.readTimestamp() = info->ReadTimestamp();
  }
  aData.deliveryInfo().SwapElements(deliveryInfo);

  length = mAttachments ? mAttachments->Length() : 0;
  FallibleTArray<MmsAttachmentData> attachments;
  NS_ENSURE_TRUE(attachments.SetLength(length), NS_ERROR_OUT_OF_MEMORY);

  for (uint32_t i = 0; i < length; i++) {
    MmsAttachmentData& attachmentData = attachments[i];
    nsRefPtr<MmsAttachment> attachment(mAttachments->Item(i));

    attachment->GetId(attachmentData.id());
    attachment->GetLocation(attachmentData.location());

    // This is a workaround. Sometimes the blob we get from the database
    // doesn't have a valid last modified date, making the ContentParent
    // send a "Mystery Blob" to the ContentChild. Attempting to get the
    // last modified date of blob can force that value to be initialized.
    nsRefPtr<nsIDOMBlob> content(attachment->GetContent());
    nsDOMFileBase* file = static_cast<nsDOMFileBase*>(content.get());
    if (file->IsDateUnknown()) {
      uint64_t date;
      if (NS_FAILED(file->GetMozLastModifiedDate(&date))) {
        NS_WARNING("Failed to get last modified date!");
      }
    }

    attachmentData.contentParent() = aParent->GetOrCreateActorForBlob(content);
    if (!attachmentData.contentParent()) {
      return false;
    }
  }
  aData.attachments().SwapElements(attachments);

  return true;
}

} // namespace dom
} // namespace mozilla
