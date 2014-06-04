/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "nsICellBroadcastService.h"
#include "nsServiceManagerUtils.h"
#include "nsXULAppAPI.h"

#define NS_RILCONTENTHELPER_CONTRACTID "@mozilla.org/ril/content-helper;1"

namespace mozilla {
namespace dom {
namespace cellbroadcast {

class CellBroadcastFactory
{
public:
  static already_AddRefed<nsICellBroadcastService>
  FactoryCreate();
};

/* static */ already_AddRefed<nsICellBroadcastService>
CellBroadcastFactory::FactoryCreate()
{
  nsCOMPtr<nsICellBroadcastService> service;

#if defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
  service = do_GetService(NS_RILCONTENTHELPER_CONTRACTID);
#endif

  return service.forget();
}

} // namespace cellbroadcast
} // namespace dom
} // namespace mozilla

namespace {

using namespace mozilla::dom::cellbroadcast;

NS_GENERIC_FACTORY_SINGLETON_CONSTRUCTOR(nsICellBroadcastService,
                                         CellBroadcastFactory::FactoryCreate)

NS_DEFINE_NAMED_CID(CELLBROADCAST_SERVICE_CID);

const mozilla::Module::CIDEntry kCellBroadcastCIDs[] = {
  { &kCELLBROADCAST_SERVICE_CID, false, nullptr, nsICellBroadcastServiceConstructor },
  { nullptr }
};

const mozilla::Module::ContractIDEntry kCellBroadcastContracts[] = {
  { CELLBROADCAST_SERVICE_CONTRACTID, &kCELLBROADCAST_SERVICE_CID },
  { nullptr }
};

const mozilla::Module kCellBroadcastModule = {
  mozilla::Module::kVersion,
  kCellBroadcastCIDs,
  kCellBroadcastContracts,
  nullptr
};

} // anonymous namespace

NSMODULE_DEFN(CellBroadcastModule) = &kCellBroadcastModule;
