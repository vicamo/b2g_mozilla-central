/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 40000;

SpecialPowers.setBoolPref("dom.sms.enabled", true);
SpecialPowers.addPermission("sms", true, document);

/**
 * See 3GPP TS 24.011 Annex E: `This cause indicates that the network is
 * not functioning correctly and that the condition is not likely to last a
 * long period of time; e.g., the Mobile Station may wish to try another
 * short message transfer attempt almost immediately.`
 */
const CMSE_TEMPORARY_FAILURE = 41;

const SMS_RETRY_MAX = 3;

let sms = window.navigator.mozSms;
ok(sms instanceof MozSmsManager, "SmsManager is valid");

let tasks = {
  // List of test fuctions. Each of them should call |tasks.next()| when
  // completed or |tasks.abort()| to jump to the last one.
  _tasks: [],
  _nextTaskIndex: 0,

  push: function push(func) {
    this._tasks.push(func);
  },

  next: function next() {
    let index = this._nextTaskIndex++;
    let task = this._tasks[index];
    try {
      task();
    } catch (ex) {
      ok(false, "test task[" + index + "] throws: " + ex);
      // Run last task as clean up if possible.
      if (index != this._tasks.length - 1) {
        this.abort();
      }
    }
  },

  abort: function abort() {
    this._tasks[this._tasks.length - 1]();
  },

  run: function run() {
    this.next();
  }
};

let pendingEmulatorCmdCount = 0;
function sendEmulatorCommand(cmd, callback) {
  ++pendingEmulatorCmdCount;

  runEmulatorCmd(cmd, function (results) {
    --pendingEmulatorCmdCount;
    if (callback) {
      callback(results);
    }
  });
}

function sendSmsCmse(values, callback) {
  let cmd;
  if (!values) {
    cmd = "sms cmse off";
  } else {
    cmd = "sms cmse on," + values.join(",");
  }
  runEmulatorCmd(cmd, function (results) {
    is(results[0], "OK", "Emulator response");
    callback(results[0] == "OK");
  });
}

function times(str, n) {
  return (new Array(n + 1)).join(str);
}

function makeCMSE(value, n) {
  let array = [];
  while (n--) {
    array.push(value);
  }
  return array;
}

function append0(array) {
  array.push(0);
  return array;
}

function doTest(body, shouldSuccess, cmse) {
  log("Testing body: \"" + body + "\", success: " + shouldSuccess
      + ", cmse: " + JSON.stringify(cmse));

  sendSmsCmse(cmse, function (emulatorOk) {
    if (!emulatorOk) {
      tasks.next();
      return;
    }

    let eventSuccess = null, requestSuccess = null;

    // Check onsent a/o onfailed event for bug 787370.
    let eventCb = function (delivery, status, success, event) {
      let message = event.message;
      is(message.delivery, delivery, "message.delivery");
      is(message.deliveryStatus, status, "message.deliveryStatus");

      ok(eventSuccess == null, "either sms.onsent or onfailed received")
      eventSuccess = success;
      done();
    };
    let sentEventCb = eventCb.bind(null, "sent", "pending", true);
    let failedEventCb = eventCb.bind(null, "error", "error", false);

    let reqCb = function (delivery, status, success, event) {
      // Only checks message delivery & deliveryStatus when it's from
      // onsuccess event because onerror event has only error code.
      if (success) {
        let message = event.target.result;
        is(message.delivery, delivery, "message.delivery");
        // Check deliveryStatus for bug 742790.
        is(message.deliveryStatus, status, "message.deliveryStatus");
      }

      ok(requestSuccess == null, "either request.onsuccess or onerror received")
      requestSuccess = success;
      done();
    };

    let done = function () {
      if ((eventSuccess == null) || (requestSuccess == null)) {
        return;
      }

      sms.removeEventListener("sent", sentEventCb);
      sms.removeEventListener("failed", failedEventCb);

      is(shouldSuccess, requestSuccess, "request result matches");
      is(shouldSuccess, eventSuccess, "event result matches");
      if ((shouldSuccess == requestSuccess) &&
          (shouldSuccess == eventSuccess)) {
        tasks.next();
      } else {
        tasks.abort();
      }
    };

    sms.addEventListener("sent", sentEventCb);
    sms.addEventListener("failed", failedEventCb);

    let request = sms.send("123456789", body);
    request.onsuccess = reqCb.bind(null, "sent", "pending", true);
    request.onerror = reqCb.bind(null, "error", "error", false);
  });
}

// Disable CMS Errors. All messages should pass.
tasks.push(doTest.bind(null, "a", true, null));
// Same but multipart. Bug 819937.
tasks.push(doTest.bind(null, times("1234567890", 20), true, null));

// Enable CMS Errors but with OK. All messages should pass.
tasks.push(doTest.bind(null, "a", true, [0]));
tasks.push(doTest.bind(null, "a", true, [0, 0]));
// Same but multipart. Bug 819937.
tasks.push(doTest.bind(null, times("1234567890", 20), true, [0]));
tasks.push(doTest.bind(null, times("1234567890", 20), true, [0, 0]));

// Enable CMS Errors. All messages should fail.
tasks.push(doTest.bind(null, "a", false, [1]));
tasks.push(doTest.bind(null, times("1234567890", 20), false, [1]));

// Enable CMS Errors. We retry SMS_RETRY_MAX times on error.
for (let i = 0; i < SMS_RETRY_MAX; i++) {
  tasks.push(doTest.bind(null, "a", true,
                         append0(makeCMSE(CMSE_TEMPORARY_FAILURE, i + 1))));
}
tasks.push(doTest.bind(null, "a", false,
                       append0(makeCMSE(CMSE_TEMPORARY_FAILURE,
                                        SMS_RETRY_MAX + 1))));

// Enable CMS Errors. Any part of a multipart message fails, it fails all.
tasks.push(doTest.bind(null, times("1234567890", 20), false,
                       append0(makeCMSE(CMSE_TEMPORARY_FAILURE,
                                        SMS_RETRY_MAX + 1))));

// WARNING: All tasks should be pushed before this!!!
tasks.push(function cleanUp() {
  if (pendingEmulatorCmdCount) {
    window.setTimeout(cleanUp, 100);
    return;
  }

  sendSmsCmse(null, function (emulatorOk) {
    ok(emulatorOk, "Clear SMS CMSE setting");

    SpecialPowers.removePermission("sms", document);
    SpecialPowers.clearUserPref("dom.sms.enabled");
    finish();
  });
});

tasks.run();
