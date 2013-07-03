/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_SmsIPCService_h
#define mozilla_dom_mobilemessage_SmsIPCService_h

#include "nsISmsService.h"
#include "nsIMmsService.h"
#include "nsIMobileMessageDatabaseService.h"
#include "mozilla/Attributes.h"
#include "SmsChild.h"

namespace mozilla {
namespace dom {
namespace mobilemessage {

class SmsIPCService MOZ_FINAL : public nsISmsService
                              , public nsIMmsService
                              , public nsIMobileMessageDatabaseService
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISMSSERVICE
  NS_DECL_NSIMMSSERVICE
  NS_DECL_NSIMOBILEMESSAGEDATABASESERVICE

private:
  nsRefPtr<SmsChild> mSmsChild;

  PSmsChild* GetSmsChild();
};

} // namespace mobilemessage
} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_SmsIPCService_h
