/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "IccCallback.h"

#include "EnumHelpers.h"
#include "mozilla/dom/ContactsBinding.h"
#include "mozilla/dom/IccCardLockError.h"
#include "mozilla/dom/ToJSValue.h"
#include "nsIDOMDOMCursor.h" // For nsICursorContinueCallback
#include "nsIRadioInterfaceLayer.h" // For nsIRilCallback

namespace mozilla {
namespace dom {
namespace icc {

namespace {

nsresult
populateOptionalNullableSequenceString(Optional<Nullable<Sequence<nsString>>>& aOptional,
                                       const char16_t** aRhs,
                                       const uint32_t aLength)
{
  if (!aLength) {
    return NS_OK;
  }

  aOptional.Construct().SetValue();

  Sequence<nsString>& array = aOptional.Value().Value();
  array.SetCapacity(aLength);
  for (uint32_t i = 0; i < aLength; i++) {
    NS_ENSURE_ARG_POINTER(aRhs[i]);

    array.AppendElement(nsDependentString(aRhs[i]));
  }

  return NS_OK;
}

nsresult
populateOptionalNullableSequenceContactField(Optional<Nullable<Sequence<ContactField>>>& aOptional,
                                             const char16_t** aRhs,
                                             const uint32_t aLength)
{
  if (!aLength) {
    return NS_OK;
  }

  aOptional.Construct().SetValue();

  Sequence<ContactField>& array = aOptional.Value().Value();
  array.SetCapacity(aLength);
  for (uint32_t i = 0; i < aLength; i++) {
    NS_ENSURE_ARG_POINTER(aRhs[i]);

    ContactField* field = array.AppendElement();
    NS_ENSURE_TRUE(field, NS_ERROR_OUT_OF_MEMORY);

    field->mValue.Construct(nsDependentString(aRhs[i]));
  }

  return NS_OK;
}

nsresult
populateOptionalNullableSequenceContactTelField(Optional<Nullable<Sequence<ContactTelField>>>& aOptional,
                                             const char16_t** aRhs,
                                             const uint32_t aLength)
{
  if (!aLength) {
    return NS_OK;
  }

  aOptional.Construct().SetValue();

  Sequence<ContactTelField>& array = aOptional.Value().Value();
  array.SetCapacity(aLength);
  for (uint32_t i = 0; i < aLength; i++) {
    NS_ENSURE_ARG_POINTER(aRhs[i]);

    ContactTelField* field = array.AppendElement();
    NS_ENSURE_TRUE(field, NS_ERROR_OUT_OF_MEMORY);

    field->mValue.Construct(nsDependentString(aRhs[i]));
  }

  return NS_OK;
}

} // Anonymous namespace

NS_IMPL_ISUPPORTS(IccCallback, nsIIccCallback);

IccCallback::IccCallback(DOMRequest* aDOMRequest)
  : mDOMRequest(aDOMRequest)
{
}

IccCallback::~IccCallback()
{
}

template<typename T>
nsresult
IccCallback::NotifySuccess(const T& aResult)
{
  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.Init(mDOMRequest->GetOwner()))) {
    return NotifyError(nsIRilCallback::ERROR_GENERIC_FAILURE);
  }

  JSContext* cx = jsapi.cx();
  JS::Rooted<JS::Value> val(cx);
  if (!ToJSValue(cx, aResult, &val)) {
    JS_ClearPendingException(cx);
    return NotifyError(nsIRilCallback::ERROR_GENERIC_FAILURE);
  }

  mDOMRequest->FireSuccess(val);
  return NS_OK;
}

template<typename T>
nsresult
IccCallback::NotifyCardLockSuccess(T& aResult,
                                   uint32_t aLockType)
{
  MOZ_ASSERT(aLockType <= nsIIccService::CARD_LOCK_TYPE_FDN);

  aResult.mLockType = ToWebidlEnum<IccCardLockType>(aLockType);
  aResult.mSuccess = true;
  return NotifySuccess(aResult);
}

NS_IMETHODIMP
IccCallback::NotifySuccess()
{
  if (mCursorContinueCallback) {
    // TODO: Bug 935398 - Use DOMCursor for icc.readContacts.
    nsresult rv = NotifySuccess(mContacts);

    mContacts.Clear();
    return rv;
  }

  mDOMRequest->FireSuccess(JS::UndefinedHandleValue);
  return NS_OK;
}

NS_IMETHODIMP
IccCallback::NotifyError(uint32_t aError)
{
  NS_ENSURE_ARG(aError <= nsIRilCallback::ERROR_UNSUPPORTED_CARD_LOCK);

  if (mCursorContinueCallback) {
    // TODO: Bug 935398 - Use DOMCursor for icc.readContacts.
    mContacts.Clear();
  }

  mDOMRequest->FireError(ToString(ToWebidlEnum<IccErrorNames>(aError)));
  return NS_OK;
}

NS_IMETHODIMP
IccCallback::NotifyGetCardLockStateSuccess(uint32_t aLockType,
                                           bool aEnabled)
{
  NS_ENSURE_ARG(aLockType <= nsIIccService::CARD_LOCK_TYPE_FDN);

  IccGetCardLockResult result;
  result.mEnabled = aEnabled;
  return NotifyCardLockSuccess(result, aLockType);
}

NS_IMETHODIMP
IccCallback::NotifySetCardLockSuccess(uint32_t aLockType)
{
  NS_ENSURE_ARG(aLockType <= nsIIccService::CARD_LOCK_TYPE_FDN);

  IccCardLockResult result;
  return NotifyCardLockSuccess(result, aLockType);
}

NS_IMETHODIMP
IccCallback::NotifySetCardLockError(uint32_t aLockType,
                                    uint32_t aError,
                                    int16_t aRetryCount)
{
  NS_ENSURE_ARG(aLockType <= nsIIccService::CARD_LOCK_TYPE_FDN);
  NS_ENSURE_ARG(aError <= nsIRilCallback::ERROR_UNSUPPORTED_CARD_LOCK);

  nsRefPtr<IccCardLockError> error =
    new IccCardLockError(mDOMRequest->GetOwner(),
                         ToWebidlEnum<IccErrorNames>(aError),
                         ToWebidlEnum<IccCardLockType>(aLockType),
                         aRetryCount);

  mDOMRequest->FireDetailedError(error);
  return NS_OK;
}

NS_IMETHODIMP
IccCallback::NotifyGetCardLockRetryCountSuccess(uint32_t aLockType,
                                                int16_t aRetryCount)
{
  NS_ENSURE_ARG(aLockType <= nsIIccService::CARD_LOCK_TYPE_FDN);
  NS_ENSURE_ARG(aRetryCount >= 0);

  IccGetCardLockRetryCountResult result;
  result.mRetryCount = aRetryCount;
  return NotifyCardLockSuccess(result, aLockType);
}

NS_IMETHODIMP
IccCallback::NotifyContactSuccess(const nsAString& aId,
                                  const char16_t** aNames,
                                  uint32_t aNameCount,
                                  const char16_t** aTels,
                                  uint32_t aTelCount,
                                  const char16_t** aEmails,
                                  uint32_t aEmailCount)
{
  NS_ENSURE_ARG(!aNameCount || aNames);
  NS_ENSURE_ARG(!aTelCount || aTels);
  NS_ENSURE_ARG(!aEmailCount || aEmails);
  NS_ENSURE_ARG(aNameCount || aTelCount || aEmailCount);

  // Setup ContactProperties.

  ContactProperties props;
  nsresult rv;
  rv = populateOptionalNullableSequenceString(props.mName,
                                              aNames, aNameCount);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = populateOptionalNullableSequenceContactTelField(props.mTel,
                                                       aTels, aTelCount);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = populateOptionalNullableSequenceContactField(props.mEmail,
                                                    aEmails, aEmailCount);
  NS_ENSURE_SUCCESS(rv, rv);

  // Create mozContact.

  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.Init(mDOMRequest->GetOwner()))) {
    return NS_ERROR_FAILURE;
  }

  JSContext* cx = jsapi.cx();
  JS::Rooted<JSObject*> gobj(cx, JS::CurrentGlobalOrNull(cx));
  GlobalObject global(cx, gobj);
  NS_ENSURE_TRUE(!global.Failed(), NS_ERROR_FAILURE);

  ErrorResult er;
  nsRefPtr<mozContact> contact = mozContact::Constructor(global, cx, props, er);
  if (er.Failed()) {
    JS_ClearPendingException(cx);
    return NS_ERROR_FAILURE;
  }

  contact->SetId(aId, er, nullptr);
  if (er.Failed()) {
    JS_ClearPendingException(cx);
    return NS_ERROR_FAILURE;
  }

  if (mCursorContinueCallback) {
    // TODO: Bug 935398 - Use DOMCursor for icc.readContacts.
    NS_ENSURE_TRUE(mContacts.AppendElement(contact),  NS_ERROR_OUT_OF_MEMORY);

    return mCursorContinueCallback->HandleContinue();
  }

  // Fire a success event directly.

  JS::Rooted<JS::Value> val(cx);
  if (!ToJSValue(cx, contact, &val)) {
    JS_ClearPendingException(cx);
    return NotifyError(nsIRilCallback::ERROR_GENERIC_FAILURE);
  }

  mDOMRequest->FireSuccess(val);
  return NS_OK;
}

NS_IMETHODIMP
IccCallback::NotifyOpenChannelSuccess(int32_t aChannel)
{
  return NotifySuccess(aChannel);
}

NS_IMETHODIMP
IccCallback::NotifyExchangeAPDUSuccess(int32_t aSw1,
                                       int32_t aSw2,
                                       const nsAString& aResponse)
{
  IccExchangeAPDUResult result;
  result.mSw1 = aSw1;
  result.mSw2 = aSw2;
  result.mResponse = aResponse;
  return NotifySuccess(result);
}

NS_IMETHODIMP
IccCallback::NotifyMatchMvnoSuccess(bool aMatch)
{
  return NotifySuccess(aMatch);
}

} // namespace icc
} // namespace dom
} // namespace mozilla
