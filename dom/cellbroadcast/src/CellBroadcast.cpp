/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CellBroadcast.h"
#include "mozilla/dom/MozCellBroadcastBinding.h"
#include "mozilla/Services.h"
#include "nsIDOMMozCellBroadcastEvent.h"
#include "nsIDOMMozCellBroadcastMessage.h"
#include "nsICellBroadcastService.h"
#include "nsIObserverService.h"
#include "nsServiceManagerUtils.h"
#include "GeneratedEvents.h"

#define NS_RILCONTENTHELPER_CONTRACTID "@mozilla.org/ril/content-helper;1"

namespace mozilla {
namespace dom {

namespace cellbroadcast {

const char* kCellBroadcastReceivedObserverTopic = "cellbroadcast-received";

} // namespace cellbroadcast

using namespace cellbroadcast;

NS_INTERFACE_MAP_BEGIN(CellBroadcast)
  NS_INTERFACE_MAP_ENTRY(nsIObserver)
NS_INTERFACE_MAP_END_INHERITING(DOMEventTargetHelper)

NS_IMPL_ADDREF_INHERITED(CellBroadcast, DOMEventTargetHelper)
NS_IMPL_RELEASE_INHERITED(CellBroadcast, DOMEventTargetHelper)

/**
 * CellBroadcast Implementation.
 */

CellBroadcast::CellBroadcast(nsPIDOMWindow *aWindow)
  : DOMEventTargetHelper(aWindow)
{
}

void
CellBroadcast::Init()
{
  nsCOMPtr<nsICellBroadcastService> service =
    do_GetService(NS_RILCONTENTHELPER_CONTRACTID);
  if (!service) {
    return;
  }

  nsresult rv = service->RegisterCellBroadcastMsg();
  if (NS_FAILED(rv)) {
    return;
  }

  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  // GetObserverService() can return null is some situations like shutdown.
  if (obs) {
    obs->AddObserver(this, kCellBroadcastReceivedObserverTopic, false);
  }
}

void
CellBroadcast::Shutdown()
{
  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  // GetObserverService() can return null is some situations like shutdown.
  if (obs) {
    obs->RemoveObserver(this, kCellBroadcastReceivedObserverTopic);
  }
}

JSObject*
CellBroadcast::WrapObject(JSContext* aCx)
{
  return MozCellBroadcastBinding::Wrap(aCx, this);
}

NS_IMETHODIMP
CellBroadcast::NotifyMessageReceived(nsIDOMMozCellBroadcastMessage* aMessage)
{
  nsCOMPtr<nsIDOMEvent> event;
  NS_NewDOMMozCellBroadcastEvent(getter_AddRefs(event), this, nullptr, nullptr);

  nsCOMPtr<nsIDOMMozCellBroadcastEvent> ce = do_QueryInterface(event);
  nsresult rv = ce->InitMozCellBroadcastEvent(NS_LITERAL_STRING("received"),
                                              true, false, aMessage);
  NS_ENSURE_SUCCESS(rv, rv);

  return DispatchTrustedEvent(ce);
}

// nsIObserver

NS_IMETHODIMP
CellBroadcast::Observe(nsISupports* aSubject,
                       const char* aTopic,
                       const char16_t* aData)
{
  if (!strcmp(aTopic, kCellBroadcastReceivedObserverTopic)) {
    nsCOMPtr<nsIDOMMozCellBroadcastMessage> message = do_QueryInterface(aSubject);
    return NotifyMessageReceived(message);
  }

  return NS_OK;
}

} // namespace dom
} // namespace mozilla
