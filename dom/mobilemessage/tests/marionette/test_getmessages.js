/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

const REMOTE = "5552229797";
const NUM_MESSAGES = 10;

let smsList = new Array();

function isIn(aVal, aArray, aMsg) {
  ok(aArray.indexOf(aVal) >= 0, aMsg);
}

function simulateIncomingSms() {
  let promises = [];

  promises.push(waitForManagerEvent("received"));

  let text = "Incoming SMS number " + (smsList.length + 1);
  ok(true, text);
  promises.push(sendTextSmsToEmulator(REMOTE, text));

  return Promise.all(promises)
    .then(function(aResults) {
      let incomingSms = aResults[0].message;
      log("  Received SMS (id: " + incomingSms.id + ").");

      // Add newly received message to array of received msgs
      smsList.push(incomingSms);
    });
}

function populate() {
  log("Populating DB with incoming SMS messages");

  let promise = Promise.resolve();
  for (let i = 0; i < NUM_MESSAGES; i++) {
    promise = promise.then(simulateIncomingSms);
  }

  return promise.then(() => log("Received " + smsList.length + " sms messages in total."));
}

function verifyFoundMsgs(foundSmsList, reverse) {
  log("Verifying found messages: reverse=" + reverse);

  if (reverse) {
    smsList.reverse();
  }
  for (var x = 0; x < NUM_MESSAGES; x++) {
    is(foundSmsList[x].id, smsList[x].id, "id");
    is(foundSmsList[x].threadId, smsList[x].threadId, "thread id");
    is(foundSmsList[x].body, smsList[x].body, "body");
    is(foundSmsList[x].delivery, smsList[x].delivery, "delivery");
    is(foundSmsList[x].read, smsList[x].read, "read");

    // Bug 805799: receiver null when onreceived event is fired, until do a
    // getMessage. Default emulator (receiver) phone number is 15555215554
    if (!smsList[x].receiver) {
      isIn(foundSmsList[x].receiver, ["15555215554", "+15555215554"], "receiver");
    } else {
      isIn(foundSmsList[x].receiver, [smsList[x].receiver, "+15555215554"], "receiver");
    }

    isIn(foundSmsList[x].sender, [smsList[x].sender, "+15552229797"], "sender");
    is(foundSmsList[x].timestamp, smsList[x].timestamp, "timestamp");
    is(foundSmsList[x].sentTimestamp, smsList[x].sentTimestamp, "sentTimestamp");
  }
}

startTestCommon(function testCaseMain() {
  return populate()

    .then(() => getMessages(null, false))
    .then((aMessages) => verifyFoundMsgs(aMessages, false))

    .then(() => getMessages(null, true))
    .then((aMessages) => verifyFoundMsgs(aMessages, true))
});
