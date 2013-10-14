/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

interface MozSmsSegmentInfo
{
  /* The number of total segments for the input string. */
  readonly attribute long segments;
  /* The number of characters available per segment. */
  readonly attribute long charsPerSegment;
  /* The maximum number of available characters in the last segment. */
  readonly attribute long charsAvailableInLastSegment;
};
