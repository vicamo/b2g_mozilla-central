/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ofono_Manager_h
#define mozilla_dom_ofono_Manager_h

#include <gio/gio.h>

#include "mozilla/Attributes.h" // for MOZ_FINAL
#include "mozilla/dom/ofono/gdbusmanager.h"
#include "nsISupports.h"

namespace mozilla {
namespace dom {
namespace ofono {

class Manager MOZ_FINAL : public nsISupports
{
  friend class OfonoStartupObserver;

public:
  NS_DECL_ISUPPORTS

  static Manager*
  GetInstance();

  static bool
  IsShuttingDown() { return sIsShuttingDown; }

  void
  Init(GDBusConnection* aConnection);

private:
  static void
  OnGDBusProxyNewFinished(GObject* aUnused,
                          GAsyncResult* aAsyncResult,
                          gpointer aUserData);

  Manager();
  virtual ~Manager();

  void
  Deinit();

private:
  static bool sIsShuttingDown;

  OfonoGDBusManager* mGDBusManager;
};

} // namespace ofono
} // namespace dom
} // namespace mozilla

#endif /* mozilla_dom_ofono_Manager_h */
