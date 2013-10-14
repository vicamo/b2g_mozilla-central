/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

[Constructor]
interface MozSmsFilter
{
  // A date that can return null.
  attribute Date? startDate;

  // A date that can return null.
  attribute Date? endDate;

  // An array of DOMString that can return null.
  attribute (DOMString or DOMStringList)? numbers;

  // A DOMString that can return and be set to "sent", "received" or null.
  attribute DOMString? delivery;

  // A read flag that can return and be set to a boolean or null.
  attribute boolean? read;

  // A thread id that can return and be set to a numeric value or null.
  attribute unsigned long long? threadId;
};
