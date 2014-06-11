/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

enum MmsDeliveryState { "sent", "received", "sending", "error", "not-downloaded" };

enum MmsDeliveryStatus { "not-applicable", "success", "pending", "error", "reject", "manual" };

enum MmsReadStatus { "not-applicable", "success", "pending", "error" };

[Pref="dom.sms.enabled"]
interface MozMmsDeliveryInfo
{
  readonly attribute DOMString? receiver;
  readonly attribute MmsDeliveryStatus deliveryStatus;
  readonly attribute DOMTimeStamp deliveryTimestamp; // 0 if not available (e.g.,
                                      // |delivery| = "received" or not yet delivered).
  readonly attribute MmsReadStatus readStatus;
  readonly attribute DOMTimeStamp readTimestamp; // 0 if not available (e.g.,
                                  // |delivery| = "received" or not yet read).
};

[Pref="dom.sms.enabled"]
interface MozMmsDeliveryInfoArray
{
  getter MozMmsDeliveryInfo? item(unsigned long index);
  readonly attribute unsigned long length;
};

[Pref="dom.sms.enabled"]
interface MozMmsAttachment
{
  readonly attribute DOMString? id;
  readonly attribute DOMString? location;
  readonly attribute Blob? content;
};

[Pref="dom.sms.enabled"]
interface MozMmsAttachmentArray
{
  getter MozMmsAttachment? item(unsigned long index);
  readonly attribute unsigned long length;
};

[Pref="dom.sms.enabled"]
interface MozMmsMessage
{
  /**
   * |type| is always "mms".
   */
  readonly attribute MobileMessageType type;

  readonly attribute long id;

  readonly attribute unsigned long long threadId;

  /**
   * Integrated Circuit Card Identifier.
   *
   * Will be null if ICC is not available.
   */
  readonly attribute DOMString iccId;

  /**
   * Should be "not-downloaded", "received", "sending", "sent" or "error".
   */
  readonly attribute MmsDeliveryState delivery;

  readonly attribute MozMmsDeliveryInfoArray? deliveryInfo;

  readonly attribute DOMString sender;

  readonly attribute DOMStringList receivers;

  readonly attribute DOMTimeStamp timestamp;

  readonly attribute DOMTimeStamp sentTimestamp;
                                  // 0 if not available (e.g., |delivery| =
                                  // "sending").

  readonly attribute boolean read;
  readonly attribute DOMString subject;
  readonly attribute DOMString smil;

  readonly attribute MozMmsAttachmentArray? attachments;

  readonly attribute DOMTimeStamp expiryDate;  // Expiry date for an MMS to be
                                               // manually downloaded.

  // Request read report from sender or not.
  readonly attribute boolean readReportRequested;
};

// Internal use only.
dictionary MmsDeliveryInfoParameters
{
  DOMString? receiver = null;
  MmsDeliveryStatus? deliveryStatus = "not-applicable";
  DOMTimeStamp? deliveryTimestamp = 0;
  MmsReadStatus? readStatus = "not-applicable";
  DOMTimeStamp? readTimestamp = 0;
};
