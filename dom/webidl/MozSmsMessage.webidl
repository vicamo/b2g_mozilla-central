/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

enum MobileMessageType { "sms", "mms" };

enum SmsDeliveryState { "sent", "received", "sending", "error" };

enum SmsDeliveryStatus { "not-applicable", "success", "pending", "error" };

enum SmsMessageClass { "normal", "class-0", "class-1", "class-2", "class-3" };

[Pref="dom.sms.enabled",
 ChromeConstructor(long id,
                   unsigned long long threadId,
                   DOMString? iccId,
                   SmsDeliveryState delivery,
                   SmsDeliveryStatus deliveryStatus,
                   DOMString? sender,
                   DOMString receiver,
                   DOMString body,
                   SmsMessageClass messageClass,
                   DOMTimeStamp timestamp,
                   DOMTimeStamp sentTimestamp,
                   DOMTimeStamp deliveryTimestamp,
                   boolean read)]
interface MozSmsMessage
{
  /**
   * |type| is always "sms".
   */
  readonly attribute MobileMessageType type;

  readonly attribute long id;

  readonly attribute unsigned long long threadId;

  /**
   * Integrated Circuit Card Identifier.
   *
   * Will be null if ICC is not available.
   */
  readonly attribute DOMString? iccId;

  /**
   * Should be "received", "sending", "sent" or "error".
   */
  readonly attribute SmsDeliveryState delivery;

  /**
   * Possible delivery status values for above delivery states are:
   *
   * "received": "success"
   * "sending" : "pending", or "not-applicable" if the message was sent without
   *             status report requisition.
   * "sent"    : "pending", "success", "error", or "not-applicable"
   *             if the message was sent without status report requisition.
   * "error"   : "error"
   */
  readonly attribute SmsDeliveryStatus deliveryStatus;

  readonly attribute DOMString? sender;
  readonly attribute DOMString receiver;
  readonly attribute DOMString body;

  /**
   * Should be "normal", "class-0", "class-1", "class-2" or "class-3".
   */
  readonly attribute SmsMessageClass messageClass;

  readonly attribute DOMTimeStamp timestamp;

  readonly attribute DOMTimeStamp sentTimestamp;
                                  // 0 if not available (e.g., |delivery| =
                                  // "sending").

  readonly attribute DOMTimeStamp deliveryTimestamp;
                                  // 0 if not available (e.g., |delivery| =
                                  // "received" or not yet delivered).

  readonly attribute boolean read;
};
