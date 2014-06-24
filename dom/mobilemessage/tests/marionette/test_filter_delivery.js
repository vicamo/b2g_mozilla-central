/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

const NUMBER_OF_MESSAGES = 5;
const REMOTE_FROM = "5552229797";
const REMOTE_TO = "5557779999";

let numSentMessages = 0, numReceivedMessages = 0;

/**
 * Check if numbers of received/sent messages are correct.
 */
function checkMessages() {
  // Retrieve all received messages.
  let filter = new MozSmsFilter();
  filter.delivery = "received";
  return getMessages(filter)
    .then(function(aFoundReceivedMessages) {
      // Retrieve all sent messages then.
      filter.delivery = "sent";
      return getMessages(filter)
        .then(function(aFoundSentMessages) {
          log("  Got " + aFoundReceivedMessages.length + " received messages, " +
              aFoundSentMessages.length + " sent messages");

          is(aFoundReceivedMessages.length, numReceivedMessages,
             "aFoundReceivedMessages.length");
          is(aFoundSentMessages.length, numSentMessages,
             "aFoundSentMessages.length");
	});
    });
}

function simulateIncomingSms(aText) {
  log(aText + ", num sent: " + numSentMessages + ", num received: " +
      numReceivedMessages);

  return sendTextSmsToEmulatorAndWait(REMOTE_FROM, aText)
    .then(function() {
      ++numReceivedMessages;
      return checkMessages();
    });
}

function simulateOutgoingSms(aText) {
  log(aText + ", num sent: " + numSentMessages + ", num received: " +
      numReceivedMessages);

  return sendSmsWithSuccess(REMOTE_TO, aText)
    .then(function() {
      ++numSentMessages;
      return checkMessages();
    });
}

startTestCommon(function() {
  // Check initial state.
  return checkMessages(numSentMessages, numReceivedMessages)
    .then(function() {
      let promise = Promise.resolve();

      // Receive and send message by turns and verify the numbers of received
      // and sent messages.
      for (let i = 0; i < NUMBER_OF_MESSAGES; i++) {
        let receivedText = "Incoming message " + i;
        let sentText = "Outgoing message " + i;

        promise = promise.then(() => simulateIncomingSms(receivedText))
                         .then(() => simulateOutgoingSms(sentText));
      }

      return promise;
    });
});
