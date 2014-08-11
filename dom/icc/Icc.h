/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_Icc_h
#define mozilla_dom_Icc_h

#include "mozilla/dom/MozIccBinding.h"
#include "mozilla/dom/MozStkCommandEventBinding.h"
#include "mozilla/DOMEventTargetHelper.h"
#include "nsIIccService.h"

namespace mozilla {
namespace dom {

class DOMRequest;

class Icc MOZ_FINAL : public DOMEventTargetHelper
{
public:
  NS_REALLY_FORWARD_NSIDOMEVENTTARGET(DOMEventTargetHelper)

  Icc(nsPIDOMWindow* aWindow,
      long aClientId,
      const nsAString& aIccId);

  void
  Shutdown();

  nsresult
  NotifyEvent(const nsAString& aName);

  nsresult
  NotifyStkEvent(const nsAString& aName,
                 const nsAString& aMessage);

  nsString
  GetIccId()
  {
    return mIccId;
  }

  nsPIDOMWindow*
  GetParentObject() const
  {
    return GetOwner();
  }

  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

  // MozIcc WebIDL
  already_AddRefed<nsIDOMMozIccInfo>
  GetIccInfo() const;

  Nullable<IccCardState>
  GetCardState() const;

  void
  SendStkResponse(const JSContext* aCx,
                  JS::Handle<JS::Value> aCommand,
                  JS::Handle<JS::Value> aResponse,
                  ErrorResult& aRv);

  void
  SendStkMenuSelection(uint16_t aItemIdentifier,
                       bool aHelpRequested,
                       ErrorResult& aRv);

  void
  SendStkTimerExpiration(const IccSendStkTimerExpirationOptions& aOptions,
                         ErrorResult& aRv);

  void
  SendStkEventDownload(const JSContext* aCx,
                       JS::Handle<JS::Value> aEvent,
                       ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  GetCardLock(IccCardLockType aLockType,
              ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  UnlockCardLock(const IccUnlockCardLockOptions& aOptions,
                 ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  SetCardLock(const IccSetCardLockOptions& aOptions,
              ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  GetCardLockRetryCount(IccCardLockType aLockType,
                        ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  ReadContacts(IccContactType aContactType,
               ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  UpdateContact(IccContactType aContactType,
                const IccUpdateContactContactOptions& aOptions,
                const nsAString& aPin2,
                ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  IccOpenChannel(const nsAString& aAid,
                 ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  IccExchangeAPDU(int32_t aChannel,
                  const IccExchangeAPDUOptions& aApdu,
                  ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  IccCloseChannel(int32_t aChannel,
                  ErrorResult& aRv);

  already_AddRefed<DOMRequest>
  MatchMvno(IccMvnoType aMvnoType,
            const nsAString& aMatchData,
            ErrorResult& aRv);

  IMPL_EVENT_HANDLER(iccinfochange)
  IMPL_EVENT_HANDLER(cardstatechange)
  IMPL_EVENT_HANDLER(stkcommand)
  IMPL_EVENT_HANDLER(stksessionend)

private:
  bool mLive;
  uint32_t mClientId;
  nsString mIccId;
  // mService is a xpcom service and will be released at shutdown, so it
  // doesn't need to be cycle collected.
  nsCOMPtr<nsIIccService> mService;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_icc_Icc_h
