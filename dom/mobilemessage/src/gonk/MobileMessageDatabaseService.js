/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/MobileMessageDB.jsm");
Cu.import("resource://gre/modules/PhoneNumberUtils.jsm");

const RIL_MOBILEMESSAGEDATABASESERVICE_CONTRACTID =
  "@mozilla.org/mobilemessage/rilmobilemessagedatabaseservice;1";
const RIL_MOBILEMESSAGEDATABASESERVICE_CID =
  Components.ID("{29785f90-6b5b-11e2-9201-3b280170b2ec}");
const RIL_GETMESSAGESCURSOR_CID =
  Components.ID("{484d1ad8-840e-4782-9dc4-9ebc4d914937}");
const RIL_GETTHREADSCURSOR_CID =
  Components.ID("{95ee7c3e-d6f2-4ec4-ade5-0c453c036d35}");

const DEBUG = false;
const DISABLE_MMS_GROUPING_FOR_RECEIVING = true;

const DB_NAME = "sms";

// We can´t create an IDBKeyCursor with a boolean, so we need to use numbers
// instead.
const FILTER_READ_UNREAD = 0;
const FILTER_READ_READ = 1;

const COLLECT_ID_END = 0;
const COLLECT_ID_ERROR = -1;
const COLLECT_TIMESTAMP_UNUSED = 0;

XPCOMUtils.defineLazyServiceGetter(this, "gMobileMessageService",
                                   "@mozilla.org/mobilemessage/mobilemessageservice;1",
                                   "nsIMobileMessageService");

XPCOMUtils.defineLazyServiceGetter(this, "gIDBManager",
                                   "@mozilla.org/dom/indexeddb/manager;1",
                                   "nsIIndexedDatabaseManager");

const GLOBAL_SCOPE = this;

/**
 * MobileMessageDatabaseService
 */
function MobileMessageDatabaseService() {
  // Prime the directory service's cache to ensure that the ProfD entry exists
  // by the time IndexedDB queries for it off the main thread. (See bug 743635.)
  Services.dirsvc.get("ProfD", Ci.nsIFile);

  gIDBManager.initWindowless(GLOBAL_SCOPE);
  this.db = new MobileMessageDB();
  this.db.init(DB_NAME, DB_VERSION, GLOBAL_SCOPE);

  this.updatePendingTransactionToError();
}
MobileMessageDatabaseService.prototype = {

  classID: RIL_MOBILEMESSAGEDATABASESERVICE_CID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIRilMobileMessageDatabaseService,
                                         Ci.nsIMobileMessageDatabaseService,
                                         Ci.nsIObserver]),

  // A MobileMessageDB instance.
  db: null,

  /**
   * nsIObserver
   */
  observe: function observe() {},

  notifyRilCallback: function notifyRilCallback(aCallback, aRv, aMessageRecord) {
    if (!aCallback) {
      return;
    }

    let domMessage;
    if (aRv == Cr.NS_OK) {
      domMessage = this.db.createDomMessageFromRecord(aMessageRecord);
    }
    aCallback.notify(aRv, domMessage);
  },

  /**
   * Sometimes user might reboot or remove battery while sending/receiving
   * message. This is function set the status of message records to error.
   */
  updatePendingTransactionToError: function updatePendingTransactionToError() {
    this.db.newTxn(READ_WRITE, MESSAGE_STORE_NAME,
                   function ontxncallback(aTransaction, aMessageStore) {
      let deliveryIndex = aMessageStore.index("delivery");

      // Set all 'delivery: sending' records to 'delivery: error' and 'deliveryStatus:
      // error'.
      let keyRange = IDBKeyRange.bound([DELIVERY_SENDING, 0], [DELIVERY_SENDING, ""]);
      let cursorRequestSending = deliveryIndex.openCursor(keyRange);
      cursorRequestSending.onsuccess = function(event) {
        let messageCursor = event.target.result;
        if (!messageCursor) {
          return;
        }

        let messageRecord = messageCursor.value;

        // Set delivery to error.
        messageRecord.delivery = DELIVERY_ERROR;
        messageRecord.deliveryIndex = [DELIVERY_ERROR, messageRecord.timestamp];

        if (messageRecord.type == "sms") {
          messageRecord.deliveryStatus = DELIVERY_STATUS_ERROR;
        } else {
          // Set delivery status to error.
          for (let i = 0; i < messageRecord.deliveryStatus.length; i++) {
            messageRecord.deliveryStatus[i] = DELIVERY_STATUS_ERROR;
          }
        }

        messageCursor.update(messageRecord);
        messageCursor.continue();
      };

      // Set all 'delivery: not-downloaded' and 'deliveryStatus: pending'
      // records to 'delivery: not-downloaded' and 'deliveryStatus: error'.
      keyRange = IDBKeyRange.bound([DELIVERY_NOT_DOWNLOADED, 0], [DELIVERY_NOT_DOWNLOADED, ""]);
      let cursorRequestNotDownloaded = deliveryIndex.openCursor(keyRange);
      cursorRequestNotDownloaded.onsuccess = function(event) {
        let messageCursor = event.target.result;
        if (!messageCursor) {
          return;
        }

        let messageRecord = messageCursor.value;

        // We have no "not-downloaded" SMS messages.
        if (messageRecord.type == "sms") {
          messageCursor.continue();
          return;
        }

        // Set delivery status to error.
        if (messageRecord.deliveryStatus.length == 1 &&
            messageRecord.deliveryStatus[0] == DELIVERY_STATUS_PENDING) {
          messageRecord.deliveryStatus = [DELIVERY_STATUS_ERROR];
        }

        messageCursor.update(messageRecord);
        messageCursor.continue();
      };
    }, null, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("updatePendingTransactionToError: transaction aborted - " +
              aErrorName);
      }
    });
  },

  updateMessageDeliveryById: function updateMessageDeliveryById(
      id, type, receiver, delivery, deliveryStatus, envelopeId, callback) {
    if (DEBUG) {
      debug("Setting message's delivery by " + type + " = "+ id
            + " receiver: " + receiver
            + " delivery: " + delivery
            + " deliveryStatus: " + deliveryStatus
            + " envelopeId: " + envelopeId);
    }

    let self = this;
    let messageRecord;
    this.db.newTxn(READ_WRITE, MESSAGE_STORE_NAME,
                   function ontxncallback(aTransaction, aMessageStore) {
      let getRequest;
      if (type === "messageId") {
        getRequest = aMessageStore.get(id);
      } else if (type === "envelopeId") {
        getRequest = aMessageStore.index("envelopeId").get(id);
      }

      getRequest.onsuccess = function onsuccess(event) {
        messageRecord = event.target.result;
        if (!messageRecord) {
          if (DEBUG) debug("type = " + id + " is not found");
          aTransaction.abort();
          return;
        }

        let isRecordUpdated = false;

        // Update |messageRecord.delivery| if needed.
        if (delivery && messageRecord.delivery != delivery) {
          messageRecord.delivery = delivery;
          messageRecord.deliveryIndex = [delivery, messageRecord.timestamp];
          isRecordUpdated = true;
        }

        do {
          // Update |messageRecord.deliveryStatus| if needed.
          if (!deliveryStatus) {
            break;
          }

          // If |messageRecord| is an SMS message:
          if (messageRecord.type == "sms") {
            if (messageRecord.deliveryStatus != deliveryStatus) {
              messageRecord.deliveryStatus = deliveryStatus;
              isRecordUpdated = true;
            }
            break;
          }

          // |messageRecord| is an MMS message:

          // If updating delivery statuses of all receivers:
          if (!receiver) {
            for (let i = 0; i < messageRecord.deliveryStatus.length; i++) {
              if (messageRecord.deliveryStatus[i] != deliveryStatus) {
                messageRecord.deliveryStatus[i] = deliveryStatus;
                isRecordUpdated = true;
              }
            }
            break;
          }

          // Updating delivery status of a specific receiver:
          let normReceiver = PhoneNumberUtils.normalize(receiver, false);
          if (!normReceiver) {
            if (DEBUG) {
              debug("Normalized receiver is not valid. Fail to update.");
            }
            aTransaction.abort();
            return;
          }

          let parsedReveiver = PhoneNumberUtils.parseWithMCC(normReceiver, null);
          let found = false;
          for (let i = 0; i < messageRecord.receivers.length; i++) {
            let storedReceiver = messageRecord.receivers[i];
            let normStoreReceiver =
              PhoneNumberUtils.normalize(storedReceiver, false);
            if (!normStoreReceiver) {
              if (DEBUG) {
                debug("Normalized stored receiver is not valid. Skipping.");
              }
              continue;
            }

            let match = (normReceiver === normStoreReceiver);
            if (!match) {
              if (parsedReveiver) {
                if (normStoreReceiver.endsWith(parsedReveiver.nationalNumber)) {
                  match = true;
                }
              } else {
                let parsedStoreReceiver =
                  PhoneNumberUtils.parseWithMCC(normStoreReceiver, null);
                if (parsedStoreReceiver &&
                    normReceiver.endsWith(parsedStoreReceiver.nationalNumber)) {
                  match = true;
                }
              }
            }
            if (!match) {
              if (DEBUG) debug("Stored receiver is not matched. Skipping.");
              continue;
            }

            found = true;
            if (messageRecord.deliveryStatus[i] != deliveryStatus) {
              messageRecord.deliveryStatus[i] = deliveryStatus;
              isRecordUpdated = true;
            }
          }

          if (!found) {
            if (DEBUG) {
              debug("Cannot find the receiver. Fail to set delivery status.");
            }
            aTransaction.abort();
            return;
          }
        } while(false);

        // Update |messageRecord.envelopeIdIndex| if needed.
        if (envelopeId) {
          if (messageRecord.envelopeIdIndex != envelopeId) {
            messageRecord.envelopeIdIndex = envelopeId;
            isRecordUpdated = true;
          }
        }

        if (!isRecordUpdated) {
          if (DEBUG) {
            debug("The values of delivery, deliveryStatus and envelopeId " +
                  "don't need to be updated.");
          }
          return;
        }

        if (DEBUG) {
          debug("The delivery, deliveryStatus or envelopeId are updated.");
        }
        aMessageStore.put(messageRecord);
      };
    }, function ontxncomplete() {
      self.notifyRilCallback(callback, Cr.NS_OK, messageRecord);
    }, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("updateMessageDeliveryById: transaction aborted - " + aErrorName);
      }
      self.notifyRilCallback(callback, Cr.NS_ERROR_FAILURE, null);
    });
  },

  /**
   * nsIRilMobileMessageDatabaseService API
   */

  saveReceivedMessage: function saveReceivedMessage(aMessage, aCallback) {
    if ((aMessage.type != "sms" && aMessage.type != "mms") ||
        (aMessage.type == "sms" && aMessage.messageClass == undefined) ||
        (aMessage.type == "mms" && (aMessage.delivery == undefined ||
                                    aMessage.transactionId == undefined ||
                                    !Array.isArray(aMessage.deliveryStatus) ||
                                    !Array.isArray(aMessage.receivers))) ||
        aMessage.sender == undefined ||
        aMessage.timestamp == undefined) {
      if (aCallback) {
        aCallback.notify(Cr.NS_ERROR_FAILURE, null);
      }
      return;
    }
    let threadParticipants = [aMessage.sender];
    if (aMessage.type == "mms" && !DISABLE_MMS_GROUPING_FOR_RECEIVING) {
      let receivers = aMessage.receivers;
      // If we don't want to disable the MMS grouping for receiving, we need to
      // add the receivers (excluding the user's own number) to the participants
      // for creating the thread. Some cases might be investigated as below:
      //
      // 1. receivers.length == 0
      //    This usually happens when receiving an MMS notification indication
      //    which doesn't carry any receivers.
      // 2. receivers.length == 1
      //    If the receivers contain single phone number, we don't need to
      //    add it into participants because we know that number is our own.
      // 3. receivers.length >= 2
      //    If the receivers contain multiple phone numbers, we need to add all
      //    of them but not the user's own number into participants.
      if (receivers.length >= 2) {
        let isSuccess = false;
        let slicedReceivers = receivers.slice();
        if (aMessage.msisdn) {
          let found = slicedReceivers.indexOf(aMessage.msisdn);
          if (found !== -1) {
            isSuccess = true;
            slicedReceivers.splice(found, 1);
          }
        }

        if (!isSuccess) {
          // For some SIMs we cannot retrieve the vaild MSISDN (i.e. the user's
          // own phone number), so we cannot correcly exclude the user's own
          // number from the receivers, thus wrongly building the thread index.
          if (DEBUG) debug("Error! Cannot strip out user's own phone number!");
        }

        threadParticipants = threadParticipants.concat(slicedReceivers);
      }
    }

    let timestamp = aMessage.timestamp;

    // Adding needed indexes and extra attributes for internal use.
    // threadIdIndex & participantIdsIndex are filled in saveMessageRecord().
    aMessage.readIndex = [FILTER_READ_UNREAD, timestamp];
    aMessage.read = FILTER_READ_UNREAD;

    if (aMessage.type == "mms") {
      aMessage.transactionIdIndex = aMessage.transactionId;
    }

    if (aMessage.type == "sms") {
      aMessage.delivery = DELIVERY_RECEIVED;
      aMessage.deliveryStatus = DELIVERY_STATUS_SUCCESS;
    }
    aMessage.deliveryIndex = [aMessage.delivery, timestamp];

    return this.db.saveMessageRecord(aMessage, threadParticipants,
                                     this.notifyRilCallback
                                         .bind(this, aCallback));
  },

  saveSendingMessage: function saveSendingMessage(aMessage, aCallback) {
    if ((aMessage.type != "sms" && aMessage.type != "mms") ||
        (aMessage.type == "sms" && aMessage.receiver == undefined) ||
        (aMessage.type == "mms" && !Array.isArray(aMessage.receivers)) ||
        aMessage.deliveryStatusRequested == undefined ||
        aMessage.timestamp == undefined) {
      if (aCallback) {
        aCallback.notify(Cr.NS_ERROR_FAILURE, null);
      }
      return;
    }

    // Set |aMessage.deliveryStatus|. Note that for MMS record
    // it must be an array of strings; For SMS, it's a string.
    let deliveryStatus = aMessage.deliveryStatusRequested
                       ? DELIVERY_STATUS_PENDING
                       : DELIVERY_STATUS_NOT_APPLICABLE;
    if (aMessage.type == "sms") {
      aMessage.deliveryStatus = deliveryStatus;
    } else if (aMessage.type == "mms") {
      let receivers = aMessage.receivers
      if (!Array.isArray(receivers)) {
        if (DEBUG) {
          debug("Need receivers for MMS. Fail to save the sending message.");
        }
        if (aCallback) {
          aCallback.notify(Cr.NS_ERROR_FAILURE, null);
        }
        return;
      }
      aMessage.deliveryStatus = [];
      for (let i = 0; i < receivers.length; i++) {
        aMessage.deliveryStatus.push(deliveryStatus);
      }
    }

    let timestamp = aMessage.timestamp;

    // Adding needed indexes and extra attributes for internal use.
    // threadIdIndex & participantIdsIndex are filled in saveMessageRecord().
    aMessage.deliveryIndex = [DELIVERY_SENDING, timestamp];
    aMessage.readIndex = [FILTER_READ_READ, timestamp];
    aMessage.delivery = DELIVERY_SENDING;
    aMessage.messageClass = MESSAGE_CLASS_NORMAL;
    aMessage.read = FILTER_READ_READ;

    let addresses;
    if (aMessage.type == "sms") {
      addresses = [aMessage.receiver];
    } else if (aMessage.type == "mms") {
      addresses = aMessage.receivers;
    }

    return this.db.saveMessageRecord(aMessage, addresses,
                                     this.notifyRilCallback
                                         .bind(this, aCallback));
  },

  setMessageDeliveryByMessageId: function setMessageDeliveryByMessageId(
      messageId, receiver, delivery, deliveryStatus, envelopeId, callback) {
    this.updateMessageDeliveryById(messageId, "messageId",
                                   receiver, delivery, deliveryStatus,
                                   envelopeId, callback);

  },

  setMessageDeliveryByEnvelopeId: function setMessageDeliveryByEnvelopeId(
      envelopeId, receiver, delivery, deliveryStatus, callback) {
    this.updateMessageDeliveryById(envelopeId, "envelopeId",
                                   receiver, delivery, deliveryStatus,
                                   null, callback);

  },

  getMessageRecordByTransactionId: function getMessageRecordByTransactionId(aTransactionId, aCallback) {
    if (DEBUG) debug("Retrieving message with transaction ID " + aTransactionId);
    let self = this;
    let errorCode;
    let messageRecord;
    this.db.newTxn(READ_ONLY, MESSAGE_STORE_NAME,
                   function ontxncallback(aTransaction, aMessageStore) {
      let request = aMessageStore.index("transactionId").get(aTransactionId);
      request.onsuccess = function onsuccess(event) {
        messageRecord = event.target.result;
        if (messageRecord) {
          return;
        }
        if (DEBUG) debug("Transaction ID " + aTransactionId + " not found");
        errorCode = Ci.nsIMobileMessageCallback.NOT_FOUND_ERROR;
        aTransaction.abort();
      };
    }, function ontxncomplete() {
      if (DEBUG) debug("Transaction completed.");
      // In this case, we don't need a dom message. Just pass null to the
      // third argument.
      aCallback.notify(Ci.nsIMobileMessageCallback.SUCCESS_NO_ERROR,
                       messageRecord, null);
    }, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("getMessageRecordByTransactionId: transaction aborted - " +
              aErrorName);
      }
      aCallback.notify(errorCode || Ci.nsIMobileMessageCallback.INTERNAL_ERROR,
                       null, null);
    });
  },

  getMessageRecordById: function getMessageRecordById(aMessageId, aCallback) {
    if (DEBUG) debug("Retrieving message with ID " + aMessageId);
    let self = this;
    let errorCode;
    let messageRecord;
    this.db.newTxn(READ_ONLY, MESSAGE_STORE_NAME,
                   function ontxncallback(aTransaction, aMessageStore) {
      let request = aMessageStore.mozGetAll(aMessageId);
      request.onsuccess = function onsuccess(event) {
        messageRecord = request.result[0];
        if (!messageRecord) {
          if (DEBUG) debug("Message ID " + aMessageId + " not found");
          errorCode = Ci.nsIMobileMessageCallback.NOT_FOUND_ERROR;
          aTransaction.abort();
          return;
        }
      };
    }, function ontxncomplete() {
      if (DEBUG) debug("Transaction completed.");
      let domMessage = self.db.createDomMessageFromRecord(messageRecord);
      aCallback.notify(Ci.nsIMobileMessageCallback.SUCCESS_NO_ERROR,
                       messageRecord, domMessage);
    }, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("getMessageRecordById: transaction aborted - " + aErrorName);
      }
      aCallback.notify(errorCode || Ci.nsIMobileMessageCallback.INTERNAL_ERROR,
                       null, null);
    });
  },

  /**
   * nsIMobileMessageDatabaseService API
   */

  getMessage: function getMessage(aMessageId, aRequest) {
    if (DEBUG) debug("Retrieving message with ID " + aMessageId);
    let notifyCallback = {
      notify: function notify(aRv, aMessageRecord, aDomMessage) {
        if (Ci.nsIMobileMessageCallback.SUCCESS_NO_ERROR == aRv) {
          aRequest.notifyMessageGot(aDomMessage);
          return;
        }
        aRequest.notifyGetMessageFailed(aRv, null);
      }
    };
    this.getMessageRecordById(aMessageId, notifyCallback);
  },

  deleteMessage: function deleteMessage(messageIds, length, aRequest) {
    if (DEBUG) debug("deleteMessage: message ids " + JSON.stringify(messageIds));
    let deleted = [];
    let self = this;
    this.db.newTxn(READ_WRITE, [MESSAGE_STORE_NAME, THREAD_STORE_NAME],
                   function ontxncallback(aTransaction, aMessageStore,
                                          aThreadStore) {
      for (let i = 0; i < length; i++) {
        let messageId = messageIds[i];
        deleted[i] = false;
        aMessageStore.get(messageId).onsuccess = function(messageIndex, event) {
          let messageRecord = event.target.result;
          let messageId = messageIds[messageIndex];
          if (messageRecord) {
            if (DEBUG) debug("Deleting message id " + messageId);

            // First actually delete the message.
            aMessageStore.delete(messageId).onsuccess = function(event) {
              if (DEBUG) debug("Message id " + messageId + " deleted");
              deleted[messageIndex] = true;

              // Then update unread count and most recent message.
              self.db.updateThreadByMessageChange(aMessageStore,
                                                  aThreadStore,
                                                  messageRecord.threadId,
                                                  messageId,
                                                  messageRecord.read);

              Services.obs.notifyObservers(null,
                                           "mobile-message-deleted",
                                           JSON.stringify({ id: messageId }));
            };
          } else if (DEBUG) {
            debug("Message id " + messageId + " does not exist");
          }
        }.bind(null, i);
      }
    }, function ontxncomplete() {
      if (DEBUG) debug("Transaction completed.");
      aRequest.notifyMessageDeleted(deleted, length);
    }, function ontxnabort(aErrorName) {
      if (DEBUG) debug("deleteMessage: transaction aborted - " + aErrorName);
      aRequest.notifyDeleteMessageFailed(Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
    });
  },

  createMessageCursor: function createMessageCursor(filter, reverse, callback) {
    if (DEBUG) {
      debug("Creating a message cursor. Filters:" +
            " startDate: " + filter.startDate +
            " endDate: " + filter.endDate +
            " delivery: " + filter.delivery +
            " numbers: " + filter.numbers +
            " read: " + filter.read +
            " threadId: " + filter.threadId +
            " reverse: " + reverse);
    }

    let cursor = new GetMessagesCursor(this, callback);
    let collector = cursor.collector;
    let collect = collector.collect.bind(collector);

    let self = this;
    self.db.newTxn(READ_ONLY, [MESSAGE_STORE_NAME, PARTICIPANT_STORE_NAME],
                   function ontxncallback(aTransaction, aMessageStore,
                                          aParticipantStore) {
      let direction = reverse ? PREV : NEXT;

      // We support filtering by date range only (see `else` block below) or by
      // number/delivery status/read status with an optional date range.
      if (filter.delivery == null &&
          filter.numbers == null &&
          filter.read == null &&
          filter.threadId == null) {
        // Filtering by date range only.
        if (DEBUG) {
          debug("filter.timestamp " + filter.startDate + ", " + filter.endDate);
        }

        FilterSearcherHelper.filterTimestamp(filter.startDate, filter.endDate,
                                             direction, aTransaction, collect);
        return;
      }

      // Numeric 0 is smaller than any time stamp, and empty string is larger
      // than all numeric values.
      let startDate = 0, endDate = "";
      if (filter.startDate != null) {
        startDate = filter.startDate.getTime();
      }
      if (filter.endDate != null) {
        endDate = filter.endDate.getTime();
      }

      let single, intersectionCollector;
      {
        let num = 0;
        if (filter.delivery) num++;
        if (filter.numbers) num++;
        if (filter.read != undefined) num++;
        if (filter.threadId != undefined) num++;
        single = (num == 1);
      }

      if (!single) {
        intersectionCollector =
          new IntersectionResultsCollector(collect, reverse);
      }

      // Retrieve the keys from the 'delivery' index that matches the value of
      // filter.delivery.
      if (filter.delivery) {
        if (DEBUG) debug("filter.delivery " + filter.delivery);
        let delivery = filter.delivery;
        let range = IDBKeyRange.bound([delivery, startDate], [delivery, endDate]);
        let deliveryCollect =
          single ? collect : intersectionCollector.newContext();
        FilterSearcherHelper.filterIndex("delivery", range, direction,
                                         aTransaction, deliveryCollect);
      }

      // Retrieve the keys from the 'read' index that matches the value of
      // filter.read.
      if (filter.read != undefined) {
        if (DEBUG) debug("filter.read " + filter.read);
        let read = filter.read ? FILTER_READ_READ : FILTER_READ_UNREAD;
        let range = IDBKeyRange.bound([read, startDate], [read, endDate]);
        let readCollect =
          single ? collect : intersectionCollector.newContext();
        FilterSearcherHelper.filterIndex("read", range, direction, aTransaction,
                                         readCollect);
      }

      // Retrieve the keys from the 'threadId' index that matches the value of
      // filter.threadId.
      if (filter.threadId != undefined) {
        if (DEBUG) debug("filter.threadId " + filter.threadId);
        let threadId = filter.threadId;
        let range = IDBKeyRange.bound([threadId, startDate], [threadId, endDate]);
        let threadIdCollect =
          single ? collect : intersectionCollector.newContext();
        FilterSearcherHelper.filterIndex("threadId", range, direction,
                                         aTransaction, threadIdCollect);
      }

      // Retrieve the keys from the 'sender' and 'receiver' indexes that
      // match the values of filter.numbers
      if (filter.numbers) {
        if (DEBUG) debug("filter.numbers " + filter.numbers.join(", "));

        let numbersCollect =
          single ? collect : intersectionCollector.newContext();

        self.db.findParticipantIdsByAddresses(aParticipantStore,
                                              filter.numbers,
                                              false, true,
                                              (function (participantIds) {
          if (!participantIds || !participantIds.length) {
            // Oops! No such participant at all.
            numbersCollect(aTransaction, COLLECT_ID_END, COLLECT_TIMESTAMP_UNUSED);
            return;
          }

          if (participantIds.length == 1) {
            let id = participantIds[0];
            let range = IDBKeyRange.bound([id, startDate], [id, endDate]);
            FilterSearcherHelper.filterIndex("participantIds", range, direction,
                                             aTransaction, numbersCollect);
            return;
          }

          let unionCollector = new UnionResultsCollector(numbersCollect);

          FilterSearcherHelper.filterTimestamp(filter.startDate, filter.endDate,
                                               direction, aTransaction,
                                               unionCollector.newTimestampContext());

          for (let i = 0; i < participantIds.length; i++) {
            let id = participantIds[i];
            let range = IDBKeyRange.bound([id, startDate], [id, endDate]);
            FilterSearcherHelper.filterIndex("participantIds", range, direction,
                                             aTransaction,
                                             unionCollector.newContext());
          }
        }).bind(this));
      }
    }, null, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("createMessageCursor: transaction aborted - " + aErrorName);
      }
      collect(null, COLLECT_ID_ERROR, COLLECT_TIMESTAMP_UNUSED);
    });

    return cursor;
  },

  markMessageRead: function markMessageRead(messageId, value, aRequest) {
    if (DEBUG) debug("Setting message " + messageId + " read to " + value);
    let messageRecord;
    let errorCode;
    this.db.newTxn(READ_WRITE, [MESSAGE_STORE_NAME, THREAD_STORE_NAME],
                   function ontxncallback(aTransaction, aMessageStore,
                                          aThreadStore) {
      aMessageStore.get(messageId).onsuccess = function onsuccess(event) {
        messageRecord = event.target.result;
        if (!messageRecord) {
          if (DEBUG) debug("Message ID " + messageId + " not found");
          errorCode = Ci.nsIMobileMessageCallback.NOT_FOUND_ERROR;
          aTransaction.abort();
          return;
        }
        // If the value to be set is the same as the current message `read`
        // value, we just notify successfully.
        if (messageRecord.read == value) {
          if (DEBUG) debug("The value of messageRecord.read is already " + value);
          return;
        }
        messageRecord.read = value ? FILTER_READ_READ : FILTER_READ_UNREAD;
        messageRecord.readIndex = [messageRecord.read, messageRecord.timestamp];
        if (DEBUG) debug("Message.read set to: " + value);
        aMessageStore.put(messageRecord).onsuccess = function onsuccess(event) {
          if (DEBUG) {
            debug("Update successfully completed. Message: " +
                  JSON.stringify(event.target.result));
          }

          // Now update the unread count.
          let threadId = messageRecord.threadId;

          aThreadStore.get(threadId).onsuccess = function(event) {
            let threadRecord = event.target.result;
            threadRecord.unreadCount += value ? -1 : 1;
            if (DEBUG) {
              debug("Updating unreadCount for thread id " + threadId + ": " +
                    (value ?
                     threadRecord.unreadCount + 1 :
                     threadRecord.unreadCount - 1) +
                     " -> " + threadRecord.unreadCount);
            }
            aThreadStore.put(threadRecord);
          };
        };
      };
    }, function ontxncomplete() {
      aRequest.notifyMessageMarkedRead(messageRecord.read);
    }, function ontxnabort(aErrorName) {
      if (DEBUG) debug("markMessageRead: transaction aborted - " + aErrorName);
      aRequest.notifyMarkMessageReadFailed(
        errorCode || Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
    });
  },

  createThreadCursor: function createThreadCursor(callback) {
    if (DEBUG) debug("Getting thread list");

    let cursor = new GetThreadsCursor(this, callback);
    let collector = cursor.collector;
    let collect = collector.collect.bind(collector);
    this.db.newTxn(READ_ONLY, THREAD_STORE_NAME,
                   function ontxncallback(aTransaction, aThreadStore) {
      let request = aThreadStore.index("lastTimestamp").openKeyCursor();
      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor) {
          if (collect(aTransaction, cursor.primaryKey, cursor.key)) {
            cursor.continue();
          }
        } else {
          collect(aTransaction, COLLECT_ID_END, COLLECT_TIMESTAMP_UNUSED);
        }
      };
    }, null, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("createThreadCursor: transaction aborted - " + aErrorName);
      }
      collect(null, COLLECT_ID_ERROR, COLLECT_TIMESTAMP_UNUSED);
    });

    return cursor;
  }
};

let FilterSearcherHelper = {

  /**
   * @param index
   *        The name of a message store index to filter on.
   * @param range
   *        A IDBKeyRange.
   * @param direction
   *        NEXT or PREV.
   * @param txn
   *        Ongoing IDBTransaction context object.
   * @param collect
   *        Result colletor function. It takes three parameters -- txn, message
   *        id, and message timestamp.
   */
  filterIndex: function filterIndex(index, range, direction, txn, collect) {
    let messageStore = txn.objectStore(MESSAGE_STORE_NAME);
    let request = messageStore.index(index).openKeyCursor(range, direction);
    request.onsuccess = function onsuccess(event) {
      let cursor = event.target.result;
      // Once the cursor has retrieved all keys that matches its key range,
      // the filter search is done.
      if (cursor) {
        let timestamp = Array.isArray(cursor.key) ? cursor.key[1] : cursor.key;
        if (collect(txn, cursor.primaryKey, timestamp)) {
          cursor.continue();
        }
      } else {
        collect(txn, COLLECT_ID_END, COLLECT_TIMESTAMP_UNUSED);
      }
    };
  },

  /**
   * Explicitly fiter message on the timestamp index.
   *
   * @param startDate
   *        Timestamp of the starting date.
   * @param endDate
   *        Timestamp of the ending date.
   * @param direction
   *        NEXT or PREV.
   * @param txn
   *        Ongoing IDBTransaction context object.
   * @param collect
   *        Result colletor function. It takes three parameters -- txn, message
   *        id, and message timestamp.
   */
  filterTimestamp: function filterTimestamp(startDate, endDate, direction, txn,
                                            collect) {
    let range = null;
    if (startDate != null && endDate != null) {
      range = IDBKeyRange.bound(startDate.getTime(), endDate.getTime());
    } else if (startDate != null) {
      range = IDBKeyRange.lowerBound(startDate.getTime());
    } else if (endDate != null) {
      range = IDBKeyRange.upperBound(endDate.getTime());
    }
    this.filterIndex("timestamp", range, direction, txn, collect);
  }
};

function ResultsCollector() {
  this.results = [];
  this.done = false;
}
ResultsCollector.prototype = {
  results: null,
  requestWaiting: null,
  done: null,

  /**
   * Queue up passed id, reply if necessary.
   *
   * @param txn
   *        Ongoing IDBTransaction context object.
   * @param id
   *        COLLECT_ID_END(0) for no more results, COLLECT_ID_ERROR(-1) for
   *        errors and valid otherwise.
   * @param timestamp
   *        We assume this function is always called in timestamp order. So
   *        this parameter is actually unused.
   *
   * @return true if expects more. false otherwise.
   */
  collect: function collect(txn, id, timestamp) {
    if (this.done) {
      return false;
    }

    if (DEBUG) {
      debug("collect: message ID = " + id);
    }
    if (id) {
      // Queue up any id but '0' and replies later accordingly.
      this.results.push(id);
    }
    if (id <= 0) {
      // No more processing on '0' or negative values passed.
      this.done = true;
    }

    if (!this.requestWaiting) {
      if (DEBUG) debug("Cursor.continue() not called yet");
      return !this.done;
    }

    // We assume there is only one request waiting throughout the message list
    // retrieving process. So we don't bother continuing to process further
    // waiting requests here. This assumption comes from DOMCursor::Continue()
    // implementation.
    let callback = this.requestWaiting;
    this.requestWaiting = null;

    this.drip(txn, callback);

    return !this.done;
  },

  /**
   * Callback right away with the first queued result entry if the filtering is
   * done. Or queue up the request and callback when a new entry is available.
   *
   * @param callback
   *        A callback function that accepts a numeric id.
   */
  squeeze: function squeeze(callback) {
    if (this.requestWaiting) {
      throw new Error("Already waiting for another request!");
    }

    if (!this.done) {
      // Database transaction ongoing, let it reply for us so that we won't get
      // blocked by the existing transaction.
      this.requestWaiting = callback;
      return;
    }

    this.drip(null, callback);
  },

  /**
   * @param txn
   *        Ongoing IDBTransaction context object or null.
   * @param callback
   *        A callback function that accepts a numeric id.
   */
  drip: function drip(txn, callback) {
    if (!this.results.length) {
      if (DEBUG) debug("No messages matching the filter criteria");
      callback(txn, COLLECT_ID_END);
      return;
    }

    if (this.results[0] < 0) {
      // An previous error found. Keep the answer in results so that we can
      // reply INTERNAL_ERROR for further requests.
      if (DEBUG) debug("An previous error found");
      callback(txn, COLLECT_ID_ERROR);
      return;
    }

    let firstMessageId = this.results.shift();
    callback(txn, firstMessageId);
  }
};

function IntersectionResultsCollector(collect, reverse) {
  this.cascadedCollect = collect;
  this.reverse = reverse;
  this.contexts = [];
}
IntersectionResultsCollector.prototype = {
  cascadedCollect: null,
  reverse: false,
  contexts: null,

  /**
   * Queue up {id, timestamp} pairs, find out intersections and report to
   * |cascadedCollect|. Return true if it is still possible to have another match.
   */
  collect: function collect(contextIndex, txn, id, timestamp) {
    if (DEBUG) {
      debug("IntersectionResultsCollector: "
            + contextIndex + ", " + id + ", " + timestamp);
    }

    let contexts = this.contexts;
    let context = contexts[contextIndex];

    if (id < 0) {
      // Act as no more matched records.
      id = 0;
    }
    if (!id) {
      context.done = true;

      if (!context.results.length) {
        // Already empty, can't have further intersection results.
        return this.cascadedCollect(txn, COLLECT_ID_END, COLLECT_TIMESTAMP_UNUSED);
      }

      for (let i = 0; i < contexts.length; i++) {
        if (!contexts[i].done) {
          // Don't call |this.cascadedCollect| because |context.results| might not
          // be empty, so other contexts might still have a chance here.
          return false;
        }
      }

      // It was the last processing context and is no more processing.
      return this.cascadedCollect(txn, COLLECT_ID_END, COLLECT_TIMESTAMP_UNUSED);
    }

    // Search id in other existing results. If no other results has it,
    // and A) the last timestamp is smaller-equal to current timestamp,
    // we wait for further results; either B) record timestamp is larger
    // then current timestamp or C) no more processing for a filter, then we
    // drop this id because there can't be a match anymore.
    for (let i = 0; i < contexts.length; i++) {
      if (i == contextIndex) {
        continue;
      }

      let ctx = contexts[i];
      let results = ctx.results;
      let found = false;
      for (let j = 0; j < results.length; j++) {
        let result = results[j];
        if (result.id == id) {
          found = true;
          break;
        }
        if ((!this.reverse && (result.timestamp > timestamp)) ||
            (this.reverse && (result.timestamp < timestamp))) {
          // B) Cannot find a match anymore. Drop.
          return true;
        }
      }

      if (!found) {
        if (ctx.done) {
          // C) Cannot find a match anymore. Drop.
          if (results.length) {
            let lastResult = results[results.length - 1];
            if ((!this.reverse && (lastResult.timestamp >= timestamp)) ||
                (this.reverse && (lastResult.timestamp <= timestamp))) {
              // Still have a chance to get another match. Return true.
              return true;
            }
          }

          // Impossible to find another match because all results in ctx have
          // timestamps smaller than timestamp.
          context.done = true;
          return this.cascadedCollect(txn, COLLECT_ID_END, COLLECT_TIMESTAMP_UNUSED);
        }

        // A) Pending.
        context.results.push({
          id: id,
          timestamp: timestamp
        });
        return true;
      }
    }

    // Now id is found in all other results. Report it.
    return this.cascadedCollect(txn, id, timestamp);
  },

  newContext: function newContext() {
    let contextIndex = this.contexts.length;
    this.contexts.push({
      results: [],
      done: false
    });
    return this.collect.bind(this, contextIndex);
  }
};

function UnionResultsCollector(collect) {
  this.cascadedCollect = collect;
  this.contexts = [{
    // Timestamp.
    processing: 1,
    results: []
  }, {
    processing: 0,
    results: []
  }];
}
UnionResultsCollector.prototype = {
  cascadedCollect: null,
  contexts: null,

  collect: function collect(contextIndex, txn, id, timestamp) {
    if (DEBUG) {
      debug("UnionResultsCollector: "
            + contextIndex + ", " + id + ", " + timestamp);
    }

    let contexts = this.contexts;
    let context = contexts[contextIndex];

    if (id < 0) {
      // Act as no more matched records.
      id = 0;
    }
    if (id) {
      if (!contextIndex) {
        // Timestamp.
        context.results.push({
          id: id,
          timestamp: timestamp
        });
      } else {
        context.results.push(id);
      }
      return true;
    }

    context.processing -= 1;
    if (contexts[0].processing || contexts[1].processing) {
      // At least one queue is still processing, but we got here because
      // current cursor gives 0 as id meaning no more messages are
      // available. Return false here to stop further cursor.continue() calls.
      return false;
    }

    let tres = contexts[0].results;
    let qres = contexts[1].results;
    tres = tres.filter(function (element) {
      return qres.indexOf(element.id) != -1;
    });

    for (let i = 0; i < tres.length; i++) {
      this.cascadedCollect(txn, tres[i].id, tres[i].timestamp);
    }
    this.cascadedCollect(txn, COLLECT_ID_END, COLLECT_TIMESTAMP_UNUSED);

    return false;
  },

  newTimestampContext: function newTimestampContext() {
    return this.collect.bind(this, 0);
  },

  newContext: function newContext() {
    this.contexts[1].processing++;
    return this.collect.bind(this, 1);
  }
};

function GetMessagesCursor(service, callback) {
  this.service = service;
  this.callback = callback;
  this.collector = new ResultsCollector();

  this.handleContinue(); // Trigger first run.
}
GetMessagesCursor.prototype = {
  classID: RIL_GETMESSAGESCURSOR_CID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsICursorContinueCallback]),

  service: null,
  callback: null,
  collector: null,

  getMessageTxn: function getMessageTxn(messageStore, messageId) {
    if (DEBUG) debug ("Fetching message " + messageId);

    let getRequest = messageStore.get(messageId);
    let self = this;
    getRequest.onsuccess = function onsuccess(event) {
      let messageRecord = event.target.result;
      if (!messageRecord) {
        if (DEBUG) debug("notifyCursorError - messageId: " + messageId);
        self.callback.notifyCursorError(Ci.nsIMobileMessageCallback.NOT_FOUND_ERROR);
        return;
      }

      if (DEBUG) debug("notifyCursorResult: " + JSON.stringify(messageRecord));
      let domMessage =
        self.service.db.createDomMessageFromRecord(messageRecord);
      self.callback.notifyCursorResult(domMessage);
    };
    getRequest.onerror = function onerror(event) {
      if (DEBUG) debug("notifyCursorError - messageId: " + messageId);
      self.callback.notifyCursorError(Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
    };
  },

  notify: function notify(txn, messageId) {
    if (!messageId) {
      this.callback.notifyCursorDone();
      return;
    }

    if (messageId < 0) {
      this.callback.notifyCursorError(Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
      return;
    }

    // When filter transaction is not yet completed, we're called with current
    // ongoing transaction object.
    if (txn) {
      let messageStore = txn.objectStore(MESSAGE_STORE_NAME);
      this.getMessageTxn(messageStore, messageId);
      return;
    }

    // Or, we have to open another transaction ourselves.
    let self = this;
    this.service.db.newTxn(READ_ONLY, MESSAGE_STORE_NAME,
                           function ontxncallback(aTransaction, aMessageStore) {
      self.getMessageTxn(aMessageStore, messageId);
    }, null, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("GetMessagesCursor.notify: transaction aborted - " + aErrorName);
      }
      self.callback.notifyCursorError(Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
    });
  },

  // nsICursorContinueCallback

  handleContinue: function handleContinue() {
    if (DEBUG) debug("Getting next message in list");
    this.collector.squeeze(this.notify.bind(this));
  }
};

function GetThreadsCursor(service, callback) {
  this.service = service;
  this.callback = callback;
  this.collector = new ResultsCollector();

  this.handleContinue(); // Trigger first run.
}
GetThreadsCursor.prototype = {
  classID: RIL_GETTHREADSCURSOR_CID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsICursorContinueCallback]),

  service: null,
  callback: null,
  collector: null,

  getThreadTxn: function getThreadTxn(threadStore, threadId) {
    if (DEBUG) debug ("Fetching thread " + threadId);

    let getRequest = threadStore.get(threadId);
    let self = this;
    getRequest.onsuccess = function onsuccess(event) {
      let threadRecord = event.target.result;
      if (!threadRecord) {
        if (DEBUG) debug("notifyCursorError - threadId: " + threadId);
        self.callback.notifyCursorError(Ci.nsIMobileMessageCallback.NOT_FOUND_ERROR);
        return;
      }

      if (DEBUG) debug("notifyCursorResult: " + JSON.stringify(threadRecord));
      let thread = self.service.db.createDomThreadFromRecord(threadRecord);
      self.callback.notifyCursorResult(thread);
    };
    getRequest.onerror = function onerror(event) {
      if (DEBUG) debug("notifyCursorError - threadId: " + threadId);
      self.callback.notifyCursorError(Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
    };
  },

  notify: function notify(txn, threadId) {
    if (!threadId) {
      this.callback.notifyCursorDone();
      return;
    }

    if (threadId < 0) {
      this.callback.notifyCursorError(Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
      return;
    }

    // When filter transaction is not yet completed, we're called with current
    // ongoing transaction object.
    if (txn) {
      let threadStore = txn.objectStore(THREAD_STORE_NAME);
      this.getThreadTxn(threadStore, threadId);
      return;
    }

    // Or, we have to open another transaction ourselves.
    let self = this;
    this.service.db.newTxn(READ_ONLY, THREAD_STORE_NAME,
                           function ontxncallback(aTransaction, aThreadStore) {
      self.getThreadTxn(aThreadStore, threadId);
    }, null, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("GetThreadsCursor.notify: transaction aborted - " + aErrorName);
      }
      self.callback.notifyCursorError(Ci.nsIMobileMessageCallback.INTERNAL_ERROR);
    });
  },

  // nsICursorContinueCallback

  handleContinue: function handleContinue() {
    if (DEBUG) debug("Getting next thread in list");
    this.collector.squeeze(this.notify.bind(this));
  }
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([MobileMessageDatabaseService]);

function debug() {
  dump("MobileMessageDatabaseService: " + Array.slice(arguments).join(" ") + "\n");
}
