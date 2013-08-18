/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_voicemail_VoicemailStatus_h
#define mozilla_dom_voicemail_VoicemailStatus_h

#include "mozilla/Attributes.h"
#include "nsWrapperCache.h"

namespace mozilla {
namespace dom {

class Voicemail;

class VoicemailStatus MOZ_FINAL : public nsISupports
                                , public nsWrapperCache
{
  friend class Voicemail;

public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_CLASS(VoicemailStatus)

  nsPIDOMWindow*
  GetParentObject() const;

  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx,
             JS::Handle<JSObject*> aScope) MOZ_OVERRIDE;

  bool
  GetHasMessages() const
  {
    return mHasMessage;
  }

  int32_t
  GetMessageCount() const
  {
    return mMessageCount;
  }

  void
  GetReturnNumber(nsString& aReturnNumber) const
  {
    return mReturnNumber;
  }

  void
  GetReturnMessage(nsString& aReturnMessage) const
  {
    return mReturnMessage;
  }

private:
  VoicemailStatus(Voicemail* aVoicemail);
  virtual ~VoicemailStatus() {}

  nsRefPtr<Voicemail> mVoicemail;

  bool mHasMessage;
  int32_t mMessageCount;
  nsString mReturnNumber;
  nsString mReturnMessage;
};

} // namespace mozilla
} // namespace dom

#endif // mozilla_dom_voicemail_VoicemailStatus_h
