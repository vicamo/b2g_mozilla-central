/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

const FROM = "5551110000";

// Note: 378 chars and below is fine, but 379 and above will cause the issue.
// Sending first message works, but second one we get emulator callback but
// the actual SMS is never received, so script will timeout waiting for the
// onreceived event. Also note that a single larger message (i.e. 1600
// characters) works; so it is not a compounded send limit.
const TEXT_LENGTH = 379;
const TEXT = new Array(TEXT_LENGTH + 1).join('a');

function simulateIncomingSms(aFrom, aText) {
  log("Simulating incoming multipart SMS (" + aText.length + " chars total).");

  return sendTextSmsToEmulatorAndWait(aFrom, aText)
    .then(function(aMessage) {
      log("  Received 'onreceived' event.");

      ok(aMessage, "incoming sms");
      is(aMessage.body, aText, "msg body");
    });
}

startTestBase(function testCaseMain() {
  return ensureMobileMessage()
    .then(() => simulateIncomingSms(FROM, TEXT))
    .then(() => simulateIncomingSms(FROM, TEXT));
});
