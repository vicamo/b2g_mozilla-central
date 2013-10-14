/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

interface MozSmsMessage
{
  /**
   * |type| is always "sms".
   */
  readonly attribute DOMString type;

  readonly attribute long id;

  readonly attribute unsigned long long threadId;

  /**
   * Should be "received", "sending", "sent" or "error".
   */
  readonly attribute DOMString delivery;

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
  readonly attribute DOMString deliveryStatus;

  readonly attribute DOMString sender;
  readonly attribute DOMString receiver;
  readonly attribute DOMString body;

  /**
   * Should be "normal", "class-0", "class-1", "class-2" or "class-3".
   */
  readonly attribute DOMString messageClass;

  readonly attribute Date timestamp;
  readonly attribute boolean read;
};
