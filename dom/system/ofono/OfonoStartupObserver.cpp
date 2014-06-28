/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "OfonoStartupObserver.h"

#include "mozilla/Services.h" // for GetObserverService()
#include "nsIObserverService.h"
#include "nsISupportsImpl.h" // for MOZ_COUNT_CTOR, MOZ_COUNT_DTOR
#include "nsThreadUtils.h"
#include "OfonoCommon.h"

namespace mozilla {
namespace dom {
namespace ofono {

using mozilla::services::GetObserverService;

NS_IMPL_ISUPPORTS(OfonoStartupObserver, nsIObserver)

OfonoStartupObserver::OfonoStartupObserver()
{
  OFONO_TRACE();
  MOZ_COUNT_CTOR(OfonoStartupObserver);
}

OfonoStartupObserver::~OfonoStartupObserver()
{
  OFONO_TRACE();
  MOZ_COUNT_DTOR(OfonoStartupObserver);
}

NS_IMETHODIMP
OfonoStartupObserver::Observe(nsISupports* aSubject,
                              const char* aTopic,
                              const char16_t* aData)
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());

  if (!strcmp(aTopic, "profile-after-change")) {
    // Setup observer for NS_XPCOM_SHUTDOWN_OBSERVER_ID.
    nsCOMPtr<nsIObserverService> obs = GetObserverService();
    if (obs) {
      if (NS_FAILED(obs->AddObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID,
                                     false))) {
        OFONO_E("Failed to add shutdown observer!");
      }
    }

    return NS_OK;
  }

  if (!strcmp(aTopic, NS_XPCOM_SHUTDOWN_OBSERVER_ID)) {
    nsCOMPtr<nsIObserverService> obs = GetObserverService();
    if (obs) {
      if (NS_FAILED(obs->RemoveObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID))) {
        OFONO_W("Failed to remove shutdown observer!");
      }
    }

    return NS_OK;
  }

  return NS_ERROR_UNEXPECTED;
}

} // namespace ofono
} // namespace dom
} // namespace mozilla
