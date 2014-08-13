/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

enum NetworkType {
  "cellular",
  "ethernet",
  "wifi"
};

interface NetworkDevice : EventTarget
{
  [Constant] readonly attribute DOMString uuid;

  [Constant] readonly attribute NetworkType type;

  /**
   * A human readable name, e.g. "Ethernet 0".
   */
  [Constant] readonly attribute DOMString name;

  /**
   * Enabled state of a NetworkDevice. When changed, an 'enabled' event is
   * dispatched.
   */
  readonly attribute boolean enabled;

  /**
   * Enable/disable this NetworkDevice.
   *
   * Return a Promise that resolves when the enabled is set to the requested
   * state and rejects otherwise.
   *
   * @return A Promise that resolves with no value.
   */
  Promise<void> setEnabled(boolean enabled);

  attribute EventHandler onenabled;
  attribute EventHandler onremove;
};

interface NetworkDeviceArray {
  getter NetworkDevice? item(unsigned long index);
  readonly attribute unsigned long length;
};

dictionary NetworkConnectionProperties
{
  // Unique ID for each NetworkConnection. When omitted, an uuid is assigned.
  DOMString? uuid;
  DOMString name;
};

interface NetworkConnection : EventTarget
{
  [Constant] readonly attribute DOMString uuid;

  readonly attribute DOMString name;

  /**
   * Modify current NetworkConnection with specified properties.
   */
  Promise<NetworkConnection> update(optional NetworkConnectionProperties properties);

  Promise<ActiveNetworkConnection> activate(optional (NetworkDevice or NetworkConnection) detail);

  attribute EventHandler onchange;
  attribute EventHandler onremove;
};

enum ActiveNetworkConnectionState
{
  "activating",
  "activated",
  "deactivating",
  "deactivated"
};

interface ActiveNetworkConnection : EventTarget
{
  [Constant] readonly attribute DOMString uuid;

  readonly attribute NetworkDeviceArray devices;

  readonly attribute NetworkConnection connection;

  readonly attribute ActiveNetworkConnectionState state;

  readonly attribute boolean isDefault;
  readonly attribute boolean isDefault6;

  attribute EventHandler onchange;
};

[NavigatorProperty="mozWifiManager"]
interface NetworkManager : EventTarget
{
  Promise<sequence<NetworkConnection>> getConnections();

  Promise<NetworkConnection> getConnectionByUuid(DOMString uuid);

  Promise<sequence<NetworkConnection>> getConnectionsByName(DOMString name);

  Promise<sequence<NetworkConnection>> getConnectionsByType(NetworkType type);

  /**
   * Add a new connection.
   *
   * @return A Promise. When resolved,
   */
  Promise<NetworkConnection> addConnection(optional any properties);

  Promise<void> removeConnection((NetworkConnection or DOMString) connection);

  Promise<sequence<ActiveNetworkConnection>> getActiveConnections();

  Promise<sequence<NetworkDevice>> getDevices();

  attribute EventHandler ondeviceadded;
  attribute EventHandler onconnectionadded;
};

////// Wired (Ethernet) Related Interfaces. //////

interface WiredNetworkDevice : NetworkDevice
{
  // Hardware address of the NetworkDevice.
  [Constant] readonly attribute DOMString hwAddress;

  // Design speed of the device, in megabits/second (Mb/s).
  [Constant] readonly attribute unsigned long speed;

  // Indicates whether the physical carrier is found (e.g. whether a cable is
  // plugged in or not).
  readonly attribute boolean connected;

  attribute EventHandler onconnected;
};

////// Wireless Related Interfaces. //////

interface WirelessAccessPoint
{
  readonly attribute DOMString ssid;
  readonly attribute DOMString bssid;
};

interface WirelessNetworkDevice : NetworkDevice
{
  [Constant] readonly attribute MozWifiCapabilities capabilities;

  readonly attribute WirelessAccessPoint? activeAccessPoint;

  Promise<sequence<WirelessAccessPoint>> getAccessPoints();

  Promise<void> scan();

  Promise<void> setPowerSavingMode(boolean enabled);

  attribute EventHandler onaccesspointadded;
  attribute EventHandler onaccesspointremoved;
};
