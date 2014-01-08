/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 200000;

SpecialPowers.addPermission("mobileconnection", true, document);

// Permission changes can't change existing Navigator.prototype
// objects, so grab our objects from a new Navigator
let ifr = document.createElement("iframe");
let connection;
ifr.onload = function() {
  connection = ifr.contentWindow.navigator.mozMobileConnections[0];
  ok(connection instanceof ifr.contentWindow.MozMobileConnection,
     "connection is instanceof " + connection.constructor);
  testConnectionInfo();
};
document.body.appendChild(ifr);

let pendingEmulatorCmdCount = 0;
function runEmulatorCmdSafe(cmd, callback) {
  ++pendingEmulatorCmdCount;

  runEmulatorCmd(cmd, function (result) {
    --pendingEmulatorCmdCount;

    is(result[result.length - 1], "OK", "Emulator response");
    if (callback) {
      callback(result);
    }
  });
}

function setEmulatorVoiceState(state) {
  runEmulatorCmdSafe("gsm voice " + state);
}

function setEmulatorGsmLocation(lac, cid) {
  runEmulatorCmdSafe("gsm location " + lac + " " + cid);
}

function getEmulatorGsmLocation(callback) {
  runEmulatorCmdSafe("gsm location", function(result) {
    /* > gsm location
     * lac: -1
     * ci: -1
     * OK
     */
    // Initial LAC/CID. Android emulator initializes both value to 0xffff/0xfffffff.
    let lac = parseInt(result[0].substr(5), 10);
    lac = lac >= 0 ? lac : 0x10000 + lac;
    let cid = parseInt(result[1].substr(4), 10);
    cid = cid >= 0 ? cid : 0x10000000 + cid;

    callback(lac, cid);
  });
}

function testConnectionInfo() {
  let voice = connection.voice;
  is(voice.connected, true);
  is(voice.state, "registered");
  is(voice.emergencyCallsOnly, false);
  is(voice.roaming, false);

  testCellLocation();
}

function testCellLocation() {
  let cell = connection.voice.cell;

  // Emulator always reports valid lac/cid value because its AT command parser
  // insists valid value for every complete response. See source file
  // hardare/ril/reference-ril/at_tok.c, function at_tok_nexthexint().
  ok(cell, "location available");

  getEmulatorGsmLocation(function(lac, cid) {
    is(cell.gsmLocationAreaCode, lac);
    is(cell.gsmCellId, cid);
    is(cell.cdmaBaseStationId, -1);
    is(cell.cdmaBaseStationLatitude, -2147483648);
    is(cell.cdmaBaseStationLongitude, -2147483648);
    is(cell.cdmaSystemId, -1);
    is(cell.cdmaNetworkId, -1);

    testSetCellLocation();
  });
}

function testSetCellLocation() {
  let cell = connection.voice.cell;
  let lac = 1 + Math.floor(Math.random() * 100);
  let cid = 1 + Math.floor(Math.random() * 100);

  connection.addEventListener("voicechange", function onvoicechange() {
    connection.removeEventListener("voicechange", onvoicechange);

    is(cell.gsmLocationAreaCode, lac);
    is(cell.gsmCellId, cid);
    is(cell.cdmaBaseStationId, -1);
    is(cell.cdmaBaseStationLatitude, -2147483648);
    is(cell.cdmaBaseStationLongitude, -2147483648);
    is(cell.cdmaSystemId, -1);
    is(cell.cdmaNetworkId, -1);

    testSignalStrength();
  });

  setEmulatorGsmLocation(lac, cid);
}

function testSignalStrength() {
  // Android emulator initializes the signal strength to -99 dBm
  is(connection.voice.signalStrength, -99);
  is(connection.voice.relSignalStrength, 44);

  testUnregistered();
}

function testUnregistered() {
  setEmulatorVoiceState("unregistered");

  connection.addEventListener("voicechange", function onvoicechange() {
    connection.removeEventListener("voicechange", onvoicechange);

    is(connection.voice.connected, false);
    is(connection.voice.state, "notSearching");
    is(connection.voice.emergencyCallsOnly, true);
    is(connection.voice.roaming, false);
    is(connection.voice.cell, null);
    is(connection.voice.signalStrength, null);
    is(connection.voice.relSignalStrength, null);

    testSearching();
  });
}

function testSearching() {
  setEmulatorVoiceState("searching");

  connection.addEventListener("voicechange", function onvoicechange() {
    connection.removeEventListener("voicechange", onvoicechange);

    is(connection.voice.connected, false);
    is(connection.voice.state, "searching");
    is(connection.voice.emergencyCallsOnly, true);
    is(connection.voice.roaming, false);
    is(connection.voice.cell, null);
    is(connection.voice.signalStrength, null);
    is(connection.voice.relSignalStrength, null);

    testDenied();
  });
}

function testDenied() {
  setEmulatorVoiceState("denied");

  connection.addEventListener("voicechange", function onvoicechange() {
    connection.removeEventListener("voicechange", onvoicechange);

    is(connection.voice.connected, false);
    is(connection.voice.state, "denied");
    is(connection.voice.emergencyCallsOnly, true);
    is(connection.voice.roaming, false);
    is(connection.voice.cell, null);
    is(connection.voice.signalStrength, null);
    is(connection.voice.relSignalStrength, null);

    testRoaming();
  });
}

function testRoaming() {
  setEmulatorVoiceState("roaming");

  connection.addEventListener("voicechange", function onvoicechange() {
    connection.removeEventListener("voicechange", onvoicechange);

    is(connection.voice.connected, true);
    is(connection.voice.state, "registered");
    is(connection.voice.emergencyCallsOnly, false);
    is(connection.voice.roaming, true);

    // Android emulator initializes the signal strength to -99 dBm
    is(connection.voice.signalStrength, -99);
    is(connection.voice.relSignalStrength, 44);

    testHome();
  });
}

function testHome() {
  setEmulatorVoiceState("home");

  connection.addEventListener("voicechange", function onvoicechange() {
    connection.removeEventListener("voicechange", onvoicechange);

    is(connection.voice.connected, true);
    is(connection.voice.state, "registered");
    is(connection.voice.emergencyCallsOnly, false);
    is(connection.voice.roaming, false);

    // Android emulator initializes the signal strength to -99 dBm
    is(connection.voice.signalStrength, -99);
    is(connection.voice.relSignalStrength, 44);

    cleanUp();
  });
}

function cleanUp() {
  if (pendingEmulatorCmdCount > 0) {
    setTimeout(cleanUp, 100);
    return;
  }

  SpecialPowers.removePermission("mobileconnection", document);
  finish();
}
