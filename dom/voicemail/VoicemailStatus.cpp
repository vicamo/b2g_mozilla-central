/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/VoicemailStatus.h"

#include "mozilla/dom/MozVoicemailStatusBinding.h"
#include "nsIVoicemailService.h"
#include "nsPIDOMWindow.h"

namespace mozilla {
namespace dom {

// mVoicemail is owned by internal service.
NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(VoicemailStatus, mParent)

NS_IMPL_CYCLE_COLLECTING_ADDREF(VoicemailStatus)
NS_IMPL_CYCLE_COLLECTING_RELEASE(VoicemailStatus)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(VoicemailStatus)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

VoicemailStatus::VoicemailStatus(nsISupports* aParent,
                                 nsIVoicemail* aVoicemail)
  : mParent(aParent)
  , mVoicemail(aVoicemail)
{
  MOZ_ASSERT(mParent);
  MOZ_ASSERT(mVoicemail);

  SetIsDOMBinding();
}

JSObject*
VoicemailStatus::WrapObject(JSContext* aCx)
{
  return MozVoicemailStatusBinding::Wrap(aCx, this);
}

uint32_t
VoicemailStatus::ServiceId() const
{
  uint32_t result = 0;
  mVoicemail->GetServiceId(&result);
  return result;
}

bool
VoicemailStatus::HasMessages() const
{
  bool result = false;
  mVoicemail->GetHasMessages(&result);
  return result;
}

int32_t
VoicemailStatus::MessageCount() const
{
  int32_t result = 0;
  mVoicemail->GetMessageCount(&result);
  return result;
}

void
VoicemailStatus::GetReturnNumber(nsString& aReturnNumber) const
{
  aReturnNumber.SetIsVoid(true);
  mVoicemail->GetReturnNumber(aReturnNumber);
}

void
VoicemailStatus::GetReturnMessage(nsString& aReturnMessage) const
{
  aReturnMessage.SetIsVoid(true);
  mVoicemail->GetReturnMessage(aReturnMessage);
}

} // namespace dom
} // namespace mozilla
