/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DOMMobileMessageError.h"
#include "mozilla/dom/DOMMobileMessageErrorBinding.h"
#include "mozilla/dom/UnionTypes.h"

namespace mozilla {
namespace dom {

NS_IMPL_CYCLE_COLLECTION_INHERITED(DOMMobileMessageError, DOMError,
                                   mSms, mMms)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION_INHERITED(DOMMobileMessageError)
NS_INTERFACE_MAP_END_INHERITING(DOMError)

NS_IMPL_ADDREF_INHERITED(DOMMobileMessageError, DOMError)
NS_IMPL_RELEASE_INHERITED(DOMMobileMessageError, DOMError)

DOMMobileMessageError::DOMMobileMessageError(nsPIDOMWindow* aWindow,
                                             const nsAString& aName,
                                             SmsMessage* aSms)
  : DOMError(aWindow, aName)
  , mSms(aSms)
  , mMms(nullptr)
{
}

DOMMobileMessageError::DOMMobileMessageError(nsPIDOMWindow* aWindow,
                                             const nsAString& aName,
                                             MmsMessage* aMms)
  : DOMError(aWindow, aName)
  , mSms(nullptr)
  , mMms(aMms)
{
}

void
DOMMobileMessageError::GetData(OwningMozSmsMessageOrMozMmsMessage& aRetVal) const
{
  if (mSms) {
    aRetVal.SetAsMozSmsMessage() = mSms;
    return;
  }

  if (mMms) {
    aRetVal.SetAsMozMmsMessage() = mMms;
    return;
  }

  MOZ_ASSUME_UNREACHABLE("Bad object with invalid mSms and mMms.");
}

JSObject*
DOMMobileMessageError::WrapObject(JSContext* aCx)
{
  return DOMMobileMessageErrorBinding::Wrap(aCx, this);
}

} // namespace dom
} // namespace mozilla
