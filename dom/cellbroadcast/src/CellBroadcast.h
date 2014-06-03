/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_CellBroadcast_h__
#define mozilla_dom_CellBroadcast_h__

#include "mozilla/Attributes.h"
#include "mozilla/DOMEventTargetHelper.h"
#include "nsIObserver.h"

class nsIDOMMozCellBroadcastMessage;

namespace mozilla {
namespace dom {

class CellBroadcast MOZ_FINAL : public DOMEventTargetHelper
                              , public nsIObserver
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIOBSERVER

  NS_REALLY_FORWARD_NSIDOMEVENTTARGET(DOMEventTargetHelper)

  CellBroadcast(nsPIDOMWindow *aWindow);

  void Init();
  void Shutdown();

  nsPIDOMWindow*
  GetParentObject() const { return GetOwner(); }

  virtual JSObject*
  WrapObject(JSContext* aCx) MOZ_OVERRIDE;

  IMPL_EVENT_HANDLER(received)

private:
  nsresult
  NotifyMessageReceived(nsIDOMMozCellBroadcastMessage* aMessage);
};

} // namespace dom
} // namespace mozilla

#endif /* mozilla_dom_CellBroadcast_h__ */
