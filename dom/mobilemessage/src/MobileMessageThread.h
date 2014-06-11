/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_MobileMessageThread_h
#define mozilla_dom_mobilemessage_MobileMessageThread_h

#include "mozilla/Attributes.h"
#include "mozilla/dom/DOMStringList.h"
#include "mozilla/dom/MozSmsMessageBinding.h" // For MobileMessageType
#include "nsIMobileMessageService.h"
#include "nsString.h"
#include "nsCOMPtr.h"

namespace mozilla {
namespace dom {

namespace mobilemessage {

class ThreadData;

} // namespace mobilemessage

class MobileMessageThread MOZ_FINAL : public nsIMobileMessageThread
                                    , public nsWrapperCache
{
  typedef mobilemessage::ThreadData ThreadData;

public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(MobileMessageThread)

  NS_DECL_NSIMOBILEMESSAGETHREAD

public:
  MobileMessageThread(uint64_t aId,
                      const nsTArray<nsString>& aParticipants,
                      uint64_t aTimestamp,
                      const nsAString& aLastMessageSubject,
                      const nsAString& aBody,
                      uint64_t aUnreadCount,
                      MobileMessageType aLastMessageType);

  MobileMessageThread(const ThreadData& aData);

private:
  // Don't try to use the default constructor.
  MobileMessageThread() MOZ_DELETE;

public:
  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

public:
  // WebIDL

  static already_AddRefed<MobileMessageThread>
  Constructor(const GlobalObject& aGlobal,
              uint64_t aId,
              const Sequence<nsString>& aParticipants,
              uint64_t aTimestamp,
              const nsAString& aLastMessageSubject,
              const nsAString& aBody,
              uint64_t aUnreadCount,
              MobileMessageType aLastMessageType,
              ErrorResult& aRv);

  nsISupports* GetParentObject() const { return nullptr; }

  uint64_t Id() const { return mId; }
  void GetLastMessageSubject(nsAString& aLastMessageSubject) const
  {
    aLastMessageSubject = mLastMessageSubject;
  }
  void GetBody(nsAString& aBody) const { aBody = mBody; }
  uint64_t UnreadCount() const { return mUnreadCount; }
  already_AddRefed<DOMStringList> Participants() const
  {
    return nsRefPtr<DOMStringList>(mParticipants).forget();
  }
  uint64_t Timestamp() const { return mTimestamp; }
  MobileMessageType LastMessageType() const { return mLastMessageType; }

public:
  // IPC
  bool GetData(ThreadData& aData) const;

private:
  uint64_t mId;
  nsString mLastMessageSubject;
  nsString mBody;
  uint64_t mUnreadCount;
  nsRefPtr<DOMStringList> mParticipants;
  uint64_t mTimestamp;
  MobileMessageType mLastMessageType;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_MobileMessageThread_h
