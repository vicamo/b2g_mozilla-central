/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/MmsAttachment.h"

#include "mozilla/dom/ContentParent.h"
#include "mozilla/dom/ipc/Blob.h"
#include "mozilla/dom/MozMobileMessageManagerBinding.h"
#include "mozilla/dom/mobilemessage/SmsTypes.h"
#include "mozilla/dom/RootedDictionary.h"
#include "nsDOMFile.h"

using namespace mozilla::dom::mobilemessage;
using namespace mozilla::dom;

NS_IMPL_ISUPPORTS1(MmsAttachment, nsIDOMMozMmsAttachment)

MmsAttachment::MmsAttachment(const nsAString& aId,
                             const nsAString& aLocation,
                             const nsRefPtr<nsIDOMBlob>& aContent)
  : mId(aId)
  , mLocation(aLocation)
  , mContent(aContent)
{
}

MmsAttachment::MmsAttachment(const MmsAttachmentData& aData)
  : mId(aData.id())
  , mLocation(aData.location())
{
    if (aData.contentParent()) {
      mContent = static_cast<BlobParent*>(aData.contentParent())->GetBlob();
    } else if (aData.contentChild()) {
      mContent = static_cast<BlobChild*>(aData.contentChild())->GetBlob();
    } else {
      NS_WARNING("MmsMessage: Unable to get attachment content.");
    }
}

/* static */ nsresult
MmsAttachment::Create(JS::Handle<JS::Value> aValue,
                      JSContext* aContext,
                      nsIDOMMozMmsAttachment** aAttachment)
{
  RootedDictionary<MmsAttachmentDict> dict(aContext);
  if (!dict.Init(aContext, aValue)) {
    return NS_ERROR_INVALID_ARG;
  }

  NS_ADDREF(*aAttachment = new MmsAttachment(dict.mId, dict.mLocation,
                                             dict.mContent));
  return NS_OK;
}

bool
MmsAttachment::GetData(ContentParent* aParent,
                       MmsAttachmentData& aData)
{
  aData.id().Assign(mId);
  aData.location().Assign(mLocation);

  // This is a workaround. Sometimes the blob we get from the database
  // doesn't have a valid last modified date, making the ContentParent
  // send a "Mystery Blob" to the ContentChild. Attempting to get the
  // last modified date of blob can force that value to be initialized.
  nsDOMFileBase* file = static_cast<nsDOMFileBase*>(mContent.get());
  if (file->IsDateUnknown()) {
    uint64_t date;
    if (NS_FAILED(file->GetMozLastModifiedDate(&date))) {
      NS_WARNING("Failed to get last modified date!");
    }
  }

  aData.contentParent() = aParent->GetOrCreateActorForBlob(mContent);
  return aData.contentParent();
}

/*
 * nsIDOMMozMmsAttachment
 */

NS_IMETHODIMP
MmsAttachment::GetId(nsAString& aId)
{
  aId = mId;
  return NS_OK;
}

NS_IMETHODIMP
MmsAttachment::GetLocation(nsAString& aLocation)
{
  aLocation = mLocation;
  return NS_OK;
}

already_AddRefed<nsIDOMBlob>
MmsAttachment::GetContent() const
{
  nsRefPtr<nsIDOMBlob> content = mContent;
  return content.forget();
}

NS_IMETHODIMP
MmsAttachment::GetContent(nsIDOMBlob** aContent)
{
  nsRefPtr<nsIDOMBlob> result = this->GetContent();
  result.forget(aContent);
  return NS_OK;
}
