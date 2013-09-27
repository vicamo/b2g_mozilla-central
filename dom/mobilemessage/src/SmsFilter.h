/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_SmsFilter_h
#define mozilla_dom_mobilemessage_SmsFilter_h

#include "mozilla/Attributes.h"
#include "mozilla/dom/Date.h"
#include "mozilla/dom/MozSmsFilterBinding.h"
#include "mozilla/dom/mobilemessage/SmsTypes.h"
#include "mozilla/dom/UnionTypes.h"
#include "nsIDOMSmsFilter.h"

namespace mozilla {
namespace dom {

class SmsFilter MOZ_FINAL : public nsIDOMMozSmsFilter
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIDOMMOZSMSFILTER

  SmsFilter();
  SmsFilter(const mobilemessage::SmsFilterData& aData);

  static already_AddRefed<SmsFilter>
  Constructor(const GlobalObject& aGlobal,
              ErrorResult& rv);

  const mobilemessage::SmsFilterData&
  GetData() const
  {
    return mData;
  }

  // WebIDL Interface
  Nullable<Date>
  GetStartDate() const;

  void
  SetStartDate(const Nullable<Date>& aStartDate);

  Nullable<Date>
  GetEndDate() const;

  void
  SetEndDate(const Nullable<Date>& aEndDate);

  Nullable<OwningStringOrDOMStringList>
  GetNumbers() const;

  void
  SetNumbers(const Nullable<OwningStringOrDOMStringList>& aNumbers);

  Nullable<bool>
  GetRead() const;

  void
  SetRead(const Nullable<bool>& aRead);

  Nullable<uint64_t>
  GetThreadId() const;

  void
  SetThreadId(const Nullable<uint64_t>& aThreadId);

private:
  mobilemessage::SmsFilterData mData;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_SmsFilter_h
