/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_icc_IccCallback_h
#define mozilla_dom_icc_IccCallback_h

#include "mozilla/dom/DOMRequest.h"
#include "nsIIccService.h"

namespace mozilla {
namespace dom {

class Icc;
class mozContact;

namespace icc {

class IccCallback MOZ_FINAL : public nsIIccCallback
{
  friend class mozilla::dom::Icc;

public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIICCCALLBACK

  explicit IccCallback(DOMRequest* aDOMRequest);

private:
  // MOZ_FINAL suppresses -Werror,-Wdelete-non-virtual-dtor
  ~IccCallback();

  nsRefPtr<DOMRequest> mDOMRequest;
  nsCOMPtr<nsICursorContinueCallback> mCursorContinueCallback;
  FallibleTArray<nsRefPtr<mozContact>> mContacts;

  template<typename T>
  nsresult
  NotifySuccess(const T& aResult);

  template<typename T>
  nsresult
  NotifyCardLockSuccess(T& aResult,
                        uint32_t aLockType);
};

} // namespace icc
} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_icc_IccCallback_h

