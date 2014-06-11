/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MobileMessageError_h
#define mozilla_dom_MobileMessageError_h

#include "mozilla/dom/DOMError.h"
#include "mozilla/dom/MmsMessage.h"
#include "mozilla/dom/SmsMessage.h"

namespace mozilla {
namespace dom {

class OwningMozSmsMessageOrMozMmsMessage;

class DOMMobileMessageError MOZ_FINAL : public DOMError
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(DOMMobileMessageError, DOMError)

  DOMMobileMessageError(nsPIDOMWindow* aWindow, const nsAString& aName,
                        SmsMessage* aSms);

  DOMMobileMessageError(nsPIDOMWindow* aWindow, const nsAString& aName,
                        MmsMessage* aMms);

  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

  void GetData(OwningMozSmsMessageOrMozMmsMessage& aRetVal) const;

private:
  nsRefPtr<SmsMessage> mSms;
  nsRefPtr<MmsMessage> mMms;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_MobileMessageError_h
