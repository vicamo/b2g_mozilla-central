/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;

SpecialPowers.setBoolPref("dom.sms.enabled", true);
SpecialPowers.addPermission("sms", true, document);

const REMOTE = "12345";
// Shi Jing, lessons from the states, the odes of zhou and the south, Tao Yao.
const BODY = "The peach tree is young and elegant;\n" +
             "Brilliant are its flowers.\n" +
             "This young lady is going to her future home,\n" +
             "And will order well her chamber and house.";

let sms = window.navigator.mozSms;

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

function getAllMessages(callback, filter, reverse) {
  if (!filter) {
    filter = new MozSmsFilter;
  }
  let messages = [];
  let request = sms.getMessages(filter, reverse || false);
  request.onsuccess = function(event) {
    if (request.result) {
      messages.push(request.result);
      request.continue();
      return;
    }

    window.setTimeout(callback.bind(null, messages), 0);
  }
}

function deleteAllMessages() {
  getAllMessages(function deleteAll(messages) {
    let message = messages.shift();
    if (!message) {
      ok(true, "all messages deleted");
      tasks.next();
      return;
    }

    let request = sms.delete(message.id);
    request.onsuccess = deleteAll.bind(null, messages);
    request.onerror = function (event) {
      ok(false, "failed to delete all messages");
      tasks.finish();
    }
  });
}

function getAllThreads(callback) {
  let threads = [];
  let request = sms.getThreads();
  request.onsuccess = function(event) {
    if (request.result) {
      threads.push(request.result);
      request.continue();
      return;
    }

    window.setTimeout(callback.bind(null, threads), 0);
  }
}

tasks.push(function () {
  log("Verifying initial state.");
  ok(sms instanceof MozSmsManager, "mozSms");

  tasks.next();
});

tasks.push(function () {
  log("Deleting all messages.");
  deleteAllMessages();
});

let sentMessage;
tasks.push(function () {
  log("Sending one SMS message to " + BODY);
  let request = sms.send(REMOTE, BODY);
  request.onsuccess = function(event) {
    ok(true, "Received 'onsuccess' event.");
    sentMessage = event.target.result;
    tasks.next();
  };
  request.onerror = function(event) {
    ok(false, "Received 'onerror' event.");
    tasks.finish();
  };
});

tasks.push(function () {
  log("Verifying getThreads.");
  getAllThreads(function (threads) {
    is(threads.length, 1, "threads.length");
    let thread = threads[0];
    is(thread.id, sentMessage.threadId, "thread.id");
    is(thread.body, sentMessage.body, "thread.body");
    is(thread.unreadCount, 0, "thread.unreadCount");
    is(thread.timestamp.getTime(), sentMessage.timestamp.getTime(), "thread.timestamp");
    is(thread.lastMessageType, sentMessage.type, "thread.lastMessageType");
    tasks.next();
  });
});

tasks.push(function () {
  log("Verifying getThread.");
  let request = sms.getThread(sentMessage.threadId);
  request.onsuccess = function(event) {
    ok(true, "Received 'onsuccess' event.");
    let thread = event.target.result;
    is(thread.id, sentMessage.threadId, "thread.id");
    is(thread.body, sentMessage.body, "thread.body");
    is(thread.unreadCount, 0, "thread.unreadCount");
    is(thread.timestamp.getTime(), sentMessage.timestamp.getTime(), "thread.timestamp");
    is(thread.lastMessageType, sentMessage.type, "thread.lastMessageType");
    tasks.next();
  };
  request.onerror = function(event) {
    ok(false, "Received 'onerror' event.");
    tasks.finish();
  };
});

tasks.push(deleteAllMessages);

// WARNING: All tasks should be pushed before this!!!
tasks.push(function cleanUp() {
  SpecialPowers.removePermission("sms", document);
  SpecialPowers.clearUserPref("dom.sms.enabled");

  finish();
});

tasks.run();
