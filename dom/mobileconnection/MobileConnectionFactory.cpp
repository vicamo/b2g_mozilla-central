/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/mobileconnection/MobileConnectionFactory.h"
#if defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
#include "nsIGonkMobileConnectionService.h"
#endif
#include "nsServiceManagerUtils.h"
#include "nsXULAppAPI.h"
#include "ipc/MobileConnectionIPCService.h"

namespace mozilla {
namespace dom {
namespace mobileconnection {

/* static */ already_AddRefed<nsIMobileConnectionService>
MobileConnectionFactory::CreateMobileConnectionService()
{
  nsCOMPtr<nsIMobileConnectionService> service;

  if (XRE_GetProcessType() == GeckoProcessType_Content) {
    service = new MobileConnectionIPCService();
  } else {
#if defined(MOZ_B2G_RIL)
#if defined(MOZ_WIDGET_GONK)
    service = do_CreateInstance(GONK_MOBILECONNECTION_SERVICE_CONTRACTID);
#endif
#endif // !MOZ_B2G_RIL
  }

  return service.forget();
}

} // namespace mobileconnection
} // namespace dom
} // namespace mozilla
