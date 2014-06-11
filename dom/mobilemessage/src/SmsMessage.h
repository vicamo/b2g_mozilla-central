/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_SmsMessage_h
#define mozilla_dom_mobilemessage_SmsMessage_h

#include "mozilla/Attributes.h"
#include "mozilla/dom/MozSmsMessageBinding.h"
#include "nsIMobileMessageService.h"
#include "nsString.h"
#include "nsWrapperCache.h"

namespace mozilla {
namespace dom {

namespace mobilemessage {

class SmsMessageData;

class MobileMessageCommon
{
public:
  MobileMessageCommon(MobileMessageType aType,
                      int32_t aId,
                      uint64_t aThreadId,
                      const nsAString& aIccId,
                      const nsAString& aSender,
                      uint64_t aTimestamp,
                      uint64_t aSentTimestamp,
                      bool aRead);

private:
  // Don't try to use the default constructor.
  MobileMessageCommon() MOZ_DELETE;

public:
  // WebIDL
  MobileMessageType Type() const { return mType; }
  int32_t Id() const { return mId; }
  uint64_t ThreadId() const { return mThreadId; }
  void GetIccId(nsAString& aIccId) const { aIccId = mIccId; }
  void GetSender(nsAString& aSender) const { aSender = mSender; }
  uint64_t Timestamp() const { return mTimestamp; }
  uint64_t SentTimestamp() const { return mSentTimestamp; }
  bool Read() const { return mRead; }

protected:
  MobileMessageType mType;
  int32_t mId;
  uint64_t mThreadId;
  nsString mIccId;
  nsString mSender;
  uint64_t mTimestamp;
  uint64_t mSentTimestamp;
  bool mRead;
};

} // namespace mobilemessage

class SmsMessage MOZ_FINAL : public nsISmsMessage
                           , public nsWrapperCache
                           , public mobilemessage::MobileMessageCommon
{
  typedef mobilemessage::SmsMessageData SmsMessageData;

public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(SmsMessage)

  NS_DECL_NSISMSMESSAGE

public:
  SmsMessage(int32_t aId,
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
             bool aRead);

  SmsMessage(const SmsMessageData& aData);

private:
  // Don't try to use the default constructor.
  SmsMessage() MOZ_DELETE;

public:
  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

public:
  // WebIDL

  static already_AddRefed<SmsMessage>
  Constructor(const GlobalObject& aGlobal,
              int32_t aId,
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
              bool aRead,
              ErrorResult& aRv);

  nsISupports* GetParentObject() const { return nullptr; }

  SmsDeliveryState Delivery() const { return mDelivery; }
  SmsDeliveryStatus DeliveryStatus() const { return mDeliveryStatus; }
  void GetReceiver(nsAString& aReceiver) const { aReceiver = mReceiver; }
  void GetBody(nsAString& aBody) const { aBody = mBody; }
  SmsMessageClass MessageClass() const { return mMessageClass; }
  uint64_t DeliveryTimestamp() const { return mDeliveryTimestamp; }

public:
  // IPC
  bool GetData(SmsMessageData& aData) const;

private:
  SmsDeliveryState mDelivery;
  SmsDeliveryStatus mDeliveryStatus;
  nsString mReceiver;
  nsString mBody;
  SmsMessageClass mMessageClass;
  uint64_t mDeliveryTimestamp;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_SmsMessage_h
