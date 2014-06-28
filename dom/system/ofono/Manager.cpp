/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/ofono/Manager.h"

#include "mozilla/StaticPtr.h" // for StaticRefPtr
#include "nsThreadUtils.h" // for NS_IsMainThread()
#include "OfonoCommon.h"

namespace mozilla {
namespace dom {
namespace ofono {

StaticRefPtr<Manager> sInstance;
/* static */ bool Manager::sIsShuttingDown = false;

/* static */ void
Manager::OnGDBusProxyNewFinished(GObject* aUnused,
                                 GAsyncResult* aAsyncResult,
                                 gpointer aUserData)
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());

  if (IsShuttingDown()) {
    OFONO_W("GDBus proxy for manager gets ready after shutting down.");
    return;
  }

  GError* error = nullptr;
  OfonoGDBusManager* proxy =
    ofono_gdbus_manager_proxy_new_finish(aAsyncResult, &error);
  if (!proxy) {
    OFONO_E("Failed to create GDBus proxy for manager: %s", error->message);
    g_error_free(error);
    return;
  }

  Manager::GetInstance()->mGDBusManager = proxy;
}

NS_IMPL_ISUPPORTS0(Manager)

Manager*
Manager::GetInstance()
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());

  if (!IsShuttingDown() && !sInstance.get()) {
    sInstance = new Manager();
  }

  return sInstance.get();
}

Manager::Manager()
  : mGDBusManager(nullptr)
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(!sInstance.get());

  MOZ_COUNT_CTOR(Manager);
}

Manager::~Manager()
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(!sInstance.get());
  MOZ_ASSERT(!mGDBusManager);

  MOZ_COUNT_DTOR(Manager);
}

void
Manager::Init(GDBusConnection* aConnection)
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(aConnection);
  MOZ_ASSERT(!mGDBusManager);

  ofono_gdbus_manager_proxy_new(aConnection,
                                G_DBUS_PROXY_FLAGS_NONE,
                                OFONO_SERVICE,
                                OFONO_MANAGER_PATH,
                                nullptr,
                                GAsyncReadyCallback(OnGDBusProxyNewFinished),
                                nullptr);
}

void
Manager::Deinit()
{
  OFONO_TRACE();
  MOZ_ASSERT(NS_IsMainThread());

  nsRefPtr<Manager> kungFuDeathGrip(this);
  sInstance = nullptr;
  sIsShuttingDown = true;

  if (mGDBusManager) {
    g_object_unref(G_OBJECT(mGDBusManager));
    mGDBusManager = nullptr;
  }
}

} // namespace ofono
} // namespace dom
} // namespace mozilla
