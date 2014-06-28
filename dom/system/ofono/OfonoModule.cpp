/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "OfonoStartupObserver.h"

namespace {

using mozilla::dom::ofono::OfonoStartupObserver;

NS_GENERIC_FACTORY_CONSTRUCTOR(OfonoStartupObserver)

NS_DEFINE_NAMED_CID(OFONO_STARTUP_OBSERVER_CID);

const mozilla::Module::CIDEntry kOfonoCIDs[] = {
  { &kOFONO_STARTUP_OBSERVER_CID, false, nullptr, OfonoStartupObserverConstructor },
  { nullptr }
};

const mozilla::Module::ContractIDEntry kOfonoContracts[] = {
  { OFONO_STARTUP_OBSERVER_CONTRACTID, &kOFONO_STARTUP_OBSERVER_CID },
  { nullptr }
};

const mozilla::Module::CategoryEntry kOfonoCategories[] = {
  { "profile-after-change", "oFono Startup Observer", OFONO_STARTUP_OBSERVER_CONTRACTID },
  { nullptr }
};

const mozilla::Module kOfonoModule = {
  mozilla::Module::kVersion,
  kOfonoCIDs,
  kOfonoContracts,
  kOfonoCategories
};

} // anonymouse namespace

NSMODULE_DEFN(OfonoModule) = &kOfonoModule;
