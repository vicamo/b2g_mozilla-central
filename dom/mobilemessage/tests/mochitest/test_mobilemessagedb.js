"use strict";

function domStringListToArray(aDomStringList) {
  return (function append(list, index, result) {
      if (index >= list.length) {
        return result;
      }
      result.push(list[index]);
      return append(list, index + 1, result);
    }(aDomStringList, 0, []));
}

// Match {
//  index1: {
//    keyPath: [optional]<DOMString or DOMStringList, default "index1">
//    multiEntry: [optional]<boolean, default false>
//    unique: [optional]<boolean, default false>
//  }
// };
function checkIndexes(aObjectStore, aIndexAttributes) {
  let osName = aObjectStore.name;
  let osTitle = "objectStore('" + osName + "')";

  // From W3C Indexed Database API subclause 3.2.5 "Object Store":
  // "The list MUST be sorted in ascending order".
  let osIndexNames = domStringListToArray(aObjectStore.indexNames);
  let indexNames = Object.keys(aIndexAttributes);
  indexNames.sort();
  isDeeply(osIndexNames, indexNames, osName + ".indexNames");

  for (let indexName in aIndexAttributes) {
    let title = osTitle + ".index('" + indexName + "')";

    let osIndex = aObjectStore.index(indexName);
    ok(osIndex instanceof IDBIndex, title);

    let indexAttr = aIndexAttributes[indexName];
    is(osIndex.keyPath, (indexAttr && indexAttr.keyPath) || indexName,
       title + ".keyPath");
    is(osIndex.multiEntry, (indexAttr && indexAttr.multiEntry) || false,
       title + ".multiEntry");
    is(osIndex.unique, (indexAttr && indexAttr.unique) || false,
       title + ".unique");
  }
}

function checkObjectStore(aTransaction, aStoreName, aKeyPath, aAutoIncrement,
                          aIndexAttributes) {
  let title = "objectStore('" + aStoreName + "')";
  let objectStore = aTransaction.objectStore(aStoreName);
  is(objectStore.name, aStoreName, title + ".name");
  is(objectStore.keyPath, aKeyPath, title + ".keyPath");
  is(objectStore.autoIncrement, aAutoIncrement, title + ".autoIncrement");

  checkIndexes(objectStore, aIndexAttributes);
}

let helper_global = this;
function checkObjectStoreVersion(aTransaction, aDbVersion) {
  helper_global["checkObjectStoreVersion" + aDbVersion](aTransaction);
}

function initDatabase(aMobileMessageDb, aDbName, aDbVersion, aDbScope,
                      aStoreNames, aOnSuccess) {
  aMobileMessageDb.init(aDbName, aDbVersion, aDbScope);
  window.setTimeout(function wait() {
    if (!aMobileMessageDb._db) {
      window.setTimeout(wait, 100);
      return;
    }

    aMobileMessageDb.newTxn(READ_ONLY, aStoreNames,
                            function ontxncallback(aTransaction) {
      try {
        is(aMobileMessageDb._db.name, aDbName, "aMobileMessageDb._db.name");
        is(aMobileMessageDb._db.version, aDbVersion, "aMobileMessageDb._db.version");

        // From W3C Indexed Database API subclause 3.2.4 "Database":
        // "The list MUST be sorted in ascending order".
        let sortedStoreNames = aStoreNames.slice();
        sortedStoreNames.sort();
        isDeeply(domStringListToArray(aMobileMessageDb._db.objectStoreNames),
                 sortedStoreNames, "aMobileMessageDb._db.objectStoreNames");

        checkObjectStoreVersion(aTransaction, aDbVersion);
      } catch (e) {
        aTransaction.abort();
      }
    }, aOnSuccess);
  }, 100);
}

function deleteDatabaseIfExists(aIDBScope, aDbName, aOnSuccess) {
  let request = aIDBScope.indexedDB.deleteDatabase(aDbName);
  request.onsuccess = aOnSuccess;
  request.onerror = function (event) {
    info("failed to remove database with error: " + request.error.name);
  };
}

/**
 * Version 1 specific functions.
 */

function checkObjectStoreVersion1(aTransaction) {
  checkObjectStore(aTransaction, MESSAGE_STORE_NAME, "id", false, {
    // upgradeSchema0
    timestamp: null,
  });
}

/**
 * Version 2 specific functions.
 */

function checkObjectStoreVersion2(aTransaction) {
  checkObjectStore(aTransaction, MESSAGE_STORE_NAME, "id", false, {
    // upgradeSchema0
    timestamp: null,

    // upgradeSchema1
    read: null,
  });
}

/**
 * Version 3 specific functions.
 */

let checkObjectStoreVersion3 = checkObjectStoreVersion2;

/**
 * Version 4 specific functions.
 */

function checkObjectStoreVersion4(aTransaction) {
  checkObjectStore(aTransaction, MESSAGE_STORE_NAME, "id", false, {
    // upgradeSchema0
    timestamp: null,

    // upgradeSchema1
    read: null,
  });

  checkObjectStore(aTransaction, MOST_RECENT_STORE_NAME, "senderOrReceiver",
                   false, {
    // upgradeSchema3
    timestamp: null,
  });
}

/**
 * Version 5 specific functions.
 */

let checkObjectStoreVersion5 = checkObjectStoreVersion4;

/**
 * Version 6 specific functions.
 */

let checkObjectStoreVersion6 = checkObjectStoreVersion5;

/**
 * Version 7 specific functions.
 */

function checkObjectStoreVersion7(aTransaction) {
  checkObjectStore(aTransaction, MESSAGE_STORE_NAME, "id", false, {
    // upgradeSchema0
    timestamp: null,

    // upgradeSchema6
    delivery: { keyPath: "deliveryIndex", },
    number: { keyPath: "numberIndex", multiEntry: true },
    read: { keyPath: "readIndex", },
  });

  checkObjectStore(aTransaction, MOST_RECENT_STORE_NAME, "senderOrReceiver",
                   false, {
    // upgradeSchema3
    timestamp: null,
  });
}

/**
 * Version 8 specific functions.
 */

function checkObjectStoreVersion8(aTransaction) {
  checkObjectStore(aTransaction, MESSAGE_STORE_NAME, "id", false, {
    // upgradeSchema0
    timestamp: null,

    // upgradeSchema6
    delivery: { keyPath: "deliveryIndex", },
    read: { keyPath: "readIndex", },
    // number: { keyPath: "numberIndex", multiEntry: true }, // deleted in upgradeSchema7

    // upgradeSchema7
    threadId: { keyPath: "threadIdIndex", },
    participantIds: { keyPath: "participantIdsIndex", multiEntry: true, },
  });

  checkObjectStore(aTransaction, THREAD_STORE_NAME, "id", true, {
    // upgradeSchema7
    participantIds: null,
    lastTimestamp: null,
  });

  checkObjectStore(aTransaction, PARTICIPANT_STORE_NAME, "id", true, {
    // upgradeSchema7
    addresses: { multiEntry: true, },
  });
}

/**
 * Version 9 specific functions.
 */

function checkObjectStoreVersion9(aTransaction) {
  checkObjectStore(aTransaction, MESSAGE_STORE_NAME, "id", false, {
    // upgradeSchema0
    timestamp: null,

    // upgradeSchema6
    delivery: { keyPath: "deliveryIndex", },
    read: { keyPath: "readIndex", },
    // number: { keyPath: "numberIndex", multiEntry: true }, // deleted in upgradeSchema7

    // upgradeSchema7
    threadId: { keyPath: "threadIdIndex", },
    participantIds: { keyPath: "participantIdsIndex", multiEntry: true, },

    // upgradeSchema8
    transactionId: { keyPath: "transactionIdIndex", unique: true, },
  });

  checkObjectStore(aTransaction, THREAD_STORE_NAME, "id", true, {
    // upgradeSchema7
    participantIds: null,
    lastTimestamp: null,
  });

  checkObjectStore(aTransaction, PARTICIPANT_STORE_NAME, "id", true, {
    // upgradeSchema7
    addresses: { multiEntry: true, },
  });
}

/**
 * Version 10 specific functions.
 */

let checkObjectStoreVersion10 = checkObjectStoreVersion9;

/**
 * Version 11 specific functions.
 */

let checkObjectStoreVersion11 = checkObjectStoreVersion10;

/**
 * Version 12 specific functions.
 */

function checkObjectStoreVersion12(aTransaction) {
  checkObjectStore(aTransaction, MESSAGE_STORE_NAME, "id", false, {
    // upgradeSchema0
    timestamp: null,

    // upgradeSchema6
    delivery: { keyPath: "deliveryIndex", },
    read: { keyPath: "readIndex", },
    // number: { keyPath: "numberIndex", multiEntry: true }, // deleted in upgradeSchema7

    // upgradeSchema7
    threadId: { keyPath: "threadIdIndex", },
    participantIds: { keyPath: "participantIdsIndex", multiEntry: true, },

    // upgradeSchema8
    transactionId: { keyPath: "transactionIdIndex", unique: true, },

    // upgradeSchema11
    envelopeId: { keyPath: "envelopeIdIndex", unique: true, },
  });

  checkObjectStore(aTransaction, THREAD_STORE_NAME, "id", true, {
    // upgradeSchema7
    participantIds: null,
    lastTimestamp: null,
  });

  checkObjectStore(aTransaction, PARTICIPANT_STORE_NAME, "id", true, {
    // upgradeSchema7
    addresses: { multiEntry: true, },
  });
}
