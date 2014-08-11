/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/Icc.h"

#include "mozilla/dom/MozIccBinding.h"
#include "mozilla/dom/MozStkCommandEvent.h"
#include "mozilla/dom/DOMRequest.h"
#include "mozilla/dom/ScriptSettings.h"
#include "nsIDOMIccInfo.h"
#include "nsJSON.h"
#include "nsRadioInterfaceLayer.h"
#include "nsServiceManagerUtils.h"

namespace mozilla {
namespace dom {

Icc::Icc(nsPIDOMWindow* aWindow,
         long aClientId,
         const nsAString& aIccId)
  : mLive(true)
  , mClientId(aClientId)
  , mIccId(aIccId)
{
  SetIsDOMBinding();
  BindToOwner(aWindow);

  mService = do_GetService(NS_RILCONTENTHELPER_CONTRACTID);

  // Not being able to acquire the provider isn't fatal since we check
  // for it explicitly below.
  if (!mService) {
    NS_WARNING("Could not acquire nsIIccService!");
  }
}

void
Icc::Shutdown()
{
  mService = nullptr;
  mLive = false;
}

nsresult
Icc::NotifyEvent(const nsAString& aName)
{
  return DispatchTrustedEvent(aName);
}

nsresult
Icc::NotifyStkEvent(const nsAString& aName,
                    const nsAString& aMessage)
{
  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.InitWithLegacyErrorReporting(GetOwner()))) {
    return NS_ERROR_UNEXPECTED;
  }
  JSContext* cx = jsapi.cx();
  JS::Rooted<JS::Value> value(cx);

  if (!aMessage.IsEmpty()) {
    nsCOMPtr<nsIJSON> json(new nsJSON());
    nsresult rv = json->DecodeToJSVal(aMessage, cx, &value);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    value = JS::NullValue();
  }

  MozStkCommandEventInit init;
  init.mBubbles = false;
  init.mCancelable = false;
  init.mCommand = value;

  nsRefPtr<MozStkCommandEvent> event =
    MozStkCommandEvent::Constructor(this, aName, init);

  return DispatchTrustedEvent(event);
}

// WrapperCache

JSObject*
Icc::WrapObject(JSContext* aCx)
{
  return MozIccBinding::Wrap(aCx, this);
}

// MozIcc WebIDL

already_AddRefed<nsIDOMMozIccInfo>
Icc::GetIccInfo() const
{
  if (!mService) {
    return nullptr;
  }

  nsCOMPtr<nsIDOMMozIccInfo> iccInfo;
  nsresult rv = mService->GetIccInfo(mClientId, getter_AddRefs(iccInfo));
  if (NS_FAILED(rv)) {
    return nullptr;
  }

  return iccInfo.forget();
}

Nullable<IccCardState>
Icc::GetCardState() const
{
  Nullable<IccCardState> result;

  uint32_t cardState = nsIIccService::CARD_STATE_UNDETECTED;
  if (mService &&
      NS_SUCCEEDED(mService->GetCardState(mClientId, &cardState)) &&
      cardState != nsIIccService::CARD_STATE_UNDETECTED) {
    MOZ_ASSERT(cardState < static_cast<uint32_t>(IccCardState::EndGuard_));
    result.SetValue(static_cast<IccCardState>(cardState));
  }

  return result;
}

void
Icc::SendStkResponse(const JSContext* aCx,
                     JS::Handle<JS::Value> aCommand,
                     JS::Handle<JS::Value> aResponse,
                     ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return;
  }

  nsresult rv = mService->SendStkResponse(mClientId, GetOwner(), aCommand,
                                          aResponse);
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
  }
}

void
Icc::SendStkMenuSelection(uint16_t aItemIdentifier,
                          bool aHelpRequested,
                          ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return;
  }

  nsresult rv = mService->SendStkMenuSelection(mClientId,
                                               GetOwner(),
                                               aItemIdentifier,
                                               aHelpRequested);
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
  }
}

void
Icc::SendStkTimerExpiration(const JSContext* aCx,
                            JS::Handle<JS::Value> aTimer,
                            ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return;
  }

  nsresult rv = mService->SendStkTimerExpiration(mClientId, GetOwner(), aTimer);
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
  }
}

void
Icc::SendStkEventDownload(const JSContext* aCx,
                          JS::Handle<JS::Value> aEvent,
                          ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return;
  }

  nsresult rv = mService->SendStkEventDownload(mClientId, GetOwner(), aEvent);
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
  }
}

already_AddRefed<DOMRequest>
Icc::GetCardLock(const nsAString& aLockType,
                 ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->GetCardLockState(mClientId, GetOwner(), aLockType,
                                           getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::UnlockCardLock(const JSContext* aCx,
                    JS::Handle<JS::Value> aInfo,
                    ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->UnlockCardLock(mClientId, GetOwner(), aInfo,
                                         getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::SetCardLock(const JSContext* aCx,
                 JS::Handle<JS::Value> aInfo,
                 ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->SetCardLock(mClientId, GetOwner(), aInfo,
                                      getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::GetCardLockRetryCount(const nsAString& aLockType,
                           ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->GetCardLockRetryCount(mClientId,
                                                GetOwner(),
                                                aLockType,
                                                getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::ReadContacts(const nsAString& aContactType,
                  ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->ReadContacts(mClientId, GetOwner(), aContactType,
                                       getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::UpdateContact(const JSContext* aCx,
                   const nsAString& aContactType,
                   JS::Handle<JS::Value> aContact,
                   const nsAString& aPin2,
                   ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->UpdateContact(mClientId, GetOwner(), aContactType,
                                        aContact, aPin2,
                                        getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::IccOpenChannel(const nsAString& aAid,
                    ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->IccOpenChannel(mClientId, GetOwner(), aAid,
                                         getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::IccExchangeAPDU(const JSContext* aCx,
                     int32_t aChannel,
                     JS::Handle<JS::Value> aApdu,
                     ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->IccExchangeAPDU(mClientId, GetOwner(), aChannel,
                                          aApdu, getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::IccCloseChannel(int32_t aChannel,
                     ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->IccCloseChannel(mClientId, GetOwner(), aChannel,
                                          getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

already_AddRefed<DOMRequest>
Icc::MatchMvno(const nsAString& aMvnoType,
               const nsAString& aMvnoData,
               ErrorResult& aRv)
{
  if (!mService) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<nsIDOMDOMRequest> request;
  nsresult rv = mService->MatchMvno(mClientId, GetOwner(),
                                    aMvnoType, aMvnoData,
                                    getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    aRv.Throw(rv);
    return nullptr;
  }

  return request.forget().downcast<DOMRequest>();
}

} // namespace dom
} // namespace mozilla
