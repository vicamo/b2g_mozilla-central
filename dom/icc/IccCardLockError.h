/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_IccCardLockError_h
#define mozilla_dom_IccCardLockError_h

#include "mozilla/dom/DOMError.h"
#include "mozilla/dom/MozIccBinding.h"

namespace mozilla {
namespace dom {

class IccCardLockError MOZ_FINAL : public DOMError
{
public:
  NS_DECL_ISUPPORTS_INHERITED

  static already_AddRefed<IccCardLockError>
  Constructor(const GlobalObject& aGlobal,
              IccCardLockType aLockType,
              const nsAString& aName,
              int16_t aRetryCount,
              ErrorResult& aRv);

  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

  IccCardLockType
  LockType() const { return mLockType; }

  int16_t
  RetryCount() const { return mRetryCount; }

private:
  IccCardLockError(nsPIDOMWindow* aWindow,
                   const nsAString& aName,
                   IccCardLockType aLockType,
                   int16_t aRetryCount);

  // MOZ_FINAL suppresses -Werror,-Wdelete-non-virtual-dtor
  ~IccCardLockError() {}

  IccCardLockType mLockType;
  int16_t mRetryCount;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_IccCardLockError_h

