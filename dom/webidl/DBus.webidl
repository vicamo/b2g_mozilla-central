/* -*- Mode: IDL; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

dictionary DBusAnnotationInit
{
  DOMString key;
  DOMString value;
};

interface DBusAnnotation
{
  [Constant, Pure] readonly attribute DOMString key;
  [Constant, Pure] readonly attribute DOMString value;
};

interface DBusAnnotationArray
{
  unsigned long length;
  getter DBusAnnotation? item(unsigned long index);
};

dictionary DBusArgumentInit
{
  DOMString name;
  DOMString signature;
  sequence<DBusAnnotationInit>? annotations = null;
};

interface DBusArgument
{
  [Constant, Pure] readonly attribute DOMString name;
  [Constant, Pure] readonly attribute DOMString signature;
  [Constant, Pure] readonly attribute DBusAnnotationArray? annotations;
};

interface DBusArgumentArray
{
  unsigned long length;
  getter DBusArgument? item(unsigned long index);
};

dictionary DBusMethodInit
{
  DOMString name;
  sequence<DBusArgumentInit>? inArguments;
  sequence<DBusArgumentInit>? outArguments;
  sequence<DBusAnnotationInit>? annotations;
};

interface DBusMethod
{
  [Constant, Pure] readonly attribute DOMString name;
  [Constant, Pure] readonly attribute DBusArgumentArray? inArguments = null;
  [Constant, Pure] readonly attribute DBusArgumentArray? outArguments = null;
  [Constant, Pure] readonly attribute DBusAnnotationArray? annotations = null;
};

interface DBusMethodArray
{
  unsigned long length;
  getter DBusMethod? item(unsigned long index);
};

dictionary DBusSignalInit
{
  DOMString name;
  sequence<DBusArgumentInit>? arguments = null;
  sequence<DBusAnnotationInit>? annotations = null;
};

interface DBusSignal
{
  [Constant, Pure] readonly attribute DOMString name;
  [Constant, Pure] readonly attribute DBusArgumentArray? arguments;
  [Constant, Pure] readonly attribute DBusAnnotationArray? annotations;
};

interface DBusSignalArray
{
  unsigned long length;
  getter DBusSignal? item(unsigned long index);
};

dictionary DBusPropertyInit
{
  DOMString name;
  DOMString signature;
  boolean readable = true;
  boolean writable = false;
  sequence<DBusAnnotationInit>? annotations = null;
};

interface DBusProperty
{
  [Constant, Pure] readonly attribute DOMString name;
  [Constant, Pure] readonly attribute DOMString signature;
  [Constant, Pure] readonly attribute boolean readable;
  [Constant, Pure] readonly attribute boolean writable;
  [Constant, Pure] readonly attribute DBusAnnotationArray? annotations;
};

interface DBusPropertyArray
{
  unsigned long length;
  getter DBusProperty? item(unsigned long index);
};

dictionary DBusInterfaceInit
{
  DOMString name;
  sequence<DBusPropertyInit>? properties = null;
  sequence<DBusMethodInit>? methods = null;
  sequence<DBusSignalInit>? signals = null;
  sequence<DBusAnnotationInit>? annotations = null;
};

[Constructor(DBusInterfaceInit init)]
interface DBusInterface
{
  [Constant, Pure] readonly attribute DOMString name;
  [Constant, Pure] readonly attribute DBusPropertyArray? properties;
  [Constant, Pure] readonly attribute DBusMethodArray? methods;
  [Constant, Pure] readonly attribute DBusSignalArray? signals;
  [Constant, Pure] readonly attribute DBusAnnotationArray? annotations;
};
