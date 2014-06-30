/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/ofono/Modem.h"

#include "OfonoCommon.h"

namespace mozilla {
namespace dom {
namespace ofono {

/* static */ void
Modem::OnGDBusProxyNewFinished(GObject* aUnused,
                               GAsyncResult* aAsyncResult,
                               Modem* aModem)
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());

  nsRefPtr<Modem> modem(aModem);
  aModem->Release(); // Release the reference added in Modem::Init().

  if (Manager::IsShuttingDown()) {
    OFONO_W("GDBus proxy for modem '%s' gets ready after shutting down.",
            modem->mObjectPath.get());
    return;
  }

  GError* error = nullptr;
  OfonoGDBusModem* proxy =
    ofono_gdbus_modem_proxy_new_finish(aAsyncResult, &error);
  if (!proxy) {
    OFONO_E("Failed to create GDBus proxy for modem '%s': %s",
            aModem->mObjectPath.get(), error->message);
    g_error_free(error);
    return;
  }

  modem->mGDBusModem = proxy;
}

NS_IMPL_ISUPPORTS0(Modem)

Modem::Modem(const gchar* aObjectPath)
  : mObjectPath(aObjectPath)
  , mGDBusModem(nullptr)
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(aObjectPath && *aObjectPath);

  MOZ_COUNT_CTOR(Modem);
}

Modem::~Modem()
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(!mGDBusModem);

  MOZ_COUNT_DTOR(Modem);
}

void
Modem::Init(GDBusConnection* aConnection)
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(aConnection);
  MOZ_ASSERT(!mGDBusModem);

  // Increase reference count for this async call. Released in
  // Modem::OnGDBusProxyNewFinished().
  AddRef();

  ofono_gdbus_modem_proxy_new(aConnection,
                              G_DBUS_PROXY_FLAGS_NONE,
                              OFONO_SERVICE,
                              mObjectPath.get(),
                              nullptr,
                              GAsyncReadyCallback(OnGDBusProxyNewFinished),
                              this);
}

void
Modem::Deinit()
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());

  if (!mGDBusModem) {
    return;
  }

  g_object_unref(G_OBJECT(mGDBusModem));
  mGDBusModem = nullptr;
}

} // namespace ofono
} // namespace dom
} // namespace mozilla
