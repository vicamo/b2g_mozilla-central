/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

dictionary MmsAttachmentDict {
  DOMString? id = null;
  DOMString? location = null;
  Blob? content = null;
};

dictionary MmsParameters {
  sequence<DOMString> receivers;
  DOMString? subject = null;
  DOMString? smil = null;
  sequence<MmsAttachmentDict> attachments;
};

interface MozMobileMessageManager : EventTarget
{
  [Throws]
  DOMRequest getSegmentInfoForText(DOMString text);

  // The first parameter can be either a DOMString (only one number) or an array
  // of DOMStrings.
  // The method returns a DOMRequest object if one number has been passed.
  // An array of DOMRequest objects otherwise.
  [Throws]
  DOMRequest send(DOMString number, DOMString text);
  [Throws]
  sequence<DOMRequest> send(sequence<DOMString> number, DOMString text);

  [Throws]
  DOMRequest sendMMS(optional MmsParameters params);

  [Throws]
  DOMRequest getMessage(long id);

  // The parameter can be either a message id or a Moz{Mms,Sms}Message.
  [Throws]
  DOMRequest delete(long id);
  [Throws]
  DOMRequest delete(MozMmsMessage mmsMessage);
  [Throws]
  DOMRequest delete(MozSmsMessage smsMessage);

  // Iterates through Moz{Mms,Sms}Message.
  [Throws]
  DOMCursor getMessages(MozSmsFilter filter, boolean reverse);

  [Throws]
  DOMRequest markMessageRead(long id, boolean aValue);

  // Iterates through nsIDOMMozMobileMessageThread.
  [Throws]
  DOMCursor getThreads();

  [Throws]
  DOMRequest retrieveMMS(long id);

  attribute EventHandler onreceived;
  attribute EventHandler onretrieving;
  attribute EventHandler onsending;
  attribute EventHandler onsent;
  attribute EventHandler onfailed;
  attribute EventHandler ondeliverysuccess;
  attribute EventHandler ondeliveryerror;
};
