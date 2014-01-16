/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_system_gonk_Modem_h
#define mozilla_system_gonk_Modem_h

#include "nsCOMPtr.h"
#include "nsIModemManager.h"

namespace mozilla {
namespace system {
namespace gonk {

class Modem MOZ_FINAL : public nsIModem
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMODEM

  Modem(const uint32_t aClientId);

private:
  const uint32_t mClientId;
};

} // namespace gonk
} // namespace system
} // namespace mozilla

#endif // mozilla_system_gonk_Modem_h
