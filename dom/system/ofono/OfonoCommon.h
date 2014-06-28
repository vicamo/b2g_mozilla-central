/* -*- Mode: c++; c-basic-offset: 2; indent-tabs-mode: nil; tab-width: 40 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ofono_OfonoCommon_h
#define mozilla_dom_ofono_OfonoCommon_h

#include "nsDebug.h"
#include "nsPrintfCString.h"

// Originally defined in <ofono/dbus.h>
#define OFONO_SERVICE "org.ofono"
#define OFONO_MANAGER_INTERFACE "org.ofono.Manager"
#define OFONO_MANAGER_PATH "/"

// Debug
#define OFONO_D(args...)                  \
  NS_WARNING(nsPrintfCString(args).get())
// Warning
#define OFONO_W(args...)                  \
  NS_WARNING(nsPrintfCString(args).get())
// Error
#define OFONO_E(args...)                \
  NS_ERROR(nsPrintfCString(args).get())

#if 0
# define OFONO_TRACE()  OFONO_D("%s", __FUNCTION__)
#else
# define OFONO_TRACE()
#endif

#endif /* mozilla_dom_ofono_OfonoCommon_h */
