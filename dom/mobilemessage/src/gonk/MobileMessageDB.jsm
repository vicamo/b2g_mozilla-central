/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/IndexedDBHelper.jsm");
Cu.import("resource://gre/modules/PhoneNumberUtils.jsm");

this.DB_VERSION = 12;

// Valid since DB_VERSION 1.
this.MESSAGE_STORE_NAME = "sms";
// Valid since DB_VERSION 8.
this.THREAD_STORE_NAME = "thread";
// Valid since DB_VERSION 8.
this.PARTICIPANT_STORE_NAME = "participant";
// Deprecated since DB_VERSION 8.
this.MOST_RECENT_STORE_NAME = "most-recent";

this.DELIVERY_SENDING = "sending";
this.DELIVERY_SENT = "sent";
this.DELIVERY_RECEIVED = "received";
this.DELIVERY_NOT_DOWNLOADED = "not-downloaded";
this.DELIVERY_ERROR = "error";

this.DELIVERY_STATUS_NOT_APPLICABLE = "not-applicable";
this.DELIVERY_STATUS_SUCCESS = "success";
this.DELIVERY_STATUS_PENDING = "pending";
this.DELIVERY_STATUS_ERROR = "error";

this.MESSAGE_CLASS_NORMAL = "normal";

this.READ_ONLY = "readonly";
this.READ_WRITE = "readwrite";

this.PREV = "prev";
this.NEXT = "next";

const DEBUG = false;
function debug() {
  dump("MobileMessageDB: " + Array.slice(arguments).join(" ") + "\n");
}

XPCOMUtils.defineLazyServiceGetter(this, "gMobileMessageService",
                                   "@mozilla.org/mobilemessage/mobilemessageservice;1",
                                   "nsIMobileMessageService");

let IDB_GLOBAL;

this.MobileMessageDB = function MobileMessageDB() {
  if (DEBUG) debug("Constructor");
};

MobileMessageDB.prototype = {
  __proto__: IndexedDBHelper.prototype,

  /**
   * Last sms/mms object store key value in the database.
   */
  lastMessageId: 0,

  init: function init(aDbName, aDbVersion, aGlobal) {
    if (DEBUG) debug("init: '" + aDbName + "', " + aDbVersion);
    IDB_GLOBAL = aGlobal;
    this.initDBHelper(aDbName, aDbVersion, aGlobal);

    let that = this;
    this.newTxn(READ_ONLY, MESSAGE_STORE_NAME,
                function ontxncallback(aTransaction, aMessageStore) {
      // In order to get the highest key value, we open a key cursor in reverse
      // order and get only the first pointed value.
      let request = aMessageStore.openCursor(null, PREV);
      request.onsuccess = function onsuccess(event) {
        let cursor = event.target.result;
        if (!cursor) {
          if (DEBUG) {
            debug("Could not get the last key from mobile message database. " +
                  "Probably empty database");
          }
          return;
        }
        that.lastMessageId = cursor.key || 0;
        if (DEBUG) debug("Last assigned message ID was " + that.lastMessageId);
      };
    }, null, function ontxnabort(aErrorName) {
      if (DEBUG) {
        debug("Could not get the last key from mobile message database: " +
              aErrorName);
      }
    });
  },

  upgradeSchema: function upgradeSchema(aTransaction, aDb,
                                        aOldVersion, aNewVersion) {
    if (aOldVersion < aNewVersion) {
      let next = this.upgradeSchema.bind(this, aTransaction, aDb,
                                         aOldVersion + 1, aNewVersion);
      this["upgradeSchema" + aOldVersion](aDb, aTransaction, next);
      return;
    }

    if (aOldVersion == aNewVersion) {
      if (DEBUG) debug("Upgrade finished.");
      return;
    }

    aTransaction.abort();
  },

  /**
   * Create the initial database schema.
   *
   * TODO need to worry about number normalization somewhere...
   * TODO full text search on body???
   */
  upgradeSchema0: function upgradeSchema0(db, transaction, next) {
    if (DEBUG) debug("New database");
    // This messageStore holds the main mobile message data.
    let messageStore = db.createObjectStore(MESSAGE_STORE_NAME, { keyPath: "id" });
    messageStore.createIndex("timestamp", "timestamp", { unique: false });
    if (DEBUG) debug("Created object stores and indexes");
    next();
  },

  /**
   * Upgrade to the corresponding database schema version.
   */
  upgradeSchema1: function upgradeSchema1(db, transaction, next) {
    if (DEBUG) debug("Upgrade to version 2. Including `read` index");
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);
    messageStore.createIndex("read", "read", { unique: false });
    next();
  },

  upgradeSchema2: function upgradeSchema2(db, transaction, next) {
    if (DEBUG) debug("Upgrade to version 3. Fix existing entries.");
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);
    messageStore.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) {
        next();
        return;
      }

      let messageRecord = cursor.value;
      messageRecord.messageClass = MESSAGE_CLASS_NORMAL;
      messageRecord.deliveryStatus = DELIVERY_STATUS_NOT_APPLICABLE;
      cursor.update(messageRecord);
      cursor.continue();
    };
  },

  upgradeSchema3: function upgradeSchema3(db, transaction, next) {
    if (DEBUG) debug("Upgrade to version 4. Add quick threads view.");
    // Delete redundant "id" index.
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);
    if (messageStore.indexNames.contains("id")) {
      messageStore.deleteIndex("id");
    }

    /**
     * This mostRecentStore can be used to quickly construct a thread view of
     * the mobile message database. Each entry looks like this:
     *
     * { senderOrReceiver: <String> (primary key),
     *   id: <Number>,
     *   timestamp: <Date>,
     *   body: <String>,
     *   unreadCount: <Number> }
     *
     */
    let mostRecentStore = db.createObjectStore(MOST_RECENT_STORE_NAME,
                                               { keyPath: "senderOrReceiver" });
    mostRecentStore.createIndex("timestamp", "timestamp");
    next();
  },

  upgradeSchema4: function upgradeSchema4(db, transaction, next) {
    if (DEBUG) debug("Upgrade to version 5. Populate quick threads view.");
    let threads = {};
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);
    let mostRecentStore = transaction.objectStore(MOST_RECENT_STORE_NAME);

    messageStore.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) {
        for (let thread in threads) {
          mostRecentStore.put(threads[thread]);
        }
        next();
        return;
      }

      let messageRecord = cursor.value;
      let contact = messageRecord.sender || messageRecord.receiver;

      if (contact in threads) {
        let thread = threads[contact];
        if (!messageRecord.read) {
          thread.unreadCount++;
        }
        if (messageRecord.timestamp > thread.timestamp) {
          thread.id = messageRecord.id;
          thread.body = messageRecord.body;
          thread.timestamp = messageRecord.timestamp;
        }
      } else {
        threads[contact] = {
          senderOrReceiver: contact,
          id: messageRecord.id,
          timestamp: messageRecord.timestamp,
          body: messageRecord.body,
          unreadCount: messageRecord.read ? 0 : 1
        };
      }
      cursor.continue();
    };
  },

  upgradeSchema5: function upgradeSchema5(db, transaction, next) {
    if (DEBUG) debug("Upgrade to version 6. Use PhonenumberJS.");
    // Don't perform any upgrade. See Bug 819560.
    next();
  },

  upgradeSchema6: function upgradeSchema6(db, transaction, next) {
    if (DEBUG) debug("Upgrade to version 7. Use multiple entry indexes.");
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

    // Delete "delivery" index.
    if (messageStore.indexNames.contains("delivery")) {
      messageStore.deleteIndex("delivery");
    }
    // Delete "sender" index.
    if (messageStore.indexNames.contains("sender")) {
      messageStore.deleteIndex("sender");
    }
    // Delete "receiver" index.
    if (messageStore.indexNames.contains("receiver")) {
      messageStore.deleteIndex("receiver");
    }
    // Delete "read" index.
    if (messageStore.indexNames.contains("read")) {
      messageStore.deleteIndex("read");
    }

    // Create new "delivery", "number" and "read" indexes.
    messageStore.createIndex("delivery", "deliveryIndex");
    messageStore.createIndex("number", "numberIndex", { multiEntry: true });
    messageStore.createIndex("read", "readIndex");

    // Populate new "deliverIndex", "numberIndex" and "readIndex" attributes.
    messageStore.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) {
        next();
        return;
      }

      let messageRecord = cursor.value;
      let timestamp = messageRecord.timestamp;
      messageRecord.deliveryIndex = [messageRecord.delivery, timestamp];
      messageRecord.numberIndex = [
        [messageRecord.sender, timestamp],
        [messageRecord.receiver, timestamp]
      ];
      messageRecord.readIndex = [messageRecord.read, timestamp];
      cursor.update(messageRecord);
      cursor.continue();
    };
  },

  /**
   * Add participant/thread stores.
   *
   * The message store now saves original phone numbers/addresses input from
   * content to message records. No normalization is made.
   *
   * For filtering messages by phone numbers, it first looks up corresponding
   * participant IDs from participant table and fetch message records with
   * matching keys defined in per record "participantIds" field.
   *
   * For message threading, messages with the same participant ID array are put
   * in the same thread. So updating "unreadCount", "lastMessageId" and
   * "lastTimestamp" are through the "threadId" carried by per message record.
   * Fetching threads list is now simply walking through the thread sotre. The
   * "mostRecentStore" is dropped.
   */
  upgradeSchema7: function upgradeSchema7(db, transaction, next) {
    if (DEBUG) debug("Upgrade to version 8. Add participant/thread stores.");
    /**
     * This "participant" object store keeps mappings of multiple phone numbers
     * of the same recipient to an integer participant id. Each entry looks
     * like:
     *
     * { id: <Number> (primary key),
     *   addresses: <Array of strings> }
     */
    let participantStore = db.createObjectStore(PARTICIPANT_STORE_NAME,
                                                { keyPath: "id",
                                                  autoIncrement: true });
    participantStore.createIndex("addresses", "addresses", { multiEntry: true });

    /**
     * This "threads" object store keeps mappings from an integer thread id to
     * ids of the participants of that message thread. Each entry looks like:
     *
     * { id: <Number> (primary key),
     *   participantIds: <Array of participant IDs>,
     *   participantAddresses: <Array of the first addresses of the participants>,
     *   lastMessageId: <Number>,
     *   lastTimestamp: <Date>,
     *   subject: <String>,
     *   unreadCount: <Number> }
     *
     */
    let threadStore = db.createObjectStore(THREAD_STORE_NAME,
                                           { keyPath: "id",
                                             autoIncrement: true });
    threadStore.createIndex("participantIds", "participantIds");
    threadStore.createIndex("lastTimestamp", "lastTimestamp");

    /**
     * Replace "numberIndex" with "participantIdsIndex" and create an additional
     * "threadId". "numberIndex" will be removed later.
     */
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);
    messageStore.createIndex("threadId", "threadIdIndex");
    messageStore.createIndex("participantIds", "participantIdsIndex",
                             { multiEntry: true });

    // Now populate participantStore & threadStore.
    let mostRecentStore = transaction.objectStore(MOST_RECENT_STORE_NAME);
    let self = this;
    let mostRecentRequest = mostRecentStore.openCursor();
    mostRecentRequest.onsuccess = function(event) {
      let mostRecentCursor = event.target.result;
      if (!mostRecentCursor) {
        db.deleteObjectStore(MOST_RECENT_STORE_NAME);

        // No longer need the "number" index in messageStore, use
        // "participantIds" index instead.
        messageStore.deleteIndex("number");
        next();
        return;
      }

      let mostRecentRecord = mostRecentCursor.value;

      // Each entry in mostRecentStore is supposed to be a unique thread, so we
      // retrieve the records out and insert its "senderOrReceiver" column as a
      // new record in participantStore.
      let number = mostRecentRecord.senderOrReceiver;
      self.findParticipantRecordByAddress(participantStore, number, true,
                                          function (participantRecord) {
        // Also create a new record in threadStore.
        let threadRecord = {
          participantIds: [participantRecord.id],
          participantAddresses: [number],
          lastMessageId: mostRecentRecord.id,
          lastTimestamp: mostRecentRecord.timestamp,
          subject: mostRecentRecord.body,
          unreadCount: mostRecentRecord.unreadCount,
        };
        let addThreadRequest = threadStore.add(threadRecord);
        addThreadRequest.onsuccess = function (event) {
          threadRecord.id = event.target.result;

          let numberRange =
            self.dbGlobal.IDBKeyRange.bound([number, 0], [number, ""]);
          let messageRequest = messageStore.index("number")
                                           .openCursor(numberRange, NEXT);
          messageRequest.onsuccess = function (event) {
            let messageCursor = event.target.result;
            if (!messageCursor) {
              // No more message records, check next most recent record.
              mostRecentCursor.continue();
              return;
            }

            let messageRecord = messageCursor.value;
            // Check whether the message really belongs to this thread.
            let matchSenderOrReceiver = false;
            if (messageRecord.delivery == DELIVERY_RECEIVED) {
              if (messageRecord.sender == number) {
                matchSenderOrReceiver = true;
              }
            } else if (messageRecord.receiver == number) {
              matchSenderOrReceiver = true;
            }
            if (!matchSenderOrReceiver) {
              // Check next message record.
              messageCursor.continue();
              return;
            }

            messageRecord.threadId = threadRecord.id;
            messageRecord.threadIdIndex = [threadRecord.id,
                                           messageRecord.timestamp];
            messageRecord.participantIdsIndex = [
              [participantRecord.id, messageRecord.timestamp]
            ];
            messageCursor.update(messageRecord);
            // Check next message record.
            messageCursor.continue();
          };
          messageRequest.onerror = function () {
            // Error in fetching message records, check next most recent record.
            mostRecentCursor.continue();
          };
        };
        addThreadRequest.onerror = function () {
          // Error in fetching message records, check next most recent record.
          mostRecentCursor.continue();
        };
      });
    };
  },

  /**
   * Add transactionId index for MMS.
   */
  upgradeSchema8: function upgradeSchema8(db, transaction, next) {
    if (DEBUG) {
      debug("Upgrade to version 9. Add transactionId index for incoming MMS.");
    }
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

    // Delete "transactionId" index.
    if (messageStore.indexNames.contains("transactionId")) {
      messageStore.deleteIndex("transactionId");
    }

    // Create new "transactionId" indexes.
    messageStore.createIndex("transactionId", "transactionIdIndex", { unique: true });

    // Populate new "transactionIdIndex" attributes.
    messageStore.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) {
        next();
        return;
      }

      let messageRecord = cursor.value;
      if ("mms" == messageRecord.type &&
          (DELIVERY_NOT_DOWNLOADED == messageRecord.delivery ||
           DELIVERY_RECEIVED == messageRecord.delivery)) {
        messageRecord.transactionIdIndex =
          messageRecord.headers["x-mms-transaction-id"];
        cursor.update(messageRecord);
      }
      cursor.continue();
    };
  },

  upgradeSchema9: function upgradeSchema9(db, transaction, next) {
    if (DEBUG) {
      debug("Upgrade to version 10. Upgrade type if it's not existing.");
    }
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

    // Update type attributes.
    messageStore.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) {
        next();
        return;
      }

      let messageRecord = cursor.value;
      if (messageRecord.type == undefined) {
        messageRecord.type = "sms";
        cursor.update(messageRecord);
      }
      cursor.continue();
    };
  },

  upgradeSchema10: function upgradeSchema10(db, transaction, next) {
    if (DEBUG) {
      debug("Upgrade to version 11. Add last message type into threadRecord.");
    }
    let threadStore = transaction.objectStore(THREAD_STORE_NAME);

    // Add 'lastMessageType' to each thread record.
    threadStore.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) {
        next();
        return;
      }

      let threadRecord = cursor.value;
      let lastMessageId = threadRecord.lastMessageId;
      let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);
      let request = messageStore.mozGetAll(lastMessageId);

      request.onsuccess = function onsuccess() {
        let messageRecord = request.result[0];
        if (!messageRecord) {
          if (DEBUG) debug("Message ID " + lastMessageId + " not found");
          return;
        }
        if (messageRecord.id != lastMessageId) {
          if (DEBUG) {
            debug("Requested message ID (" + lastMessageId + ") is different from" +
                  " the one we got");
          }
          return;
        }
        threadRecord.lastMessageType = messageRecord.type;
        cursor.update(threadRecord);
        cursor.continue();
      };

      request.onerror = function onerror(event) {
        if (DEBUG) {
          if (event.target) {
            debug("Caught error on transaction", event.target.errorCode);
          }
        }
        cursor.continue();
      };
    };
  },

  /**
   * Add envelopeId index for MMS.
   */
  upgradeSchema11: function upgradeSchema11(db, transaction, next) {
    if (DEBUG) {
      debug("Upgrade to version 12. Add envelopeId index for outgoing MMS.");
    }
    let messageStore = transaction.objectStore(MESSAGE_STORE_NAME);

    // Delete "envelopeId" index.
    if (messageStore.indexNames.contains("envelopeId")) {
      messageStore.deleteIndex("envelopeId");
    }

    // Create new "envelopeId" indexes.
    messageStore.createIndex("envelopeId", "envelopeIdIndex", { unique: true });

    // Populate new "envelopeIdIndex" attributes.
    messageStore.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) {
        next();
        return;
      }

      let messageRecord = cursor.value;
      if (messageRecord.type == "mms" &&
          messageRecord.delivery == DELIVERY_SENT) {
        messageRecord.envelopeIdIndex = messageRecord.headers["message-id"];
        cursor.update(messageRecord);
      }
      cursor.continue();
    };
  },

  createDomMessageFromRecord: function createDomMessageFromRecord(aMessageRecord) {
    if (DEBUG) {
      debug("createDomMessageFromRecord: " + JSON.stringify(aMessageRecord));
    }
    if (aMessageRecord.type == "sms") {
      return gMobileMessageService.createSmsMessage(aMessageRecord.id,
                                                    aMessageRecord.threadId,
                                                    aMessageRecord.delivery,
                                                    aMessageRecord.deliveryStatus,
                                                    aMessageRecord.sender,
                                                    aMessageRecord.receiver,
                                                    aMessageRecord.body,
                                                    aMessageRecord.messageClass,
                                                    aMessageRecord.timestamp,
                                                    aMessageRecord.read);
    } else if (aMessageRecord.type == "mms") {
      let headers = aMessageRecord["headers"];
      if (DEBUG) {
        debug("MMS: headers: " + JSON.stringify(headers));
      }

      let subject = headers["subject"];
      if (subject == undefined) {
        subject = "";
      }

      let smil = "";
      let attachments = [];
      let parts = aMessageRecord.parts;
      if (parts) {
        for (let i = 0; i < parts.length; i++) {
          let part = parts[i];
          if (DEBUG) {
            debug("MMS: part[" + i + "]: " + JSON.stringify(part));
          }
          // Sometimes the part is incomplete because the device reboots when
          // downloading MMS. Don't need to expose this part to the content.
          if (!part) {
            continue;
          }

          let partHeaders = part["headers"];
          let partContent = part["content"];
          // Don't need to make the SMIL part if it's present.
          if (partHeaders["content-type"]["media"] == "application/smil") {
            smil = partContent;
            continue;
          }
          attachments.push({
            "id": partHeaders["content-id"],
            "location": partHeaders["content-location"],
            "content": partContent
          });
        }
      }
      let expiryDate = 0;
      if (headers["x-mms-expiry"] != undefined) {
        expiryDate = aMessageRecord.timestamp + headers["x-mms-expiry"] * 1000;
      }
      return gMobileMessageService.createMmsMessage(aMessageRecord.id,
                                                    aMessageRecord.threadId,
                                                    aMessageRecord.delivery,
                                                    aMessageRecord.deliveryStatus,
                                                    aMessageRecord.sender,
                                                    aMessageRecord.receivers,
                                                    aMessageRecord.timestamp,
                                                    aMessageRecord.read,
                                                    subject,
                                                    smil,
                                                    attachments,
                                                    expiryDate);
    }
  },

  createDomThreadFromRecord: function createDomThreadFromRecord(aThreadRecord) {
    if (DEBUG) {
      debug("createDomThreadFromRecord: " + JSON.stringify(aThreadRecord));
    }
    return gMobileMessageService.createThread(aThreadRecord.id,
                                              aThreadRecord.participantAddresses,
                                              aThreadRecord.lastTimestamp,
                                              aThreadRecord.subject,
                                              aThreadRecord.unreadCount,
                                              aThreadRecord.lastMessageType);
  },

  findParticipantRecordByAddress:
      function findParticipantRecordByAddress(aParticipantStore, aAddress,
                                              aCreate, aCallback) {
    if (DEBUG) {
      debug("findParticipantRecordByAddress("
            + JSON.stringify(aAddress) + ", " + aCreate + ")");
    }

    // Two types of input number to match here, international(+886987654321),
    // and local(0987654321) types. The "nationalNumber" parsed from
    // phonenumberutils will be "987654321" in this case.

    // Normalize address before searching for participant record.
    let normalizedAddress = PhoneNumberUtils.normalize(aAddress, false);
    let allPossibleAddresses = [normalizedAddress];
    let parsedAddress = PhoneNumberUtils.parse(normalizedAddress);
    if (parsedAddress && parsedAddress.internationalNumber &&
        allPossibleAddresses.indexOf(parsedAddress.internationalNumber) < 0) {
      // We only stores international numbers into participant store because
      // the parsed national number doesn't contain country info and may
      // duplicate in different country.
      allPossibleAddresses.push(parsedAddress.internationalNumber);
    }
    if (DEBUG) {
      debug("findParticipantRecordByAddress: allPossibleAddresses = " +
            JSON.stringify(allPossibleAddresses));
    }

    // Make a copy here because we may need allPossibleAddresses again.
    let needles = allPossibleAddresses.slice(0);
    let request = aParticipantStore.index("addresses").get(needles.pop());
    request.onsuccess = (function onsuccess(event) {
      let participantRecord = event.target.result;
      // 1) First try matching through "addresses" index of participant store.
      //    If we're lucky, return the fetched participant record.
      if (participantRecord) {
        if (DEBUG) {
          debug("findParticipantRecordByAddress: got "
                + JSON.stringify(participantRecord));
        }
        aCallback(participantRecord);
        return;
      }

      // Try next possible address again.
      if (needles.length) {
        let request = aParticipantStore.index("addresses").get(needles.pop());
        request.onsuccess = onsuccess.bind(this);
        return;
      }

      // 2) Traverse throught all participants and check all alias addresses.
      aParticipantStore.openCursor().onsuccess = (function (event) {
        let cursor = event.target.result;
        if (!cursor) {
          // Have traversed whole object store but still in vain.
          if (!aCreate) {
            aCallback(null);
            return;
          }

          let participantRecord = { addresses: [normalizedAddress] };
          let addRequest = aParticipantStore.add(participantRecord);
          addRequest.onsuccess = function (event) {
            participantRecord.id = event.target.result;
            if (DEBUG) {
              debug("findParticipantRecordByAddress: created "
                    + JSON.stringify(participantRecord));
            }
            aCallback(participantRecord);
          };
          return;
        }

        let participantRecord = cursor.value;
        for (let storedAddress of participantRecord.addresses) {
          let match = false;
          if (parsedAddress) {
            // 2-1) If input number is an international one, then a potential
            //      participant must be stored as local type.  Then just check
            //      if stored number ends with the national number(987654321) of
            //      the input number.
            if (storedAddress.endsWith(parsedAddress.nationalNumber)) {
              match = true;
            }
          } else {
            // 2-2) Else if the stored number is an international one, then the
            //      input number must be local type.  Then just check whether
            //      does it ends with the national number of the stored number.
            let parsedStoredAddress =
              PhoneNumberUtils.parseWithMCC(storedAddress, null);
            if (parsedStoredAddress
                && normalizedAddress.endsWith(parsedStoredAddress.nationalNumber)) {
              match = true;
            }
          }
          if (!match) {
            // 3) Else we fail to match current stored participant record.
            continue;
          }

          // Match!
          if (aCreate) {
            // In a READ-WRITE transaction, append one more possible address for
            // this participant record.
            participantRecord.addresses =
              participantRecord.addresses.concat(allPossibleAddresses);
            cursor.update(participantRecord);
          }
          if (DEBUG) {
            debug("findParticipantRecordByAddress: match "
                  + JSON.stringify(cursor.value));
          }
          aCallback(participantRecord);
          return;
        }

        // Check next participant record if available.
        cursor.continue();
      }).bind(this);
    }).bind(this);
  },

  findParticipantIdsByAddresses:
      function findParticipantIdsByAddresses(aParticipantStore, aAddresses,
                                             aCreate, aSkipNonexistent,
                                             aCallback) {
    if (DEBUG) {
      debug("findParticipantIdsByAddresses("
            + JSON.stringify(aAddresses) + ", "
            + aCreate + ", " + aSkipNonexistent + ")");
    }

    if (!aAddresses || !aAddresses.length) {
      if (DEBUG) debug("findParticipantIdsByAddresses: returning null");
      aCallback(null);
      return;
    }

    let self = this;
    (function findParticipantId(index, result) {
      if (index >= aAddresses.length) {
        // Sort numerically.
        result.sort(function (a, b) {
          return a - b;
        });
        if (DEBUG) debug("findParticipantIdsByAddresses: returning " + result);
        aCallback(result);
        return;
      }

      self.findParticipantRecordByAddress(aParticipantStore,
                                          aAddresses[index++], aCreate,
                                          function (participantRecord) {
        if (!participantRecord) {
          if (!aSkipNonexistent) {
            if (DEBUG) debug("findParticipantIdsByAddresses: returning null");
            aCallback(null);
            return;
          }
        } else if (result.indexOf(participantRecord.id) < 0) {
          result.push(participantRecord.id);
        }
        findParticipantId(index, result);
      });
    }) (0, []);
  },

  findThreadRecordByParticipants:
      function findThreadRecordByParticipants(aThreadStore, aParticipantStore,
                                              aAddresses, aCreateParticipants,
                                              aCallback) {
    if (DEBUG) {
      debug("findThreadRecordByParticipants(" + JSON.stringify(aAddresses)
            + ", " + aCreateParticipants + ")");
    }
    this.findParticipantIdsByAddresses(aParticipantStore, aAddresses,
                                       aCreateParticipants, false,
                                       function (participantIds) {
      if (!participantIds) {
        if (DEBUG) debug("findThreadRecordByParticipants: returning null");
        aCallback(null, null);
        return;
      }
      // Find record from thread store.
      let request = aThreadStore.index("participantIds").get(participantIds);
      request.onsuccess = function (event) {
        let threadRecord = event.target.result;
        if (DEBUG) {
          debug("findThreadRecordByParticipants: return "
                + JSON.stringify(threadRecord));
        }
        aCallback(threadRecord, participantIds);
      };
    });
  },

  updateThreadByMessageChange: function updateThreadByMessageChange(messageStore,
                                                                    threadStore,
                                                                    threadId,
                                                                    messageId,
                                                                    messageRead) {
    let self = this;
    threadStore.get(threadId).onsuccess = function(event) {
      // This must exist.
      let threadRecord = event.target.result;
      if (DEBUG) debug("Updating thread record " + JSON.stringify(threadRecord));

      if (!messageRead) {
        threadRecord.unreadCount--;
      }

      if (threadRecord.lastMessageId == messageId) {
        // Check most recent sender/receiver.
        let range =
          self.dbGlobal.IDBKeyRange.bound([threadId, 0], [threadId, ""]);
        let request = messageStore.index("threadId")
                                  .openCursor(range, PREV);
        request.onsuccess = function(event) {
          let cursor = event.target.result;
          if (!cursor) {
            if (DEBUG) {
              debug("Deleting mru entry for thread id " + threadId);
            }
            threadStore.delete(threadId);
            return;
          }

          let nextMsg = cursor.value;
          threadRecord.lastMessageId = nextMsg.id;
          threadRecord.lastTimestamp = nextMsg.timestamp;
          threadRecord.subject = nextMsg.body;
          threadRecord.lastMessageType = nextMsg.type;
          if (DEBUG) {
            debug("Updating mru entry: " +
                  JSON.stringify(threadRecord));
          }
          threadStore.put(threadRecord);
        };
      } else if (!messageRead) {
        // Shortcut, just update the unread count.
        if (DEBUG) {
          debug("Updating unread count for thread id " + threadId + ": " +
                (threadRecord.unreadCount + 1) + " -> " +
                threadRecord.unreadCount);
        }
        threadStore.put(threadRecord);
      }
    };
  },

  saveMessageRecord: function saveMessageRecord(aMessageRecord, aAddresses,
                                                aCallback) {
    let isOverriding = (aMessageRecord.id !== undefined);
    if (!isOverriding) {
      // Assign a new id.
      this.lastMessageId += 1;
      aMessageRecord.id = this.lastMessageId;
    }
    if (DEBUG) debug("Going to store " + JSON.stringify(aMessageRecord));

    let self = this;
    this.newTxn(READ_WRITE, function(error, txn, stores) {
      if (error) {
        // TODO bug 832140 check event.target.errorCode
        aCallback(Cr.NS_ERROR_FAILURE, null);
        return;
      }
      txn.oncomplete = function oncomplete(event) {
        aCallback(Cr.NS_OK, aMessageRecord);
      };
      txn.onabort = function onabort(event) {
        // TODO bug 832140 check event.target.errorCode
        aCallback(Cr.NS_ERROR_FAILURE, null);
      };

      let messageStore = stores[0];
      let participantStore = stores[1];
      let threadStore = stores[2];

      self.findThreadRecordByParticipants(threadStore, participantStore,
                                          aAddresses, true,
                                          function (threadRecord,
                                                    participantIds) {
        if (!participantIds) {
          aCallback(Cr.NS_ERROR_FAILURE, null);
          return;
        }

        let insertMessageRecord = function (threadId) {
          // Setup threadId & threadIdIndex.
          aMessageRecord.threadId = threadId;
          aMessageRecord.threadIdIndex = [threadId, timestamp];
          // Setup participantIdsIndex.
          aMessageRecord.participantIdsIndex = [];
          for each (let id in participantIds) {
            aMessageRecord.participantIdsIndex.push([id, timestamp]);
          }

          if (!isOverriding) {
            // Really add to message store.
            messageStore.put(aMessageRecord);
            return;
          }

          // If we're going to override an old message, we need to update the
          // info of the original thread containing the overridden message.
          // To get the original thread ID and read status of the overridden
          // message record, we need to retrieve it before overriding it.
          messageStore.get(aMessageRecord.id).onsuccess = function(event) {
            let oldMessageRecord = event.target.result;
            messageStore.put(aMessageRecord);
            if (oldMessageRecord) {
              self.updateThreadByMessageChange(messageStore,
                                               threadStore,
                                               oldMessageRecord.threadId,
                                               aMessageRecord.id,
                                               oldMessageRecord.read);
            }
          };
        };

        let timestamp = aMessageRecord.timestamp;
        if (threadRecord) {
          let needsUpdate = false;

          if (threadRecord.lastTimestamp <= timestamp) {
            threadRecord.lastTimestamp = timestamp;
            threadRecord.subject = aMessageRecord.body;
            threadRecord.lastMessageId = aMessageRecord.id;
            threadRecord.lastMessageType = aMessageRecord.type;
            needsUpdate = true;
          }

          if (!aMessageRecord.read) {
            threadRecord.unreadCount++;
            needsUpdate = true;
          }

          if (needsUpdate) {
            threadStore.put(threadRecord);
          }

          insertMessageRecord(threadRecord.id);
          return;
        }

        threadStore.add({participantIds: participantIds,
                         participantAddresses: aAddresses,
                         lastMessageId: aMessageRecord.id,
                         lastTimestamp: timestamp,
                         subject: aMessageRecord.body,
                         unreadCount: aMessageRecord.read ? 0 : 1,
                         lastMessageType: aMessageRecord.type})
                   .onsuccess = function (event) {
          let threadId = event.target.result;
          insertMessageRecord(threadId);
        };
      });
    }, [MESSAGE_STORE_NAME, PARTICIPANT_STORE_NAME, THREAD_STORE_NAME]);
    // We return the key that we expect to store in the db
    return aMessageRecord.id;
  }
};

this.EXPORTED_SYMBOLS = [
  "MobileMessageDB",

  "DB_VERSION",

  // ObjectStore names:
  "MESSAGE_STORE_NAME",
  "THREAD_STORE_NAME",
  "PARTICIPANT_STORE_NAME",
  "MOST_RECENT_STORE_NAME",

  // Message Delivery States:
  "DELIVERY_SENDING",
  "DELIVERY_SENT",
  "DELIVERY_RECEIVED",
  "DELIVERY_NOT_DOWNLOADED",
  "DELIVERY_ERROR",

  // Message Delivery Statuses:
  "DELIVERY_STATUS_NOT_APPLICABLE",
  "DELIVERY_STATUS_SUCCESS",
  "DELIVERY_STATUS_PENDING",
  "DELIVERY_STATUS_ERROR",

  // Message Classes:
  "MESSAGE_CLASS_NORMAL",

  // IDBTransactionMode:
  "READ_ONLY", "READ_WRITE",

  // IDBCursorDirection:
  "PREV", "NEXT",
];
