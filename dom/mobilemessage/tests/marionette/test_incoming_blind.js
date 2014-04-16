/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

// In this test case we want to test if an incoming message can still
// arrive onreceive event listenr without prior calls to any MobileMessage
// APIs.

const SENDER = "0987654321";
const BODY = "Hi";

// Use startTestBase to skip deleteAllMessages() calls in startTestCommon().
startTestBase(function testCaseMain() {
  return ensureMobileMessage()
    .then(() => sendTextSmsToEmulatorAndWait(SENDER, BODY))
    .then(function(aValues) {
      ok(Array.isArray(aValues), "aValues should be an array");
      is(aValues.length, 2, "aValues should have two elements");

      let domMessage = aValues[0].message;
      ok(domMessage instanceof MozSmsMessage,
         "domMessage is an instance of MozSmsMessage");
      is(domMessage.sender, SENDER, "domMessage.sender");
      is(domMessage.body, BODY, "domMessage.body");
    });
});
