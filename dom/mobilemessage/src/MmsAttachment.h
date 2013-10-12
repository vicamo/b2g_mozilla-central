/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_MmsAttachment_h
#define mozilla_dom_mobilemessage_MmsAttachment_h

#include "mozilla/Attributes.h"
#include "nsAutoPtr.h"
#include "nsIDOMFile.h"
#include "nsIDOMMozMmsAttachment.h"
#include "nsString.h"

namespace mozilla {
namespace dom {

namespace mobilemessage {
class MmsAttachmentData;
} // namespace mobilemessage

class ContentParent;

class MmsAttachment MOZ_FINAL : public nsIDOMMozMmsAttachment
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIDOMMOZMMSATTACHMENT

  MmsAttachment(const nsAString& aId,
                const nsAString& aLocation,
                const nsRefPtr<nsIDOMBlob>& aContent);

  MmsAttachment(const mobilemessage::MmsAttachmentData& aData);

  static nsresult
  Create(JS::Handle<JS::Value> aValue,
         JSContext* aContext,
         nsIDOMMozMmsAttachment** aAttachment);

  bool
  GetData(ContentParent* aParent,
          mobilemessage::MmsAttachmentData& aData);

private:
  nsString mId;
  nsString mLocation;
  nsRefPtr<nsIDOMBlob> mContent;
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_MmsAttachment_h
