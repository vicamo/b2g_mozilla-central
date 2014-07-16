/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobileconnection_MobileConnectionFactory_h
#define mozilla_dom_mobileconnection_MobileConnectionFactory_h

#include "nsCOMPtr.h"

class nsIMobileConnectionService;

namespace mozilla {
namespace dom {
namespace mobileconnection {

class MobileConnectionFactory
{
public:
  static already_AddRefed<nsIMobileConnectionService>
  CreateMobileConnectionService();
};

} // namespace mobileconnection
} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobileconnection_MobileConnectionFactory_h
