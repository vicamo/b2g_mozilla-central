/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et ft=cpp : */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/voicemail/VoicemailIPCService.h"

#include "mozilla/dom/ContentChild.h"
#include "mozilla/Preferences.h"
#include "nsIMobileConnectionService.h"
#include "nsServiceManagerUtils.h"

namespace mozilla {
namespace dom {
namespace voicemail {

class Item MOZ_FINAL : public nsIVoicemail
{
  friend class VoicemailIPCService;

public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIVOICEMAIL

  Item(uint32_t aServiceId);

private:
  // MOZ_FINAL suppresses -Werror,-Wdelete-non-virtual-dtor
  ~Item() {}

private:
  uint32_t mServiceId;
  nsString mNumber;
  nsString mDisplayName;
  bool mHasMessages;
  int32_t mMessageCount;
  nsString mReturnNumber;
  nsString mReturnMessage;
};

NS_IMPL_ISUPPORTS(Item, nsIVoicemail)

Item::Item(uint32_t aServiceId)
  : mServiceId(aServiceId)
  , mHasMessages(false)
  , mMessageCount(0)
{
}

// nsIVoicemail

NS_IMETHODIMP
Item::GetServiceId(uint32_t* aServiceId)
{
  NS_ENSURE_ARG_POINTER(aServiceId);

  *aServiceId = mServiceId;
  return NS_OK;
}

NS_IMETHODIMP
Item::GetNumber(nsAString& aNumber)
{
  aNumber = mNumber;
  return NS_OK;
}

NS_IMETHODIMP
Item::GetDisplayName(nsAString& aDisplayName)
{
  aDisplayName = mDisplayName;
  return NS_OK;
}

NS_IMETHODIMP
Item::GetHasMessages(bool* aHasMessages)
{
  NS_ENSURE_ARG_POINTER(aHasMessages);

  *aHasMessages = mHasMessages;
  return NS_OK;
}

NS_IMETHODIMP
Item::GetMessageCount(int32_t* aMessageCount)
{
  NS_ENSURE_ARG_POINTER(aMessageCount);

  *aMessageCount = mMessageCount;
  return NS_OK;
}

NS_IMETHODIMP
Item::GetReturnNumber(nsAString& aReturnNumber)
{
  aReturnNumber = mReturnNumber;
  return NS_OK;
}

NS_IMETHODIMP
Item::GetReturnMessage(nsAString& aReturnMessage)
{
  aReturnMessage = mReturnMessage;
  return NS_OK;
}

NS_IMPL_ISUPPORTS(VoicemailIPCService, nsIVoicemailService)

VoicemailIPCService::VoicemailIPCService()
  : mActorDestroyed(false)
{
  ContentChild::GetSingleton()->SendPVoicemailConstructor(this);

  nsCOMPtr<nsIMobileConnectionService> mcService =
    do_GetService(NS_MOBILE_CONNECTION_SERVICE_CONTRACTID);
  if (mcService) {
    uint32_t length = 0;
    if (NS_SUCCEEDED(mcService->GetNumItems(&length))) {
      mItems.SetLength(length);
    }
  }
}

VoicemailIPCService::~VoicemailIPCService()
{
  MOZ_ASSERT(mListeners.Length() == 0); // Shutdown() should have been called.
  MOZ_ASSERT(mItems.Length() == 0); // Shutdown() should have been called.
}

void
VoicemailIPCService::Shutdown()
{
  if (!mActorDestroyed) {
    Send__delete__(this);
  }

  mListeners.Clear();
  mItems.Clear();
}

// PVoicemailChild

bool
VoicemailIPCService::RecvNotifyInfoChanged(const uint32_t& aServiceId,
                                           const nsString& aNumber,
                                           const nsString& aDisplayName)
{
  nsCOMPtr<nsIVoicemail> item;
  NS_ENSURE_SUCCESS(GetItemByServiceId(aServiceId, getter_AddRefs(item)), false);

  Item* pItem = static_cast<Item*>(item.get());
  pItem->mNumber = aNumber;
  pItem->mDisplayName = aDisplayName;

  // Listeners may unregister itself upon a info changed event, so we make a
  // copy first.
  nsTArray<nsCOMPtr<nsIVoicemailListener>> copy(mListeners);
  for (uint32_t i = 0; i < copy.Length(); i++) {
    copy[i]->NotifyInfoChanged(item);
  }

  return true;
}

bool
VoicemailIPCService::RecvNotifyStatusChanged(const uint32_t& aServiceId,
                                             const bool& aHasMessages,
                                             const int32_t& aMessageCount,
                                             const nsString& aReturnNumber,
                                             const nsString& aReturnMessage)
{
  nsCOMPtr<nsIVoicemail> item;
  NS_ENSURE_SUCCESS(GetItemByServiceId(aServiceId, getter_AddRefs(item)), false);

  Item* pItem = static_cast<Item*>(item.get());
  pItem->mHasMessages = aHasMessages;
  pItem->mMessageCount = aMessageCount;
  pItem->mReturnNumber = aReturnNumber;
  pItem->mReturnMessage = aReturnMessage;

  // Listeners may unregister itself upon a info changed event, so we make a
  // copy first.
  nsTArray<nsCOMPtr<nsIVoicemailListener>> copy(mListeners);
  for (uint32_t i = 0; i < copy.Length(); i++) {
    copy[i]->NotifyStatusChanged(item);
  }

  return true;
}

void
VoicemailIPCService::ActorDestroy(ActorDestroyReason aWhy)
{
  mActorDestroyed = true;
}

// nsIVoicemailService

NS_IMETHODIMP
VoicemailIPCService::GetNumItems(uint32_t* aNumItems)
{
  NS_ENSURE_ARG_POINTER(aNumItems);

  *aNumItems = mItems.Length();

  return NS_OK;
}

NS_IMETHODIMP
VoicemailIPCService::GetItemByServiceId(uint32_t aServiceId,
                                        nsIVoicemail** aItem)
{
  NS_ENSURE_ARG(aServiceId < mItems.Length());
  NS_ENSURE_ARG_POINTER(aItem);

  if (!mItems[aServiceId]) {
    nsRefPtr<Item> item = new Item(aServiceId);
    if (!SendGetAttributes(aServiceId,
                           &(item->mNumber),
                           &(item->mDisplayName),
                           &(item->mHasMessages),
                           &(item->mMessageCount),
                           &(item->mReturnNumber),
                           &(item->mReturnMessage))) {
      return NS_ERROR_FAILURE;
    }

    mItems[aServiceId] = item;
  }

  nsRefPtr<nsIVoicemail> item(mItems[aServiceId]);
  item.forget(aItem);

  return NS_OK;
}

NS_IMETHODIMP
VoicemailIPCService::GetDefaultItem(nsIVoicemail** aItem)
{
  NS_ENSURE_ARG_POINTER(aItem);

  int defaultServiceId =
    Preferences::GetInt("dom.voicemail.defaultServiceId", 0);
  return GetItemByServiceId(defaultServiceId, aItem);
}

NS_IMETHODIMP
VoicemailIPCService::RegisterListener(nsIVoicemailListener* aListener)
{
  NS_ENSURE_TRUE(!mActorDestroyed, NS_ERROR_UNEXPECTED);
  NS_ENSURE_TRUE(!mListeners.Contains(aListener), NS_ERROR_UNEXPECTED);

  mListeners.AppendElement(aListener);
  return NS_OK;
}

NS_IMETHODIMP
VoicemailIPCService::UnregisterListener(nsIVoicemailListener* aListener)
{
  NS_ENSURE_TRUE(!mActorDestroyed, NS_ERROR_UNEXPECTED);

  return mListeners.RemoveElement(aListener) ? NS_OK : NS_ERROR_UNEXPECTED;
}

} // namespace voicemail
} // namespace dom
} // namespace mozilla
