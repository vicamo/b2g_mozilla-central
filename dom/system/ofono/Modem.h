/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ofono_Modem_h
#define mozilla_dom_ofono_Modem_h

#include <gio/gio.h>

#include "mozilla/Attributes.h" // for MOZ_FINAL
#include "mozilla/dom/ofono/gdbusmodem.h"
#include "mozilla/dom/ofono/Manager.h"
#include "nsISupports.h"
#include "nsString.h"

namespace mozilla {
namespace dom {
namespace ofono {

class Modem MOZ_FINAL : public nsISupports
{
  friend class Manager;

public:
  NS_DECL_ISUPPORTS

private:
  static void
  OnGDBusProxyNewFinished(GObject* aUnused,
                          GAsyncResult* aAsyncResult,
                          Modem* aModem);

  // Only called by Manager.
  Modem(const gchar* aObjectPath);

  virtual ~Modem();

  // Only called by Manager.
  void
  Init(GDBusConnection* aConnection);

  // Only called by Manager.
  void
  Deinit();

private:
  nsCString mObjectPath;
  OfonoGDBusModem* mGDBusModem;
};

} // namespace ofono
} // namespace dom
} // namespace mozilla

#endif /* mozilla_dom_ofono_Modem_h */
