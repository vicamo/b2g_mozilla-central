/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/IccCardLockError.h"
#include "mozilla/dom/IccCardLockErrorBinding.h"

namespace mozilla {
namespace dom {

NS_IMPL_ISUPPORTS_INHERITED0(IccCardLockError, DOMError)

/* static */ already_AddRefed<IccCardLockError>
IccCardLockError::Constructor(const GlobalObject& aGlobal,
                              IccCardLockType aLockType,
                              const nsAString& aName,
                              int16_t aRetryCount,
                              ErrorResult& aRv)
{
  nsCOMPtr<nsPIDOMWindow> win = do_QueryInterface(aGlobal.GetAsSupports());
  if (!win) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  nsRefPtr<IccCardLockError> result =
    new IccCardLockError(win, aName, aLockType, aRetryCount);
  return result.forget();
}

IccCardLockError::IccCardLockError(nsPIDOMWindow* aWindow,
                                   const nsAString& aName,
                                   IccCardLockType aLockType,
                                   int16_t aRetryCount)
  : DOMError(aWindow, aName)
  , mLockType(aLockType)
  , mRetryCount(aRetryCount)
{
}

JSObject*
IccCardLockError::WrapObject(JSContext* aCx)
{
  return IccCardLockErrorBinding::Wrap(aCx, this);
}

} // namespace dom
} // namespace mozilla
