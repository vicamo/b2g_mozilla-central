/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "VoicemailStatus.h"
#include "mozilla/dom/MozVoicemailStatusBinding.h"

using namespace mozilla::dom;

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE_1(VoicemailStatus, mVoicemail)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(VoicemailStatus)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(VoicemailStatus)
NS_IMPL_CYCLE_COLLECTING_RELEASE(VoicemailStatus)

VoicemailStatus::VoicemailStatus(Voicemail* aVoicemail)
  : mVoicemail(aVoicemail)
{
  MOZ_ASSERT(mVoicemail);

  SetIsDOMBinding();
}

nsPIDOMWindow*
VoicemailStatus::GetParentObject()
{
  return mVoicemail->GetOwner();
}

JSObject*
VoicemailStatus::WrapObject(JSContext* aCx,
                            JS::Handle<JSObject*> aScope)
{
  return MozVoicemailStatusBinding::Wrap(aCx, aScope, this);
}
