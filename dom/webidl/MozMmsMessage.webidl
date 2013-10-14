/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

interface MozMmsAttachmentList
{
  getter MozMmsAttachment item(unsigned long index);
  readonly attribute unsigned long length;
};

interface MozMmsMessage
{
  /**
   * |type| is always "mms".
   */
  readonly attribute DOMString type;

  readonly attribute long id;

  readonly attribute unsigned long long threadId;

  /**
   * Should be "not-downloaded", "received", "sending", "sent" or "error".
   */
  readonly attribute DOMString delivery;

  readonly attribute DOMStringList deliveryStatus;

  readonly attribute DOMString sender;

  readonly attribute DOMStringList receivers;

  readonly attribute Date timestamp;

  readonly attribute boolean read;
  readonly attribute DOMString subject;
  readonly attribute DOMString smil;

  readonly attribute MozMmsAttachmentList attachments;

  /**
   * Expiry date for an MMS to be manually downloaded.
   */
  readonly attribute Date expiryDate;
};
