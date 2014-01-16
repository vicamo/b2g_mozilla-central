/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_system_gonk_ModemManager_h
#define mozilla_system_gonk_ModemManager_h

#include "nsCOMPtr.h"
#include "nsIModemManager.h"

namespace mozilla {
namespace system {
namespace gonk {

class ModemManager;

class ModemArray MOZ_FINAL : public nsIModemArray
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMODEMARRAY

private:
  friend class ModemManager;

  nsTArray< nsCOMPtr<nsIModem> > mModems;
};

class ModemManager MOZ_FINAL : public nsIModemManager
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMODEMMANAGER

  ModemManager();

private:
  void Init();

private:
  nsCOMPtr<nsIModemArray> mModemArray;
};

} // namespace gonk
} // namespace system
} // namespace mozilla

#endif // mozilla_system_gonk_ModemManager_h
