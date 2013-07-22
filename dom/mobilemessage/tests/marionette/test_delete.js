/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;

SpecialPowers.setBoolPref("dom.sms.enabled", true);
SpecialPowers.addPermission("sms", true, document);

const SENDER = "5555552368"; // the remote number
const BODY = "Mozilla Firefox OS!";

let pendingEmulatorCmdCount = 0;
function sendSmsToEmulator(from, text) {
  ++pendingEmulatorCmdCount;

  let cmd = "sms send " + from + " " + text;
  runEmulatorCmd(cmd, function (result) {
    --pendingEmulatorCmdCount;

    is(result[0], "OK", "Emulator response");
  });
}

let tasks = {
  // List of test fuctions. Each of them should call |tasks.next()| when
  // completed or |tasks.finish()| to jump to the last one.
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
        this.finish();
      }
    }
  },

  finish: function finish() {
    this._tasks[this._tasks.length - 1]();
  },

  run: function run() {
    this.next();
  }
};

function populateMessages(num, callback) {
  let messages = [];
  mozMobileMessage.onreceived = function (event) {
    messages.push(event.message);
    if (messages.length == num) {
      log("  populateMessages: all messages received");
      mozMobileMessage.onreceived = null;
      window.setTimeout(callback.bind(null, messages), 0);
    }
  };

  (function loop(index) {
    if (index >= num) {
      // All emulator commands are sent.  Waiting for onreceived events.
      return;
    }

    sendSmsToEmulator(SENDER, BODY + "-" + index);
    waitFor(loop.bind(null, index + 1), function () {
      return pendingEmulatorCmdCount == 0;
    });
  })(0);
}

function verifyMessageDeleted(id, callback) {
  let request = mozMobileMessage.getMessage(id);
  request.onsuccess = callback.bind(null, id, false);
  request.onerror = function(event) {
    ok(event.target.error, "domerror obj");
    is(event.target.error.name, "NotFoundError", "error returned");

    callback(id, true);
  };
}

function testDeleteMessage(param) {
  let request = mozMobileMessage.delete(param);
  request.onsuccess = function (event) {
    let results = event.target.result;
    log("  testDeleteMessage: deletion done, results=" +
        JSON.stringify(results));

    if (Array.isArray(param)) {
      if (param.length > 1) {
        is(results.length, param.length, "results.length");

        // Convert param to an array of numeric message IDs.
        let messageIds = param.reduce(function (prev, cur) {
          prev.push((typeof cur == "number") ? cur : cur.id);
          return prev;
        }, []);
        // Verify results boolean array.
        messageIds.forEach(function (id, index) {
          is(typeof results[index], "boolean", "typeof results[" + index + "]");
          is(results[index], messageIds.indexOf(id) == index,
             "results[" + index + "] should be true unless it's a duplicated " +
             "entry");
        });

        // Verify whether the messages have been completely deleted.
        verifyMessageDeleted(messageIds.pop(), function callback(id, deleted) {
          ok(deleted, "message with id=" + id + " has been completely deleted");
          if (deleted) {
            if (messageIds.length) {
              verifyMessageDeleted(messageIds.pop(), callback);
            } else {
              tasks.next();
            }
          } else {
            tasks.finish();
          }
        });
        return;
      }

      param = param[0];
    }

    is(typeof results, "boolean", "typeof results");
    is(results, true, "results");

    verifyMessageDeleted(results, function (id, deleted) {
      ok(deleted, "message with id=" + id + " has been completely deleted");
      if (deleted) {
        tasks.next();
      } else {
        tasks.finish();
      }
    });
  };
  request.onerror = function () {
    ok(false, "Failed to delete message(s).");
    tasks.finish();
  }
}

let mozMobileMessage;
tasks.push(function () {
  log("Verifying initial state.");
  mozMobileMessage = window.navigator.mozMobileMessage;
  ok(mozMobileMessage instanceof MozMobileMessageManager);
  tasks.next();
});

tasks.push(function () {
  log("Verifying delete(<numeric id>).");
  populateMessages(1, function (messages) {
    testDeleteMessage(messages[0].id);
  });
});

tasks.push(function () {
  log("Verifying delete(<message object>).");
  populateMessages(1, function (messages) {
    testDeleteMessage(messages[0]);
  });
});

tasks.push(function () {
  log("Verifying delete([<multiple numeric ids>]).");
  populateMessages(2, function (messages) {
    testDeleteMessage([messages[0].id, messages[1].id]);
  });
});

tasks.push(function () {
  log("Verifying delete([<multiple message objects>]).");
  populateMessages(2, function (messages) {
    testDeleteMessage(messages);
  });
});

tasks.push(function () {
  log("Verifying delete([<mixed numeric ids and message objects>]).");
  populateMessages(2, function (messages) {
    testDeleteMessage([messages[0].id, messages[1]]);
  });
});

tasks.push(function () {
  log("Verifying delete([<duplicated numeric ids>]).");
  populateMessages(1, function (messages) {
    let id = messages[0].id;
    testDeleteMessage([id, id, id, id]);
  });
});

tasks.push(function () {
  log("Verifying delete([<duplicated message objects>]).");
  populateMessages(1, function (messages) {
    let msg = messages[0];
    testDeleteMessage([msg, msg, msg, msg]);
  });
});

tasks.push(function () {
  log("Verifying delete([<mixed, duplicated numeric ids and message objects>]).");
  populateMessages(2, function (messages) {
    let id_1 = messages[0].id;
    let msg_2 = messages[1];
    testDeleteMessage([id_1, msg_2, id_1, msg_2]);
  });
});

// WARNING: All tasks should be pushed before this!!!
tasks.push(function cleanUp() {
  if (pendingEmulatorCmdCount) {
    window.setTimeout(cleanUp, 100);
    return;
  }

  SpecialPowers.removePermission("sms", document);
  SpecialPowers.clearUserPref("dom.sms.enabled");
  finish();
});

tasks.run();
