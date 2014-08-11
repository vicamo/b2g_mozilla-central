/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_icc_EnumHelpers_h
#define mozilla_dom_icc_EnumHelpers_h

#include "mozilla/dom/MozIccBinding.h"

namespace mozilla {
namespace dom {
namespace icc {

namespace details {

/**
 * Dummy enum traits for catching unsupported enum types.
 */
template <typename T> struct EnumTraits {};

/**
 * Trivial enum trait for directly mapped enum types.
 */
template <typename T>
struct StaticEnumTraits
{
  typedef T EnumType;

  static MOZ_CONSTEXPR EnumType
  x2w(uint32_t aXpidlConstant)
  {
    return static_cast<EnumType>(aXpidlConstant);
  }

  static MOZ_CONSTEXPR uint32_t
  w2x(EnumType aWebidlEnum)
  {
    return static_cast<uint32_t>(aWebidlEnum);
  }
};

template <> struct EnumTraits<IccCardState> : public StaticEnumTraits<IccCardState> {};
template <> struct EnumTraits<IccMvnoType> : public StaticEnumTraits<IccMvnoType> {};
template <> struct EnumTraits<IccContactType> : public StaticEnumTraits<IccContactType> {};
template <> struct EnumTraits<IccCardLockType> : public StaticEnumTraits<IccCardLockType> {};

template <>
struct EnumTraits<IccErrorNames>
{
  typedef IccErrorNames EnumType;

  static MOZ_CONSTEXPR EnumType
  x2w(uint32_t aXpidlConstant)
  {
    // nsIRilCallback::SUCCESS (0) does not have corresponding part in IccErrorNames.
    return static_cast<EnumType>(aXpidlConstant - 1);
  }

  static MOZ_CONSTEXPR uint32_t
  w2x(EnumType aWebidlEnum)
  {
    // Offset by 1 for nsIRilCallback::SUCCESS (0).
    return static_cast<uint32_t>(aWebidlEnum) + 1;
  }
};

} // namespace details

/**
 * Helper function for converting from XPIDL constants to WebIDL enums.
 */
template <typename T>
MOZ_CONSTEXPR T
ToWebidlEnum(uint32_t aXpidlConstant)
{
  return details::EnumTraits<T>::x2w(aXpidlConstant);
}

/**
 * Helper function for converting from WebIDL enums to XPIDL constants.
 */
template <typename T>
MOZ_CONSTEXPR uint32_t
ToXpidlEnum(T aWebidlEnum)
{
  return details::EnumTraits<T>::w2x(aWebidlEnum);
}

template <typename T>
const nsAString&
ToString(T aWebidlEnum);

} // namespace icc
} // namespace dom
} // namespace mozilla

#endif // mozilla_dom_icc_EnumHelpers_h
