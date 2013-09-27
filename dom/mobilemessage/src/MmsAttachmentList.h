/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_mobilemessage_MmsAttachmentList_h
#define mozilla_dom_mobilemessage_MmsAttachmentList_h

#include "mozilla/Attributes.h"
#include "mozilla/dom/MmsAttachment.h"

namespace mozilla {
namespace dom {

class MmsMessage;
class MmsAttachmentList MOZ_FINAL : public nsISupports
                                  , public nsWrapperCache
{
public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(MmsAttachmentList)

  MmsAttachmentList(MmsMessage* aMessage);

  nsPIDOMWindow*
  GetParentObject() const;

  // WrapperCache
  virtual JSObject*
  WrapObject(JSContext* aCx,
             JS::Handle<JSObject*> aScope) MOZ_OVERRIDE;

  // MozMmsAttachmentList WebIDL
  already_AddRefed<TelephonyCall>
  Item(uint32_t aIndex) const;

  uint32_t
  Length() const;

  already_AddRefed<MmsAttachment>
  IndexedGetter(uint32_t aIndex,
                bool& aFound) const;

private:
  ~MmsAttachmentList();
};

} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_mobilemessage_MmsAttachmentList_h
