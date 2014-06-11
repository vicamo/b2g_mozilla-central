/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_MmsMessage_h
#define mozilla_dom_mobilemessage_MmsMessage_h

#include "mozilla/Attributes.h"
#include "mozilla/dom/DOMStringList.h"
#include "mozilla/dom/MozMmsMessageBinding.h"
#include "mozilla/dom/MozMobileMessageManagerBinding.h"
#include "mozilla/dom/SmsMessage.h"
#include "nsIMobileMessageService.h"
#include "nsString.h"
#include "nsWrapperCache.h"

class nsIDOMBlob;

namespace mozilla {
namespace dom {

namespace mobilemessage {

class MmsDeliveryInfoData;
class MmsAttachmentData;
class MmsMessageData;

} // namespace mobilemessage

class ContentParent;

class MmsDeliveryInfo MOZ_FINAL : public nsISupports
                                , public nsWrapperCache
{
public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(MmsDeliveryInfo)

public:
  MmsDeliveryInfo(const nsAString& aReceiver,
                  MmsDeliveryStatus aDeliveryStatus,
                  uint64_t aDeliveryTimestamp,
                  MmsReadStatus aReadStatus,
                  uint64_t aReadTimestamp);

private:
  // Don't try to use the default constructor.
  MmsDeliveryInfo() MOZ_DELETE;

public:
  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

public:
  // WebIDL

  nsISupports* GetParentObject() const { return nullptr; }

  void GetReceiver(nsAString& aReceiver) const { aReceiver = mReceiver; }
  MmsDeliveryStatus DeliveryStatus() const { return mDeliveryStatus; }
  uint64_t DeliveryTimestamp() const { return mDeliveryTimestamp; }
  MmsReadStatus ReadStatus() const { return mReadStatus; }
  uint64_t ReadTimestamp() const { return mReadTimestamp; }

private:
  nsString mReceiver;
  MmsDeliveryStatus mDeliveryStatus;
  uint64_t mDeliveryTimestamp;
  MmsReadStatus mReadStatus;
  uint64_t mReadTimestamp;
};

class MmsDeliveryInfoArray MOZ_FINAL : public nsISupports
                                     , public nsWrapperCache
{
  typedef mobilemessage::MmsDeliveryInfoData MmsDeliveryInfoData;

public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(MmsDeliveryInfoArray)

public:
  MmsDeliveryInfoArray(const nsTArray<MmsDeliveryInfoData>& aItems);
  MmsDeliveryInfoArray(const nsTArray<MmsDeliveryInfoParameters>& aItems);

private:
  // Don't try to use the default constructor.
  MmsDeliveryInfoArray() MOZ_DELETE;

public:
  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

public:
  // WebIDL

  nsISupports* GetParentObject() const { return nullptr; }

  already_AddRefed<MmsDeliveryInfo> Item(uint32_t aIndex);
  uint32_t Length() const { return mItems.Length(); }
  already_AddRefed<MmsDeliveryInfo> IndexedGetter(uint32_t aIndex, bool& aFound) const;

private:
  nsTArray<nsRefPtr<MmsDeliveryInfo>> mItems;
};

class MmsAttachment MOZ_FINAL : public nsISupports
                              , public nsWrapperCache
{
public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(MmsAttachment)

public:
  MmsAttachment(const nsAString& aId,
                const nsAString& aLocation,
                nsIDOMBlob* aContent);

private:
  // Don't try to use the default constructor.
  MmsAttachment() MOZ_DELETE;

public:
  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

public:
  // WebIDL

  nsISupports* GetParentObject() const { return nullptr; }

  void GetId(nsAString& aId) const { aId = mId; }
  void GetLocation(nsAString& aLocation) const { aLocation = mLocation; }
  already_AddRefed<nsIDOMBlob> GetContent() const
  {
    return nsRefPtr<nsIDOMBlob>(mContent).forget();
  }

private:
  nsString mId;
  nsString mLocation;
  nsRefPtr<nsIDOMBlob> mContent;
};

class MmsAttachmentArray MOZ_FINAL : public nsISupports
                                   , public nsWrapperCache
{
  typedef mobilemessage::MmsAttachmentData MmsAttachmentData;

public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(MmsAttachmentArray)

public:
  MmsAttachmentArray(const nsTArray<MmsAttachmentData>& aItems);
  MmsAttachmentArray(const nsTArray<MmsAttachmentParameters>& aItems);

private:
  // Don't try to use the default constructor.
  MmsAttachmentArray() MOZ_DELETE;

public:
  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

public:
  // WebIDL

  nsISupports* GetParentObject() const { return nullptr; }

  already_AddRefed<MmsAttachment> Item(uint32_t aIndex);
  uint32_t Length() const { return mItems.Length(); }
  already_AddRefed<MmsAttachment> IndexedGetter(uint32_t aIndex, bool& aFound) const;

private:
  nsTArray<nsRefPtr<MmsAttachment>> mItems;
};

class MmsMessage MOZ_FINAL : public nsIMmsMessage
                           , public nsWrapperCache
                           , public mobilemessage::MobileMessageCommon
{
  typedef mobilemessage::MmsDeliveryInfoData MmsDeliveryInfoData;
  typedef mobilemessage::MmsAttachmentData MmsAttachmentData;
  typedef mobilemessage::MmsMessageData MmsMessageData;

public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(MmsMessage)

  NS_DECL_NSIMMSMESSAGE

public:
  MmsMessage(int32_t aId,
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
             bool aReadReportRequested);

  MmsMessage(const mobilemessage::MmsMessageData& aData);

private:
  // Don't try to use the default constructor.
  MmsMessage() MOZ_DELETE;

public:
  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

public:
  // WebIDL

  static already_AddRefed<MmsMessage>
  Constructor(const GlobalObject& aGlobal,
              int32_t aId,
              uint64_t aThreadId,
              const nsAString& aIccId,
              MmsDeliveryState aDelivery,
              const Sequence<MmsDeliveryInfoParameters>& aDeliveryInfo,
              const nsAString& aSender,
              const Sequence<nsString>& aReceivers,
              uint64_t aTimestamp,
              uint64_t aSentTimestamp,
              bool aRead,
              const nsAString& aSubject,
              const nsAString& aSmil,
              const Sequence<MmsAttachmentParameters>& aAttachments,
              uint64_t aExpiryDate,
              bool aReadReportRequested,
              ErrorResult& aRv);

  nsISupports* GetParentObject() const { return nullptr; }

  MmsDeliveryState Delivery() const { return mDelivery; }
  already_AddRefed<MmsDeliveryInfoArray> GetDeliveryInfo() const
  {
    return nsRefPtr<MmsDeliveryInfoArray>(mDeliveryInfo).forget();
  }
  already_AddRefed<DOMStringList> Receivers() const
  {
    return nsRefPtr<DOMStringList>(mReceivers).forget();
  }
  void GetSubject(nsAString& aSubject) const { aSubject = mSubject; }
  void GetSmil(nsAString& aSmil) const { aSmil = mSmil; }
  already_AddRefed<MmsAttachmentArray> GetAttachments() const
  {
    return nsRefPtr<MmsAttachmentArray>(mAttachments).forget();
  }
  uint64_t ExpiryDate() const { return mExpiryDate; }
  bool ReadReportRequested() const { return mReadReportRequested; }

public:
  // IPC
  bool GetData(ContentParent* aParent,
               MmsMessageData& aData) const;

private:
  MmsDeliveryState mDelivery;
  nsRefPtr<MmsDeliveryInfoArray> mDeliveryInfo;
  nsRefPtr<DOMStringList> mReceivers;
  nsString mSubject;
  nsString mSmil;
  nsRefPtr<MmsAttachmentArray> mAttachments;
  uint64_t mExpiryDate;
  bool mReadReportRequested;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_MmsMessage_h
