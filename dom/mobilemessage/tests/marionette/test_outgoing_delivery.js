/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 40000;

SpecialPowers.setBoolPref("dom.sms.enabled", true);
SpecialPowers.addPermission("sms", true, document);

// ST - Status
// Bit 7..0 = 000xxxxx, short message transaction completed
const PDU_ST_0_RECEIVED          = 0x00;
const PDU_ST_0_RESERVED_BEGIN    = 0x03;
const PDU_ST_0_SC_SPECIFIC_BEGIN = 0x10;
// Bit 7..0 = 001xxxxx, temporary error, SC still trying to transfer SM
const PDU_ST_1_CONGESTION        = 0x20;
const PDU_ST_1_RESERVED_BEGIN    = 0x26;
const PDU_ST_1_SC_SPECIFIC_BEGIN = 0x30;
// Bit 7..0 = 010xxxxx, permanent error, SC is not making any more transfer
// attempts
const PDU_ST_2_RPC_ERROR         = 0x40;
const PDU_ST_2_RESERVED_BEGIN    = 0x4A;
const PDU_ST_2_SC_SPECIFIC_BEGIN = 0x50;
// Bit 7..0 = 011xxxxx, temporary error, SC is not making any more transfer
// attempts
const PDU_ST_3_CONGESTION        = 0x60;
const PDU_ST_3_RESERVED_BEGIN    = 0x66;
const PDU_ST_3_SC_SPECIFIC_BEGIN = 0x70;

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

function sendSmsDrpt(values, callback) {
  let cmd;
  if (!values) {
    cmd = "sms drpt off";
  } else {
    cmd = "sms drpt on," + values.join(",");
  }
  runEmulatorCmd(cmd, function (results) {
    is(results[0], "OK", "Emulator response");
    callback(results[0] == "OK");
  });
}

function getSmsMref(callback) {
  runEmulatorCmd("sms mref", function (results) {
    is(results[1], "OK", "Emulator response");
    callback(results[1] == "OK", parseInt(results[0], 10));
  });
}

function doSimpleTest(body, status, drpt) {
  log("Simple test with body: \"" + body + "\", status: " + status
      + ", drpt: " + JSON.stringify(drpt));

  sendSmsDrpt(drpt, function (emulatorOk) {
    if (!emulatorOk) {
      tasks.next();
      return;
    }

    let eventCb = function (status, event) {
      let message = event.message;
      is(message.delivery, "sent", "message.delivery");
      is(message.deliveryStatus, status, "message.deliveryStatus");

      sms.removeEventListener("deliverysuccess", successCb);
      sms.removeEventListener("deliveryerror", errorCb);

      if (message.deliveryStatus == status) {
        tasks.next();
      } else {
        tasks.abort();
      }
    };

    let successCb = eventCb.bind(null, "success");
    sms.addEventListener("deliverysuccess", successCb);

    let errorCb = eventCb.bind(null, "error");
    sms.addEventListener("deliveryerror", errorCb);

    sms.send("123456789", body);
  });
}

function doPendingTest(body, status, drpt) {
  log("Pending test with body: \"" + body + "\", status: " + status
      + ", drpt: " + JSON.stringify(drpt));

  sendSmsDrpt([PDU_ST_1_CONGESTION], function (emulatorOk) {
    if (!emulatorOk) {
      tasks.next();
      return;
    }

    let request = sms.send("123456789", body);
    request.onsuccess = getSmsMref.bind(null, function (emulatorOk, mref) {
      if (!emulatorOk) {
        tasks.next();
        return;
      }

      sendSmsDrpt(drpt, function (emulatorOk) {
        if (!emulatorOk) {
          tasks.next();
          return;
        }

      });
    });
  });
}

// Normal success.
tasks.push(doSimpleTest.bind(null, "a", "success", [PDU_ST_0_RECEIVED]));

// Pending delivery status.
//tasks.push(doPendingTest.bind(null, "a", "success", [PDU_ST_0_RECEIVED]));
//tasks.push(doPendingTest.bind(null, "a", "false",   [PDU_ST_0_RECEIVED]));

// Any reserved but not SC specific status code is considered failed.
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_0_RESERVED_BEGIN]));
tasks.push(doSimpleTest.bind(null, "a", "success", [PDU_ST_0_SC_SPECIFIC_BEGIN]));
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_1_RESERVED_BEGIN]));
// Following test times out because ril_worker waits the pending status
// forever. This is expected and tested in doPendingTest.
//tasks.push(doSimpleTest.bind(null, "a", "success", [PDU_ST_1_SC_SPECIFIC_BEGIN]));

// Any status does belong to PDU_ST_0 and PDU_ST_1 is considered failed.
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_2_RPC_ERROR]));
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_2_RESERVED_BEGIN]));
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_2_SC_SPECIFIC_BEGIN]));
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_3_CONGESTION]));
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_3_RESERVED_BEGIN]));
tasks.push(doSimpleTest.bind(null, "a", "error",   [PDU_ST_3_SC_SPECIFIC_BEGIN]));

// WARNING: All tasks should be pushed before this!!!
tasks.push(function cleanUp() {
  if (pendingEmulatorCmdCount) {
    window.setTimeout(cleanUp, 100);
    return;
  }

  sendSmsDrpt(null, function (emulatorOk) {
    ok(emulatorOk, "Clear SMS DRPT setting");

    SpecialPowers.removePermission("sms", document);
    SpecialPowers.clearUserPref("dom.sms.enabled");
    finish();
  });
});

tasks.run();
