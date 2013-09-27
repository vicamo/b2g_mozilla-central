/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_MobileMessageManager_h
#define mozilla_dom_mobilemessage_MobileMessageManager_h

#include "mozilla/Attributes.h"
#include "mozilla/dom/DOMCursor.h"
#include "mozilla/dom/DOMRequest.h"
#include "mozilla/dom/MozMobileMessageManagerBinding.h"
#include "mozilla/ErrorResult.h"
#include "nsDOMEventTargetHelper.h"
#include "nsIObserver.h"

namespace mozilla {
namespace dom {

class MmsMessage;
class SmsFilter;
class SmsMessage;

class MobileMessageManager MOZ_FINAL : public nsDOMEventTargetHelper
                                     , public nsIObserver
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIOBSERVER

  NS_REALLY_FORWARD_NSIDOMEVENTTARGET(nsDOMEventTargetHelper)

  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(MobileMessageManager,
                                           nsDOMEventTargetHelper)

  void Init();
  void Shutdown();

  // WrapperCache
  nsPIDOMWindow*
  GetParentObject() const { return GetOwner(); }

  virtual JSObject*
  WrapObject(JSContext* aCx,
             JS::Handle<JSObject*> aScope) MOZ_OVERRIDE;

  // WebIDL Interface
  already_AddRefed<DOMRequest>
  GetSegmentInfoForText(const nsAString& aText,
                        ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  Send(const nsAString& aNumber,
       const nsAString& aText,
       ErrorResult& aRv);

  void
  Send(const Sequence<nsString>& aNumber,
       const nsAString& aText,
       nsTArray<nsRefPtr<DOMRequest> >& aRetVal,
       ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  SendMMS(const MmsParameters& aParams,
          ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  GetMessage(long aId,
             ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  Delete(long aId,
         ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  Delete(const MmsMessage& aMmsMessage,
         ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  Delete(const SmsMessage& aSmsMessage,
         ErrorResult& aRv);

  already_AddRefed<DOMCursor>
  GetMessages(const SmsFilter& aFilter,
              bool aReverse,
              ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  MarkMessageRead(long aId,
                  bool aValue,
                  ErrorResult& aRv);

  already_AddRefed<DOMCursor>
  GetThreads(ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  RetrieveMMS(long aId,
              ErrorResult& aRv);

  IMPL_EVENT_HANDLER(received)
  IMPL_EVENT_HANDLER(retrieving)
  IMPL_EVENT_HANDLER(sending)
  IMPL_EVENT_HANDLER(sent)
  IMPL_EVENT_HANDLER(failed)
  IMPL_EVENT_HANDLER(deliverysuccess)
  IMPL_EVENT_HANDLER(deliveryerror)

private:
#if 0
  /**
   * Internal Send() method used to send one message.
   */
  nsresult Send(JSContext* aCx, JS::Handle<JSObject*> aGlobal,
                JS::Handle<JSString*> aNumber,
                const nsAString& aMessage, JS::Value* aRequest);
#endif

  nsresult DispatchTrustedSmsEventToSelf(const char* aTopic,
                                         const nsAString& aEventName,
                                         nsISupports* aMsg);

#if 0
  /**
   * Helper to get message ID from SMS/MMS Message object
   */
  nsresult GetMessageId(AutoPushJSContext &aCx, const JS::Value &aMessage,
                        int32_t &aId);
#endif
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_MobileMessageManager_h
