from marionette_test import *


class MobileMessageReferenceWorkloadTest(MarionetteTestCase):

    def make_reference_workload(self, message_count, number_count):
        self.marionette.execute_async_script("""
let MMS = SpecialPowers.Cu.import("resource://gre/modules/MmsPduHelper.jsm", {});
is(typeof MMS, "object", "namespace MMS");

let MMDB = SpecialPowers.Cu.import("resource://gre/modules/MobileMessageDB.jsm", {});
is(typeof MMDB, "object", "namespace MMDB");
is(typeof MMDB.MobileMessageDB, "function", "MMDB.MobileMessageDB");

const MESSAGE_COUNT = %d;
const NUMBER_COUNT = %d;

// non-random numbers come from contacts
const PERCENT_RANDOM_NUMBERS = 0.25;
// when we use BIG-THREAD, half the messages should end up there
const PERCENT_BIG_THREAD = 0.5;
const USE_BIG_THREAD = (MESSAGE_COUNT > 1500);
const BIG_SMS_THREAD_NAME = "BIG-THREAD-SMS";
const BIG_MMS_THREAD_NAME = "BIG-THREAD-MMS";
const BIG_MIXED_THREAD_NAME = "BIG-THREAD-MIXED";
const BIG_THREAD_PREFIX = "BIG-THREAD";

let SmsNumbers;
let SmsSentences;
let SmsMessageDate;

/***********************************************************/

function flipACoin(threshold) {
  return (Math.random() < threshold);
};

function pickRandomPhoneNumber() {
  if (!(USE_BIG_THREAD && flipACoin(PERCENT_BIG_THREAD))) {
    return SmsNumbers[Math.round(Math.random() * 10000) % SmsNumbers.length];
  }

  if (flipACoin(0.333)) {
    return BIG_MIXED_THREAD_NAME;
  }

  if (flipACoin(0.5)) {
    return BIG_MMS_THREAD_NAME;
  }

  return BIG_SMS_THREAD_NAME;
};

function pickRandomSentence() {
  return SmsSentences[Math.round(Math.random() * 10000) % SmsSentences.length];
};

function timestampForNumber(phoneNumber) {
  // we want the special number thread to be first or close to first.
  SmsMessageDate += Math.round((Math.random() * 20 * 60 * 1000)); // add 0-20 minutes to the time
  if (phoneNumber.startsWith(BIG_THREAD_PREFIX))
    return Math.max(SmsMessageDate + (120 * 60 * 1000), Date.now()); // two hours past

  return SmsMessageDate;
};

function createReceivedSmsMessage(phoneNumber) {
  let msg = {};
  // mandatory fields for MobileMessageDB
  msg.type = "sms";
  msg.messageClass = "normal";
  msg.receiver = "226-934-4596";
  msg.sender = phoneNumber;
  msg.timestamp = timestampForNumber(phoneNumber);

  msg.body = "received sms - " + pickRandomSentence();
  return msg;
};

function createSentSmsMessage(phoneNumber) {
  let msg = {};
  // mandatory fields for MobileMessageDB
  msg.type = "sms";
  msg.receiver = phoneNumber;
  msg.sender = "226-934-4596";
  msg.timestamp = timestampForNumber(phoneNumber);
  msg.deliveryStatusRequested = true;

  msg.body = "sent sms - " + pickRandomSentence();
  return msg;
};

function createReceivedMmsMessage(phoneNumber, index, testImageBlob) {
  let msg = {};
  // mandatory fields for MobileMessageDB
  msg.type = "mms";
  msg.receivers = ["226-934-4596"];
  msg.phoneNumber = "226-934-4596";
  msg.timestamp = timestampForNumber(phoneNumber);
  msg.delivery = "received";
  msg.deliveryStatus = "success";

  msg.headers = {};
  // mandatory fields for M-Notification.ind
  msg.headers["x-mms-message-type"] = MMS.MMS_PDU_TYPE_RETRIEVE_CONF;
  msg.headers["x-mms-mms-version"] = MMS.MMS_VERSION_1_3;
  msg.headers["x-mms-transaction-id"] = index.toString();
  msg.headers["x-mms-message-class"] = "personal";
  msg.headers["x-mms-message-size"] = 0;
  msg.headers["x-mms-content-location"] = "http://mmsc/" + index.toString();
  msg.headers["x-mms-expiry"] = 7 * 24 * 60 * 60;
  // mandatory fields for M-Retrieve.conf
  msg.headers["date"] = new Date(msg.timestamp);
  msg.headers["content-type"] = {};
  msg.headers["content-type"]["media"] = "application/vnd.wap.multipart.related";
  msg.headers["content-type"]["params"] = {};
  msg.headers["content-type"]["params"]["type"] = "application/smil";
  msg.headers["content-type"]["params"]["start"] = "<smil>";

  msg.headers.subject = "subject";
  msg.headers.to = [];
  msg.headers.to[0] = {};
  msg.headers.to[0]["address"] = "+12269344596";
  msg.headers.to[0]["type"] = "PLMN";

  msg.parts = [];
  let textContent = "received - " + pickRandomSentence();
  let smilContent = '<smil><body><par><img src="cid:2"/><text src="cid:1"/></par></body></smil>';
  msg.parts[0] = {};
  msg.parts[0]["headers"] = {};
  msg.parts[0]["headers"]["content-id"] = "<smil>";
  msg.parts[0]["headers"]["content-location"] = "smil.xml";
  msg.parts[0]["headers"]["content-length"] = smilContent.length;
  msg.parts[0]["headers"]["content-type"] = {};
  msg.parts[0]["headers"]["content-type"]["media"] = "application/smil";
  msg.parts[0]["headers"]["content-type"]["params"] = {};
  msg.parts[0]["headers"]["content-type"]["params"]["name"] = "smil.xml";
  msg.parts[0]["content"] = smilContent;
  
  msg.parts[1] = {};
  msg.parts[1]["headers"] = {};
  msg.parts[1]["headers"]["content-id"] = "<1>";
  msg.parts[1]["headers"]["content-location"] = "text_0.txt";
  msg.parts[1]["headers"]["content-length"] = textContent.length;
  msg.parts[1]["headers"]["content-type"] = {};
  msg.parts[1]["headers"]["content-type"]["media"] = "text/plain";
  msg.parts[1]["headers"]["content-type"]["params"] = {};
  msg.parts[1]["headers"]["content-type"]["params"]["name"] = "text_0.txt";
  msg.parts[1]["content"] = new Blob([textContent], {type: 'text/plain'});

  msg.parts[2] = {};
  msg.parts[2]["headers"] = {};
  msg.parts[2]["headers"]["content-id"] = "<2>";
  msg.parts[2]["headers"]["content-location"] = "kitten-450.jpg";
  msg.parts[2]["headers"]["content-length"] = testImageBlob.size;
  msg.parts[2]["headers"]["content-type"] = {};
  msg.parts[2]["headers"]["content-type"]["media"] = "image/jpeg";
  msg.parts[2]["headers"]["content-type"]["params"] = {};
  msg.parts[2]["headers"]["content-type"]["params"]["name"] = "kitten-450.jpg";
  msg.parts[2]["content"] = testImageBlob;
  return msg;
};

function createSentMmsMessage(phoneNumber, index, testImageBlob) {
  let msg = {};
  // mandatory fields for MobileMessageDB
  msg.type = "mms";
  msg.receivers = [phoneNumber];
  msg.deliveryStatusRequested = true;
  msg.sender = "226-934-4596";
  msg.timestamp = timestampForNumber(phoneNumber);

  msg.headers = {};
  // mandatory fields for M-Send.req
  msg.headers["x-mms-message-type"] = MMS.MMS_PDU_TYPE_SEND_REQ;
  msg.headers["x-mms-mms-version"] = MMS.MMS_VERSION_1_3;
  msg.headers["x-mms-transaction-id"] = index.toString();
  msg.headers["from"] = null;
  msg.headers["content-type"] = {};
  msg.headers["content-type"]["media"] = "application/vnd.wap.multipart.related";
  msg.headers["content-type"]["params"] = {};
  msg.headers["content-type"]["params"]["type"] = "application/smil";
  msg.headers["content-type"]["params"]["start"] = "<smil>";

  msg.headers["date"] = new Date(msg.timestamp);
  msg.headers["subject"] = "subject";
  msg.headers["x-mms-expiry"] = 7 * 24 * 60 * 60;
  msg.headers["x-mms-priority"] = 129;
  msg.headers["x-mms-message-class"] = "personal";
  msg.headers["x-mms-read-report"] = true;
  msg.headers["x-mms-delivery-report"] = msg.deliveryStatusRequested;
  msg.headers.to = [];
  msg.headers.to[0] = {};
  msg.headers.to[0]["address"] = "+12269344596";
  msg.headers.to[0]["type"] = "PLMN";

  msg.parts = [];
  let textContent = "sent - " + pickRandomSentence();
  let smilContent = '<smil><body><par><img src="cid:2"/><text src="cid:1"/></par></body></smil>';
  msg.parts[0] = {};
  msg.parts[0]["headers"] = {};
  msg.parts[0]["headers"]["content-id"] = "<smil>";
  msg.parts[0]["headers"]["content-location"] = "smil.xml";
  msg.parts[0]["headers"]["content-length"] = smilContent.length;
  msg.parts[0]["headers"]["content-type"] = {};
  msg.parts[0]["headers"]["content-type"]["media"] = "application/smil";
  msg.parts[0]["headers"]["content-type"]["params"] = {};
  msg.parts[0]["headers"]["content-type"]["params"]["name"] = "smil.xml";
  msg.parts[0]["content"] = smilContent;
  
  msg.parts[1] = {};
  msg.parts[1]["headers"] = {};
  msg.parts[1]["headers"]["content-id"] = "<1>";
  msg.parts[1]["headers"]["content-location"] = "text_0.txt";
  msg.parts[1]["headers"]["content-length"] = textContent.length;
  msg.parts[1]["headers"]["content-type"] = {};
  msg.parts[1]["headers"]["content-type"]["media"] = "text/plain";
  msg.parts[1]["headers"]["content-type"]["params"] = {};
  msg.parts[1]["headers"]["content-type"]["params"]["name"] = "text_0.txt";
  msg.parts[1]["content"] = new Blob([textContent], {type: 'text/plain'});

  msg.parts[2] = {};
  msg.parts[2]["headers"] = {};
  msg.parts[2]["headers"]["content-id"] = "<2>";
  msg.parts[2]["headers"]["content-location"] = "kitten-450.jpg";
  msg.parts[2]["headers"]["content-length"] = testImageBlob.size;
  msg.parts[2]["headers"]["content-type"] = {};
  msg.parts[2]["headers"]["content-type"]["media"] = "image/jpeg";
  msg.parts[2]["headers"]["content-type"]["params"] = {};
  msg.parts[2]["headers"]["content-type"]["params"]["name"] = "kitten-450.jpg";
  msg.parts[2]["content"] = testImageBlob;
  return msg;
};

function initializeNumbers(contactNumbers) {
  SmsNumbers = [];
  for (let i = 0; i < NUMBER_COUNT; i++) {
    let phoneNumber;
    if (contactNumbers.length === 0 || flipACoin(PERCENT_RANDOM_NUMBERS)) {
      let areaCode = (Math.round(Math.random() * 899) + 100).toString();
      let exchange = (Math.round(Math.random() * 899) + 100).toString();
      let number = (Math.round(Math.random() * 8999) + 1000).toString();
      phoneNumber = areaCode + '-' + exchange + '-' + number;
      ok(true, 'random number: ' + phoneNumber);
    } else {
      let index = Math.round(Math.random() * 10000) %% contactNumbers.length;
      phoneNumber = contactNumbers[index];
      ok(true, 'contact number: ' + phoneNumber);
    };
    SmsNumbers.push(phoneNumber);
  };
};

function initializeSentences() {
  SmsSentences = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ',
    'Maecenas pulvinar tempor dolor non lacinia. ',
    'Nunc adipiscing facilisis lectus vel tincidunt. ',
    'Morbi aliquam diam id lectus euismod pellentesque in et turpis. ',
    'Vivamus ac odio nec metus sagittis aliquet in ac enim. ',
    'Sed vel nulla at lectus pharetra luctus. ',
    'Proin eget felis sed libero elementum porttitor. ',
    'Vestibulum non eros eu nisi posuere suscipit. ',
    'Donec eu nisi eu felis porta facilisis sit amet ac orci. ',
    'Nullam eleifend diam luctus quam ornare vel placerat turpis placerat. ',
    'Vivamus semper, augue vel facilisis convallis, dui metus facilisis purus, et hendrerit leo tellus ut tellus. ',
    'Morbi eleifend luctus aliquet. ',
    'Pellentesque at auctor odio. ',
    'Pellentesque velit orci, tristique a consectetur vel, eleifend et urna. ',
    'Fusce at dolor purus, non rutrum sapien. ',
    'Quisque sagittis fringilla scelerisque. ',
    'Nulla lectus velit, vestibulum volutpat consectetur non, sollicitudin in leo. ',
    'In placerat faucibus diam ut pretium. ',
    'Suspendisse vitae lacus vitae tortor cursus porttitor vel a urna. ',
    'In tristique sodales conv allis. '
  ];
};

function pickRandomTestImageBlob() {
  return TestImageBlobs[Math.round(Math.random() * 10000) %% TestImageBlobs.length];
}

function createMessage(smsDBService, index, callback) {
  let msg;
  let phoneNumber = pickRandomPhoneNumber();
  switch (phoneNumber) {
    case BIG_MMS_THREAD_NAME:
      msg = createReceivedMmsMessage(phoneNumber, index, pickRandomTestImageBlob());
      ok(true, "create received MMS mesage " + index);
      break;
    case BIG_SMS_THREAD_NAME:
      msg = createReceivedSmsMessage(phoneNumber);
      ok(true, "create received SMS mesage " + index);
      break;
    default:
      if (flipACoin(0.5)) {
        msg = createReceivedMmsMessage(phoneNumber, index, pickRandomTestImageBlob());
        ok(true, "create received MMS mesage " + index);
      } else {
        msg = createReceivedSmsMessage(phoneNumber);
        ok(true, "create received SMS mesage " + index);
      }
      break;
  }
  smsDBService.saveReceivedMessage(msg, function(result, message) {
    ok(result === Cr.NS_OK,
       "saving received message " + index + ": " + JSON.stringify(message));
    switch (phoneNumber) {
      case BIG_MMS_THREAD_NAME:
        msg = createSentMmsMessage(phoneNumber, index, pickRandomTestImageBlob());
        ok(true, "create sent MMS mesage " + index);
        break;
      case BIG_SMS_THREAD_NAME:
        msg = createSentSmsMessage(phoneNumber);
        ok(true, "create sent SMS mesage " + index);
        break;
      default:
        if (flipACoin(0.5)) {
          msg = createSentMmsMessage(phoneNumber, index, pickRandomTestImageBlob());
          ok(true, "create sent MMS mesage " + index);
        } else {
          msg = createSentSmsMessage(phoneNumber);
          ok(true, "create sent SMS mesage " + index);
        }
        break;
    }
    messageId = smsDBService.saveSendingMessage(msg, function(result, message) {
      ok(result === Cr.NS_OK,
         "saving sent message " + index + ": " + JSON.stringify(message));
      smsDBService.setMessageDelivery(messageId, null, "sent", "success");
      if (index < MESSAGE_COUNT) {
        createMessage(smsDBService, index + 1, callback);
      } else {
        if (callback)
          callback();
      };
    });
  });
};

function loadTestImageBlob(filenames, index, callback) {
  if (index === filenames.length)
    callback();
  else {
    let filename = filenames[index];
    ok(true, 'loadTestImageBlob - ' + index + ' filename: ' + filename);
    let oReq = XMLHttpRequest();
    oReq.open('GET', 'file:///home/jon/b2g-unagi-master/gaia/' + filename, true);
    oReq.responseType = 'blob';
    if (filename.endsWith('png')) {
      oReq.overrideMimeType('image/png');
    } else {
      oReq.overrideMimeType('image/jpeg');
    }
    oReq.onload = function() {
      let blob = oReq.response;
      ok(true, 'loadTestImageBlob - ' + index + ' - got blob of size ' + blob.size);
      TestImageBlobs.push(blob);
      loadTestImageBlob(filenames, index + 1, callback);
    };
    oReq.send();
  }
}

function loadTestImageBlobs(callback) {
  let filenames = ['Camera.png', 'CrashTest.jpg', 'grass.jpg', 'kitten-450.jpg', 'kitten_begging.jpg', 'test-pilot.png'];
  TestImageBlobs = [];
  loadTestImageBlob(filenames, 0, callback);
}

function writeFakeSmsToDatabase(smsDBService, contactNumbers) {
  ok(true, 'writeFakeSmsToDatabase...\n');
  initializeNumbers(contactNumbers);
  initializeSentences();
  let doneCallbacks = false;
  
  loadTestImageBlobs(function() {
    SmsMessageDate = Date.now() - (MESSAGE_COUNT * 2 * 10 * 60 * 1000); // one message every 10 minutes (on average)
    createMessage(smsDBService, 1, function() {
      doneCallbacks = true;
    });
  });

  // Since the call to createMessage returns right away, we need to
  // idle here until the callback happens...
  if (Gaia.engine === "xpcshell") {
    let thread = Cc["@mozilla.org/thread-manager;1"]
                  .getService(Ci.nsIThreadManager)
                  .currentThread;
    while (!doneCallbacks)
      thread.processNextEvent(true);
  };
  ok(true, 'done writeFakeSmsToDatabase...\n\n');
};

function findContactNumbers(contactDB) {
  ok(true, "findContactNumbers\n");
  let doneCallbacks = false;
  let options = {
    sortBy: 'familyName',
    sortOrder: 'ascending'
  };
  let contactNumbers = [];
  contactDB.find(
    function(contacts) {
      for (let i in contacts) {
        let numbers = contacts[i].properties["tel"];
        let number = numbers[0].value;
        contactNumbers.push(number);
      };
      doneCallbacks = true;
    },
    function() {
      ok(true, "error in find\n");
      doneCallbacks = true;
    }, options);

  // Since the call to contactDB.find returns right away, we need to
  // idle here until the callback happens...
  if (Gaia.engine === "xpcshell") {
    let thread = Cc["@mozilla.org/thread-manager;1"]
                  .getService(Ci.nsIThreadManager)
                  .currentThread;

    while (!doneCallbacks || thread.hasPendingEvents())
      thread.processNextEvent(true);
  };
  ok(true, "Done findContactNumbers\n\n");
  return contactNumbers;
};

/***********************************************************/

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/PhoneNumberUtils.jsm");
Cu.import("resource://gre/modules/ContactDB.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

const XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1");

let smsDBService = Cc["@mozilla.org/mobilemessage/rilmobilemessagedatabaseservice;1"]
                                    .getService(Ci.nsIRilMobileMessageDatabaseService);

let TestImageBlobs = [];

let global = this;
let idbManager = Cc["@mozilla.org/dom/indexeddb/manager;1"].getService(Ci.nsIIndexedDatabaseManager);
idbManager.initWindowless(global);
let contactDB = new ContactDB(global);
contactDB.init(global);

let contactNumbers = findContactNumbers(contactDB);
if (contactNumbers.length === MESSAGE_COUNT) {
  writeFakeSmsToDatabase(smsDBService, contactNumbers);
} else {
  ok(true, "ERROR - expected to find " + MESSAGE_COUNT + " contacts, found " + contactNumbers.length);
}
        """ % (message_count, number_count))

    def test_empty_reference_workload(self):
        self.make_reference_workload(0, 0)

    def test_tiny_reference_workload(self):
        self.make_reference_workload(20, 4)

    def test_small_reference_workload(self):
        self.make_reference_workload(200, 40)

    def test_medium_reference_workload(self):
        self.make_reference_workload(500, 100)

    def test_large_reference_workload(self):
        self.make_reference_workload(1000, 200)

    def test_xlarge_reference_workload(self):
        self.make_reference_workload(2000, 1000)
