/* -*- Mode: c++; c-basic-offset: 2; indent-tabs-mode: nil; tab-width: 40 -*- */
/* vim: set ts=2 et sw=2 tw=40: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_voicemail_voicemail_h__
#define mozilla_dom_voicemail_voicemail_h__

#include "mozilla/Attributes.h"
#include "mozilla/DOMEventTargetHelper.h"
#include "mozilla/ErrorResult.h"
#include "nsIVoicemailService.h"

class JSObject;
struct JSContext;

class nsPIDOMWindow;

namespace mozilla {
namespace dom {

class VoicemailStatus;

class Voicemail MOZ_FINAL : public DOMEventTargetHelper,
                            private nsIVoicemailListener
{
  /**
   * Class Voicemail doesn't actually expose nsIVoicemailListener. Instead, it
   * owns an nsIVoicemailListener derived instance mListener and passes it to
   * nsIVoicemailService. The onreceived events are first delivered to
   * mListener and then forwarded to its owner, Voicemail. See also bug 775997
   * comment #51.
   */
  class Listener;

public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIVOICEMAILLISTENER

  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(Voicemail,
                                           DOMEventTargetHelper)

  static already_AddRefed<Voicemail>
  Create(nsPIDOMWindow* aOwner,
         ErrorResult& aRv);

  void
  Shutdown();

  nsPIDOMWindow*
  GetParentObject() const
  {
    return GetOwner();
  }

  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

  already_AddRefed<VoicemailStatus>
  GetStatus(const Optional<uint32_t>& aServiceId,
            ErrorResult& aRv);

  void
  GetNumber(const Optional<uint32_t>& aServiceId,
            nsString& aNumber,
            ErrorResult& aRv) const;

  void
  GetDisplayName(const Optional<uint32_t>& aServiceId,
                 nsString& aDisplayName,
                 ErrorResult& aRv) const;

  IMPL_EVENT_HANDLER(statuschanged)

private:
  Voicemail(nsPIDOMWindow* aWindow,
            nsIVoicemailService* aService);

  // MOZ_FINAL suppresses -Werror,-Wdelete-non-virtual-dtor
  ~Voicemail();

private:
  nsCOMPtr<nsIVoicemailService> mService;
  nsRefPtr<Listener> mListener;
  nsAutoTArray<nsRefPtr<VoicemailStatus>, 1> mStatuses;

  already_AddRefed<nsIVoicemail>
  GetItemByServiceId(const Optional<uint32_t>& aOptionalServiceId,
                     uint32_t& aActualServiceId) const;

  already_AddRefed<VoicemailStatus>
  GetOrCreateStatus(uint32_t aServiceId,
                    nsIVoicemail* aVoicemail);
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_voicemail_voicemail_h__
