/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#if defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
#include "nsIGonkTelephonyService.h"
#endif
#include "nsServiceManagerUtils.h"
#include "nsXULAppAPI.h"
#include "ipc/TelephonyIPCService.h"

namespace mozilla {
namespace dom {
namespace telephony {

class TelephonyFactory
{
public:
  static already_AddRefed<nsITelephonyService> CreateTelephonyService();
};

/* static */ already_AddRefed<nsITelephonyService>
TelephonyFactory::CreateTelephonyService()
{
  nsCOMPtr<nsITelephonyService> service;

  if (XRE_GetProcessType() == GeckoProcessType_Content) {
    service = new TelephonyIPCService();
#if defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
  } else {
    service = do_CreateInstance(GONK_TELEPHONY_SERVICE_CONTRACTID);
#endif
  }

  return service.forget();
}

} // namespace telephony
} // namespace dom
} // namespace mozilla

namespace {

using mozilla::dom::telephony::TelephonyFactory;

NS_GENERIC_FACTORY_SINGLETON_CONSTRUCTOR(nsITelephonyService,
                                         TelephonyFactory::CreateTelephonyService)

NS_DEFINE_NAMED_CID(TELEPHONY_SERVICE_CID);

const mozilla::Module::CIDEntry kTelephonyCIDs[] = {
  { &kTELEPHONY_SERVICE_CID, false, nullptr, nsITelephonyServiceConstructor },
  { nullptr }
};

const mozilla::Module::ContractIDEntry kTelephonyContracts[] = {
  { TELEPHONY_SERVICE_CONTRACTID, &kTELEPHONY_SERVICE_CID },
  { nullptr }
};

const mozilla::Module kTelephonyModule = {
  mozilla::Module::kVersion,
  kTelephonyCIDs,
  kTelephonyContracts,
  nullptr
};

} // anonymouse namespace

NSMODULE_DEFN(TelephonyModule) = &kTelephonyModule;
