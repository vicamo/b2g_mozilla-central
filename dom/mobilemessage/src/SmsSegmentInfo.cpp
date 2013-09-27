/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SmsSegmentInfo.h"

using namespace mozilla::dom::mobilemessage;
using namespace mozilla::dom;

NS_IMPL_ISUPPORTS1(SmsSegmentInfo, nsIDOMMozSmsSegmentInfo)

SmsSegmentInfo::SmsSegmentInfo(int32_t aSegments,
                               int32_t aCharsPerSegment,
                               int32_t aCharsAvailableInLastSegment)
  : mData(aSegments, aCharsPerSegment, aCharsAvailableInLastSegment)
{
}

SmsSegmentInfo::SmsSegmentInfo(const SmsSegmentInfoData& aData)
  : mData(aData)
{
}

NS_IMETHODIMP
SmsSegmentInfo::GetSegments(int32_t* aSegments)
{
  *aSegments = this->Segments();
  return NS_OK;
}

NS_IMETHODIMP
SmsSegmentInfo::GetCharsPerSegment(int32_t* aCharsPerSegment)
{
  *aCharsPerSegment = this->CharsPerSegment();
  return NS_OK;
}

NS_IMETHODIMP
SmsSegmentInfo::GetCharsAvailableInLastSegment(int32_t* aCharsAvailableInLastSegment)
{
  *aCharsAvailableInLastSegment = this->CharsAvailableInLastSegment();
  return NS_OK;
}
