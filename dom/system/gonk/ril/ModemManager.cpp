/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ModemManager.h"

#include <cutils/properties.h>
#include "Modem.h"

using namespace mozilla::system::gonk;

namespace {

uint32_t
getUint32Property(const char* aPropertyName,
                  uint32_t aDefaultVal)
{
  char value[PROPERTY_VALUE_MAX];

  if (property_get("ro.moz.ril.numclients", value, nullptr)) {
    sscanf(value, "%u", &aDefaultVal);
  }

  return aDefaultVal;
}

}

/*
 * ModemArray
 */

NS_IMPL_ISUPPORTS1(ModemArray, nsIModemArray)

/*
 * Implementation of nsIModemArray.
 */

NS_IMETHODIMP
ModemArray::GetLength(uint32_t* aLength)
{
    *aLength = mModems.Length();
    return NS_OK;
}

NS_IMETHODIMP
ModemArray::GetLength(uint32_t aLength,
                      nsIModem** aModem)
{
    NS_ADDREF(*aModem = mModems[aLength]);
    return NS_OK;
}

/*
 * ModemManager
 */

NS_IMPL_ISUPPORTS1(ModemManager, nsIModemManager)

ModemManager::ModemManager()
  : mModemArray(new ModemArray())
{
  this->Init();
}

void
ModemManager::Init()
{
  const uint32_t numClients =
    getUint32Property("ro.moz.ril.numclients", 1);

  for (uint32_t i = 0; i < numClients; i++) {
    nsCOMPtr<nsIModem> modem = new Modem(i);
    mModemArray.AppendElement(modem);
  }
}

/*
 * Implementation of nsIModemManager.
 */

NS_IMETHODIMP
ModemManager::GetModems(nsIModemArray** aModemArray)
{
    NS_ADDREF(*aModemArray = mModemArray);
    return NS_OK;
}
