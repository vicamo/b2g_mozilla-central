/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_cellbroadcast_Types_h
#define mozilla_dom_cellbroadcast_Types_h

#include "IPCMessageUtils.h"

namespace mozilla {
namespace dom {
namespace cellbroadcast {

// MozCellBroadcastMessage.gsmGeographicalScope
enum GsmGeographicalScope
{
  eGsmGeographicalScope_CellImmediate = 0,
  eGsmGeographicalScope_Plmn,
  eGsmGeographicalScope_LocationArea,
  eGsmGeographicalScope_Cell,

  // This state should stay at the end.
  eGsmGeographicalScope_EndGuard,
};

// MozCellBroadcastMessage.messageClass
enum MessageClass
{
  eMessageClass_Normal = 0,
  eMessageClass_Class0,
  eMessageClass_Class1,
  eMessageClass_Class2,
  eMessageClass_Class3,
  eMessageClass_User1,
  eMessageClass_User2,

  // This state should stay at the end.
  eMessageClass_EndGuard,
};

// MozCellBroadcastEtwsInfo.warningType
enum WarningType
{
  eWarningType_Earthquake = 0,
  eWarningType_Tsunami,
  eWarningType_EarthquakeTsunami,
  eWarningType_Test,
  eWarningType_Other,

  // This state should stay at the end.
  eWarningType_EndGuard,
};

} // namespace cellbroadcast
} // namespace dom
} // namespace mozilla

namespace IPC {

/**
 * GsmGeographicalScope serializer.
 */
template <>
struct ParamTraits<mozilla::dom::cellbroadcast::GsmGeographicalScope>
  : public ContiguousEnumSerializer<
             mozilla::dom::cellbroadcast::GsmGeographicalScope,
             mozilla::dom::cellbroadcast::eGsmGeographicalScope_CellImmediate,
             mozilla::dom::cellbroadcast::eGsmGeographicalScope_EndGuard>
{};

/**
 * MessageClass serializer.
 */
template <>
struct ParamTraits<mozilla::dom::cellbroadcast::MessageClass>
  : public ContiguousEnumSerializer<
             mozilla::dom::cellbroadcast::MessageClass,
             mozilla::dom::cellbroadcast::eMessageClass_Normal,
             mozilla::dom::cellbroadcast::eMessageClass_EndGuard>
{};

/**
 * WarningType serializer.
 */
template <>
struct ParamTraits<mozilla::dom::cellbroadcast::WarningType>
  : public ContiguousEnumSerializer<
             mozilla::dom::cellbroadcast::WarningType,
             mozilla::dom::cellbroadcast::eWarningType_Earthquake,
             mozilla::dom::cellbroadcast::eWarningType_EndGuard>
{};

} // namespace IPC

#endif // mozilla_dom_cellbroadcast_Types_h
