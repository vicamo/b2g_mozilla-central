/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

const SENDER = "5555552368";
const RECEIVER = EMULATOR_PHONENUM(0);
const BODY = "Hello SMS world!";

startTestCommon(function testCaseMain() {
  log("Testing incomng SMS");

  let deferred = Promise.defer();

  manager.addEventListener('received', function onreceived(event) {
    manager.removeEventListener('received', onreceived);

    log("  Got incoming message");

    let message = event.message;
    ok(message instanceof MozSmsMessage, "Message is instanceof MozSmsMessage");

    ok(message.threadId, "thread id");
    is(message.delivery, "received", "Message delivery");
    is(message.deliveryStatus, "success", "Delivery status");
    is(message.sender, SENDER, "Message sender");
    is(message.receiver, RECEIVER, "Message receiver");
    is(message.body, BODY, "Message body");
    is(message.messageClass, "normal", "Message class");
    is(message.deliveryTimestamp, 0, "deliveryTimestamp is 0");

    deferred.resolve();
  });

  sendTextSmsToEmulator(SENDER, BODY)
    .then(null, () => deferred.reject());

  return deferred.promise;
});
