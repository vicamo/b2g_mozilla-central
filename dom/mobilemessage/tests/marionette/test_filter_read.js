/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

const NUMBER_OF_MESSAGES = 10;
const REMOTE = "5552229797";

function simulateIncomingSms() {
  log("Populating messages");

  let promise = Promise.resolve();
  let messages = [];

  for (let i = 0; i < NUMBER_OF_MESSAGES; i++) {
    let text = "Incoming SMS number " + i;
    promise = promise.then(() => sendTextSmsToEmulatorAndWait(REMOTE, text))
                     .then(function(aMessage) {
                       messages.push(aMessage);
                       return messages;
                     });
  }

  return promise;
}

/**
 * Check if numbers of read/unread messages match those of given arguements.
 */
function checkMessages(aReadMessages, aUnreadMessages) {
  // Retrieve all read messages.
  let filter = new MozSmsFilter();
  filter.read = true;
  return getMessages(filter)
    .then(function(aFoundReadMessages) {
      // Retrieve all unread messages then.
      filter.read = false;
      return getMessages(filter)
        .then(function(aFoundUnreadMessages) {
          log("  Got " + aFoundReadMessages.length + " read messages, " +
              aFoundUnreadMessages.length + " unread messages");

          is(aFoundReadMessages.length, aReadMessages.length,
             "aFoundReadMessages.length");
          is(aFoundUnreadMessages.length, aUnreadMessages.length,
             "aFoundUnreadMessages.length");
	});
    });
}

startTestCommon(function() {
  return simulateIncomingSms()
    .then(function(aAllReceivedMessages) {
      log("  Got " + aAllReceivedMessages.length + " messages");

      let readMessages = [];
      let unreadMessages = aAllReceivedMessages.slice();

      // Check initial states.
      let promise = checkMessages(readMessages, unreadMessages);

      // For each message, set its read attribute to true and check again.
      for (let i = 0; i < aAllReceivedMessages.length; i++) {
        promise = promise.then(function() {
	  let message = unreadMessages.shift();
          readMessages.push(message);
          log("Test marking message " + message.id + ", read: " +
              readMessages.length + ", unread: " + unreadMessages.length);

          let request = manager.markMessageRead(message.id, true);
          return wrapDomRequestAsPromise(request)
            .then(() => checkMessages(readMessages, unreadMessages));
	});
      }

      return promise;
    });
});
