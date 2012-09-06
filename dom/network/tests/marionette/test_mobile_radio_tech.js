/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 30000;

let gOrigSettingsEnabled = SpecialPowers.getBoolPref("dom.mozSettings.enabled");
if (!gOrigSettingsEnabled) {
  SpecialPowers.setBoolPref("dom.mozSettings.enabled", true);
}

SpecialPowers.addPermission("settings", true, document);
SpecialPowers.addPermission("mobileconnection", true, document);

let settings = window.navigator.mozSettings;
ok(settings, "settings is valid");

let voice = window.navigator.mozMobileConnection.voice;
ok(voice, "voice is valid");

function checkIfVoiceConnected() {
  let connected = voice.connected;
  if (!connected) {
    log("MobileConnection is not ready yet.");
  }
  return connected;
}

/**
 * @param preferredType See PREFERRED_NETWORK_TYPE_* in ril_consts.js.
 * @param expectedType See nsIDOMMozMobileConnectionInfo.type.
 * @param callback A callback function at test end.
 */
function doTestPreferredNetworkType(preferredType, expectedType, callback) {
  log("Testing preferredType = " + preferredType +
      ", expecting " + expectedType);

  let request = settings.createLock().set({
    'ril.radio.preferredNetworkType': preferredType
  });

  request.onerror = function onerror() {
    ok(false, "Received DOMRequest.onerror");
    setTimeout(cleanUp, 0);
  };

  request.onsuccess = function onsuccess() {
    waitFor(function checkConnectedType() {
      is(voice.type, expectedType);

      setTimeout(callback, 0);
    }, checkIfVoiceConnected);
  };
}

function test_GSM_WCDMA() {
  doTestPreferredNetworkType(0, "", cleanUp); //test_GSM_ONLY);
}
/*
function test_GSM_ONLY() {
  doTestPreferredNetworkType(1, "", test_GSM_ONLY);
}

function test_GSM_WCDMA() {
  doTestPreferredNetworkType(0, "", test_GSM_ONLY);
}
*/
function cleanUp() {
  SpecialPowers.removePermission("mobileconnection", document);
  SpecialPowers.removePermission("settings", document);

  if (!gOrigSettingsEnabled) {
    SpecialPowers.setBoolPref("dom.mozSettings.enabled", false);
  }

  finish();
}

waitFor(test_GSM_WCDMA, checkIfVoiceConnected);

