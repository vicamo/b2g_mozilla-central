/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

interface MozVoicemailStatus
{
  /**
   * There are voicemail messages waiting, but the count is unknown.
   */
  const long MESSAGE_COUNT_UNKNOWN = -1;

  /**
   * Whether or not there are messages waiting in the voicemail box
   */
  readonly attribute boolean hasMessages;

  /**
   * The total message count. Some voicemail indicators will only specify that
   * messages are waiting, but not the actual number. In that case, the value
   * of messageCount will be MESSAGE_COUNT_UNKNOWN (-1).
   *
   * Logic for a voicemail notification might look something like:
   * if (status.hasMessages) {
   *   // show new voicemail notification
   *   if (status.messageCount > 0) {
   *     // add a label for the message count
   *   }
   * } else {
   *   // hide the voicemail notification
   * }
   */
  readonly attribute long messageCount;

  /**
   * Return call number received for this voicemail status, or null if one
   * wasn't provided.
   */
  readonly attribute DOMString? returnNumber;

  /**
   * Displayable return call message received for this voicemail status, or null
   * if one wasn't provided.
   */
  readonly attribute DOMString? returnMessage;
};
