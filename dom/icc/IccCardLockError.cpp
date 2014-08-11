/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/IccCardLockError.h"

#include "EnumHelpers.h"
#include "mozilla/dom/IccCardLockErrorBinding.h"

namespace mozilla {
namespace dom {

using namespace mozilla::dom::icc;

NS_IMPL_ISUPPORTS_INHERITED0(IccCardLockError, DOMError)

IccCardLockError::IccCardLockError(nsPIDOMWindow* aWindow,
                                   IccErrorNames aName,
                                   IccCardLockType aLockType,
                                   int16_t aRetryCount)
  : DOMError(aWindow, ToString(aName))
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
