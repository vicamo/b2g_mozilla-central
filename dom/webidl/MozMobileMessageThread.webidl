/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

interface MozMobileMessageThread
{
  // Unique identity of the thread.
  readonly attribute unsigned long long id;

  // Message body of the last message in the thread.
  readonly attribute DOMString body;

  // Total unread messages in the thread.
  readonly attribute unsigned long long unreadCount;

  // Participant addresses of the thread.
  readonly attribute DOMStringList participants;

  // Timestamp of the last message in the thread.
  readonly attribute Date timestamp;

  // Message type of the last message in the thread.
  readonly attribute DOMString lastMessageType;
};
