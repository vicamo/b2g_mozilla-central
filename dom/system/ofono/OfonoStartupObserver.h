/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ofono_OfonoStartupObserver_h
#define mozilla_dom_ofono_OfonoStartupObserver_h

#include "mozilla/Attributes.h" // for MOZ_FINAL
#include "nsIObserver.h"

#define OFONO_STARTUP_OBSERVER_CID \
  {0xab618d7e, 0xa3e6, 0x434a, {0xb7, 0x09, 0xb8, 0xc1, 0x29, 0xb5, 0x3e, 0x54}}
#define OFONO_STARTUP_OBSERVER_CONTRACTID \
  "@mozilla.org/ofono/startup-observer;1"

namespace mozilla {
namespace dom {
namespace ofono {

class OfonoStartupObserver MOZ_FINAL : public nsIObserver
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIOBSERVER

  OfonoStartupObserver();

private:
  virtual ~OfonoStartupObserver();
};

} // namespace ofono
} // namespace dom
} // namespace mozilla

#endif /* mozilla_dom_ofono_OfonoStartupObserver_h */
