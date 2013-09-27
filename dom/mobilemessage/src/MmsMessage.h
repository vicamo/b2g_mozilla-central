/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_MmsMessage_h
#define mozilla_dom_mobilemessage_MmsMessage_h

#include "mozilla/Attributes.h"
#include "mozilla/dom/Date.h"
#include "mozilla/dom/MmsAttachmentList.h"
#include "mozilla/dom/mobilemessage/Types.h"
#include "mozilla/dom/MozMobileMessageManagerBinding.h"
#include "nsIDOMDOMStringList.h"
#include "nsIDOMMozMmsAttachment.h"
#include "nsIDOMMozMmsMessage.h"
#include "nsString.h"

namespace mozilla {
namespace dom {

namespace mobilemessage {
class MmsMessageData;
} // namespace mobilemessage

class ContentParent;

class MmsMessage MOZ_FINAL : public nsIDOMMozMmsMessage
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIDOMMOZMMSMESSAGE

  MmsMessage(int32_t aId,
             const uint64_t aThreadId,
             mobilemessage::DeliveryState aDelivery,
             const nsTArray<mobilemessage::DeliveryStatus>& aDeliveryStatus,
             const nsAString& aSender,
             const nsTArray<nsString>& aReceivers,
             double aTimestamp,
             bool aRead,
             const nsAString& aSubject,
             const nsAString& aSmil,
             const nsTArray<nsCOMPtr<nsIDOMMozMmsAttachment> >& aAttachments,
             double aExpiryDate);

  MmsMessage(const mobilemessage::MmsMessageData& aData);

  static nsresult
  Create(int32_t aId,
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
         nsIDOMMozMmsMessage** aMessage);

  bool
  GetData(ContentParent* aParent,
          mobilemessage::MmsMessageData& aData);

  // WebIDL Interface
  int32_t
  Id() const
  {
    return mId;
  }

  uint64_t
  ThreadId() const
  {
    return mThreadId;
  }

  already_AddRefed<nsIDOMDOMStringList>
  DeliveryStatus() const;

  already_AddRefed<nsIDOMDOMStringList>
  Receivers() const;

  Date
  Timestamp() const
  {
    return mTimestamp;
  }

  bool
  Read() const
  {
    return mRead;
  }

  already_AddRefed<MmsAttachmentList>
  Attachments() const;

  Date
  ExpiryDate() const
  {
    return mExpiryDate;
  }

private:

  int32_t mId;
  uint64_t mThreadId;
  mobilemessage::DeliveryState mDelivery;
  nsTArray<mobilemessage::DeliveryStatus> mDeliveryStatus;
  nsString mSender;
  nsTArray<nsString> mReceivers;
  double mTimestamp;
  bool mRead;
  nsString mSubject;
  nsString mSmil;
  nsRefPtr<MmsAttachmentList> mAttachments;
  double mExpiryDate;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_MmsMessage_h
