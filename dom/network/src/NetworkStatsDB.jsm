/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ['NetworkStatsDB'];

const DEBUG = false;
function debug(s) { dump("-*- NetworkStatsDB: " + s + "\n"); }

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/IndexedDBHelper.jsm");
Cu.importGlobalProperties(["indexedDB"]);

const DB_NAME = "net_stats";
const DB_VERSION = 8;
const DEPRECATED_NETWORK_STORE_NAME1 = "net_stats";
const NETWORK_STORE_NAME = "net_stats_store";
const ALARM_STORE_NAME = "net_alarm";

// Constant defining the maximum values allowed per interface. If more, older
// will be erased.
const VALUES_MAX_LENGTH = 6 * 30;

// Constant defining the rate of the samples. Daily.
const SAMPLE_RATE = 1000 * 60 * 60 * 24;

this.NetworkStatsDB = function NetworkStatsDB() {
  if (DEBUG) {
    debug("Constructor");
  }
  this.initDBHelper(DB_NAME, DB_VERSION,
                    [NETWORK_STORE_NAME, ALARM_STORE_NAME]);
}

NetworkStatsDB.prototype = {
  __proto__: IndexedDBHelper.prototype,

  _dbNewTxn: function(aStoreName, aTransactionType, aCallback, aResultCb) {
    function successCb(aResult) {
      aResultCb(null, aResult);
    }
    function errorCb(aError) {
      aResultCb(aError, null);
    }
    return this.newTxn(aTransactionType, aStoreName, aCallback, successCb, errorCb);
  },

  upgradeSchema: function(aTransaction, aDb, aOldVersion, aNewVersion) {
    if (DEBUG) {
      debug("upgrade schema from: " + aOldVersion + " to " + aNewVersion + " called!");
    }
    for (let currVersion = aOldVersion; currVersion < aNewVersion; currVersion++) {
      if (currVersion == 0) {
        /**
         * Create the initial database schema.
         */

        let deprecatedNetworkStore1 =
          aDb.createObjectStore(DEPRECATED_NETWORK_STORE_NAME1,
                                { keyPath: ["connectionType", "timestamp"] });
        deprecatedNetworkStore1.createIndex("connectionType", "connectionType");
        deprecatedNetworkStore1.createIndex("timestamp", "timestamp");
        deprecatedNetworkStore1.createIndex("rxBytes", "rxBytes");
        deprecatedNetworkStore1.createIndex("txBytes", "txBytes");
        deprecatedNetworkStore1.createIndex("rxTotalBytes", "rxTotalBytes");
        deprecatedNetworkStore1.createIndex("txTotalBytes", "txTotalBytes");
        if (DEBUG) {
          debug("Created object stores and indexes");
        }
      } else if (currVersion == 2) {
        // In order to support per-app traffic data storage, the original
        // objectStore needs to be replaced by a new objectStore with new
        // key path ("appId") and new index ("appId").
        // Also, since now networks are identified by their
        // [networkId, networkType] not just by their connectionType,
        // to modify the keyPath is mandatory to delete the object store
        // and create it again. Old data is going to be deleted because the
        // networkId for each sample can not be set.

        // In version 1.2 objectStore name was 'net_stats_v2', to avoid errors when
        // upgrading from 1.2 to 1.3 objectStore name should be checked.
        let stores = aDb.objectStoreNames;
        if(stores.contains("net_stats_v2")) {
          aDb.deleteObjectStore("net_stats_v2");
        } else {
          aDb.deleteObjectStore(DEPRECATED_NETWORK_STORE_NAME1);
        }

        let deprecatedNetworkStore1 =
          aDb.createObjectStore(DEPRECATED_NETWORK_STORE_NAME1,
                                { keyPath: ["appId", "network", "timestamp"] });
        deprecatedNetworkStore1.createIndex("appId", "appId");
        deprecatedNetworkStore1.createIndex("network", "network");
        deprecatedNetworkStore1.createIndex("networkType", "networkType");
        deprecatedNetworkStore1.createIndex("timestamp", "timestamp");
        deprecatedNetworkStore1.createIndex("rxBytes", "rxBytes");
        deprecatedNetworkStore1.createIndex("txBytes", "txBytes");
        deprecatedNetworkStore1.createIndex("rxTotalBytes", "rxTotalBytes");
        deprecatedNetworkStore1.createIndex("txTotalBytes", "txTotalBytes");

        if (DEBUG) {
          debug("Created object stores and indexes for version 3");
        }
      } else if (currVersion == 3) {
        // Delete redundent indexes (leave "network" only).
        let deprecatedNetworkStore1 =
          aTransaction.objectStore(DEPRECATED_NETWORK_STORE_NAME1);
        if (deprecatedNetworkStore1.indexNames.contains("appId")) {
          deprecatedNetworkStore1.deleteIndex("appId");
        }
        if (deprecatedNetworkStore1.indexNames.contains("networkType")) {
          deprecatedNetworkStore1.deleteIndex("networkType");
        }
        if (deprecatedNetworkStore1.indexNames.contains("timestamp")) {
          deprecatedNetworkStore1.deleteIndex("timestamp");
        }
        if (deprecatedNetworkStore1.indexNames.contains("rxBytes")) {
          deprecatedNetworkStore1.deleteIndex("rxBytes");
        }
        if (deprecatedNetworkStore1.indexNames.contains("txBytes")) {
          deprecatedNetworkStore1.deleteIndex("txBytes");
        }
        if (deprecatedNetworkStore1.indexNames.contains("rxTotalBytes")) {
          deprecatedNetworkStore1.deleteIndex("rxTotalBytes");
        }
        if (deprecatedNetworkStore1.indexNames.contains("txTotalBytes")) {
          deprecatedNetworkStore1.deleteIndex("txTotalBytes");
        }

        if (DEBUG) {
          debug("Deleted redundent indexes for version 4");
        }
      } else if (currVersion == 4) {
        // In order to manage alarms, it is necessary to use a global counter
        // (totalBytes) that will increase regardless of the system reboot.
        let deprecatedNetworkStore1 =
          aTransaction.objectStore(DEPRECATED_NETWORK_STORE_NAME1);

        // Now, systemBytes will hold the old totalBytes and totalBytes will
        // keep the increasing counter. |counters| will keep the track of
        // accumulated values.
        let counters = {};

        deprecatedNetworkStore1.openCursor().onsuccess = function(event) {
          let cursor = event.target.result;
          if (!cursor){
            return;
          }

          cursor.value.rxSystemBytes = cursor.value.rxTotalBytes;
          cursor.value.txSystemBytes = cursor.value.txTotalBytes;

          if (cursor.value.appId == 0) {
            let networkId = cursor.value.network[0] + '' + cursor.value.network[1];
            if (!counters[networkId]) {
              counters[networkId] = {
                rxCounter: 0,
                txCounter: 0,
                lastRx: 0,
                lastTx: 0
              };
            }

            let rxDiff = cursor.value.rxSystemBytes - counters[networkId].lastRx;
            let txDiff = cursor.value.txSystemBytes - counters[networkId].lastTx;
            if (rxDiff < 0 || txDiff < 0) {
              // System reboot between samples, so take the current one.
              rxDiff = cursor.value.rxSystemBytes;
              txDiff = cursor.value.txSystemBytes;
            }

            counters[networkId].rxCounter += rxDiff;
            counters[networkId].txCounter += txDiff;
            cursor.value.rxTotalBytes = counters[networkId].rxCounter;
            cursor.value.txTotalBytes = counters[networkId].txCounter;

            counters[networkId].lastRx = cursor.value.rxSystemBytes;
            counters[networkId].lastTx = cursor.value.txSystemBytes;
          } else {
            cursor.value.rxTotalBytes = cursor.value.rxSystemBytes;
            cursor.value.txTotalBytes = cursor.value.txSystemBytes;
          }

          cursor.update(cursor.value);
          cursor.continue();
        };

        // Create object store for alarms.
        let alarmStore =
          aDb.createObjectStore(ALARM_STORE_NAME,
                                { keyPath: "id", autoIncrement: true });
        alarmStore.createIndex("alarm", ['networkId','threshold']);
        alarmStore.createIndex("manifestURL", "manifestURL");

        if (DEBUG) {
          debug("Created alarms store for version 5");
        }
      } else if (currVersion == 5) {
        // In contrast to "per-app" traffic data, "system-only" traffic data
        // refers to data which can not be identified by any applications.
        // To further support "system-only" data storage, the data can be
        // saved by service type (e.g., Tethering, OTA). Thus it's needed to
        // have a new key ("serviceType") for the ojectStore.
        let networkStore =
          aDb.createObjectStore(NETWORK_STORE_NAME,
                                { keyPath: ["appId", "serviceType", "network", "timestamp"] });
        networkStore.createIndex("network", "network");

        // Copy the data from the original objectStore to the new objectStore.
        let deprecatedNetworkStore1 =
          aTransaction.objectStore(DEPRECATED_NETWORK_STORE_NAME1);
        deprecatedNetworkStore1.openCursor().onsuccess = function(event) {
          let cursor = event.target.result;
          if (!cursor) {
            aDb.deleteObjectStore(DEPRECATED_NETWORK_STORE_NAME1);
            return;
          }

          let newStats = cursor.value;
          newStats.serviceType = "";
          networkStore.put(newStats);
          cursor.continue();
        };

        if (DEBUG) {
          debug("Added new key 'serviceType' for version 6");
        }
      } else if (currVersion == 6) {
        // Replace threshold attribute of alarm index by relativeThreshold in alarms DB.
        // Now alarms are indexed by relativeThreshold, which is the threshold relative
        // to current system stats.
        let alarmStore = aTransaction.objectStore(ALARM_STORE_NAME);

        // Delete "alarm" index.
        if (alarmStore.indexNames.contains("alarm")) {
          alarmStore.deleteIndex("alarm");
        }

        // Create new "alarm" index.
        alarmStore.createIndex("alarm", ['networkId','relativeThreshold']);

        // Populate new "alarm" index attributes.
        alarmStore.openCursor().onsuccess = function(event) {
          let cursor = event.target.result;
          if (!cursor) {
            return;
          }

          cursor.value.relativeThreshold = cursor.value.threshold;
          cursor.value.absoluteThreshold = cursor.value.threshold;
          delete cursor.value.threshold;

          cursor.update(cursor.value);
          cursor.continue();
        }

        // Previous versions save accumulative totalBytes, increasing althought the system
        // reboots or resets stats. But is necessary to reset the total counters when reset
        // through 'clearInterfaceStats'.
        let networkStore = aTransaction.objectStore(NETWORK_STORE_NAME);
        let networks = [];
        // Find networks stored in the database.
        networkStore.index("network").openKeyCursor(null, "nextunique").onsuccess = function(event) {
          let cursor = event.target.result;
          if (cursor) {
            networks.push(cursor.key);
            cursor.continue();
            return;
          }

          networks.forEach(function(network) {
            let lowerFilter = [0, "", network, 0];
            let upperFilter = [0, "", network, ""];
            let range = IDBKeyRange.bound(lowerFilter, upperFilter, false, false);

            // Find number of samples for a given network.
            networkStore.count(range).onsuccess = function(event) {
              // If there are more samples than the max allowed, there is no way to know
              // when does reset take place.
              if (event.target.result >= VALUES_MAX_LENGTH) {
                return;
              }

              let last = null;
              // Reset detected if the first sample totalCounters are different than bytes
              // counters. If so, the total counters should be recalculated.
              networkStore.openCursor(range).onsuccess = function(event) {
                let cursor = event.target.result;
                if (!cursor) {
                  return;
                }
                if (!last) {
                  if (cursor.value.rxTotalBytes == cursor.value.rxBytes &&
                      cursor.value.txTotalBytes == cursor.value.txBytes) {
                    return;
                  }

                  cursor.value.rxTotalBytes = cursor.value.rxBytes;
                  cursor.value.txTotalBytes = cursor.value.txBytes;
                  cursor.update(cursor.value);
                  last = cursor.value;
                  cursor.continue();
                  return;
                }

                // Recalculate the total counter for last / current sample
                cursor.value.rxTotalBytes = last.rxTotalBytes + cursor.value.rxBytes;
                cursor.value.txTotalBytes = last.txTotalBytes + cursor.value.txBytes;
                cursor.update(cursor.value);
                last = cursor.value;
                cursor.continue();
              }
            }
          }, this);
        };
      } else if (currVersion == 7) {
        // Create index for 'ServiceType' in order to make it retrievable.
        let networkStore = aTransaction.objectStore(NETWORK_STORE_NAME);
        networkStore.createIndex("serviceType", "serviceType");

        if (DEBUG) {
          debug("Create index of 'serviceType' for version 8");
        }
      }
    }
  },

  _importData: function(aStats) {
    let stats = { appId:         aStats.appId,
                  serviceType:   aStats.serviceType,
                  network:       [aStats.networkId, aStats.networkType],
                  timestamp:     aStats.timestamp,
                  rxBytes:       aStats.rxBytes,
                  txBytes:       aStats.txBytes,
                  rxSystemBytes: aStats.rxSystemBytes,
                  txSystemBytes: aStats.txSystemBytes,
                  rxTotalBytes:  aStats.rxTotalBytes,
                  txTotalBytes:  aStats.txTotalBytes };

    return stats;
  },

  normalizeDate: function(aDate) {
    // Convert to UTC according to timezone and
    // filter timestamp to get SAMPLE_RATE precission
    let timestamp = aDate.getTime() - aDate.getTimezoneOffset() * 60 * 1000;
    timestamp = Math.floor(timestamp / SAMPLE_RATE) * SAMPLE_RATE;
    return timestamp;
  },

  saveStats: function(aStats, aResultCb) {
    let isAccumulative = aStats.isAccumulative;
    let timestamp = this.normalizeDate(aStats.date);

    let stats = { appId:         aStats.appId,
                  serviceType:   aStats.serviceType,
                  networkId:     aStats.networkId,
                  networkType:   aStats.networkType,
                  timestamp:     timestamp,
                  rxBytes:       (isAccumulative) ? 0 : aStats.rxBytes,
                  txBytes:       (isAccumulative) ? 0 : aStats.txBytes,
                  rxSystemBytes: (isAccumulative) ? aStats.rxBytes : 0,
                  txSystemBytes: (isAccumulative) ? aStats.txBytes : 0,
                  rxTotalBytes:  (isAccumulative) ? aStats.rxBytes : 0,
                  txTotalBytes:  (isAccumulative) ? aStats.txBytes : 0 };

    stats = this._importData(stats);

    this._dbNewTxn(NETWORK_STORE_NAME, "readwrite",
                   function(aTransaction, aNetworkStore) {
      if (DEBUG) {
        debug("Filtered time: " + new Date(timestamp));
        debug("New stats: " + JSON.stringify(stats));
      }

      let lowerFilter = [stats.appId, stats.serviceType, stats.network, 0];
      let upperFilter = [stats.appId, stats.serviceType, stats.network, ""];
      let range = IDBKeyRange.bound(lowerFilter, upperFilter, false, false);

      let request = aNetworkStore.openCursor(range, 'prev');
      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (!cursor) {
          // Empty, so save first element.

          // There could be a time delay between the point when the network
          // interface comes up and the point when the database is initialized.
          // In this short interval some traffic data are generated but are not
          // registered by the first sample.
          if (isAccumulative) {
            stats.rxBytes = stats.rxTotalBytes;
            stats.txBytes = stats.txTotalBytes;
          }

          this._saveStats(aNetworkStore, stats);
          return;
        }

        // There are old samples
        if (DEBUG) {
          debug("Last value " + JSON.stringify(cursor.value));
        }

        // Remove stats previous to now - VALUE_MAX_LENGTH
        this._removeOldStats(aNetworkStore, stats.appId, stats.serviceType,
                             stats.network, stats.timestamp);

        // Process stats before save
        this._processSamplesDiff(aNetworkStore, cursor, stats, isAccumulative);
      }.bind(this);
    }.bind(this), aResultCb);
  },

  /*
   * This function check that stats are saved in the database following the sample rate.
   * In this way is easier to find elements when stats are requested.
   */
  _processSamplesDiff: function(aNetworkStore, aLastSampleCursor, aNewSample,
                                aIsAccumulative) {
    let lastSample = aLastSampleCursor.value;

    // Get difference between last and new sample.
    let diff = (aNewSample.timestamp - lastSample.timestamp) / SAMPLE_RATE;
    if (diff % 1) {
      // diff is decimal, so some error happened because samples are stored as a multiple
      // of SAMPLE_RATE
      throw new Error("Error processing samples");
    }

    if (DEBUG) {
      debug("New: " + aNewSample.timestamp + " - Last: " +
            lastSample.timestamp + " - diff: " + diff);
    }

    // If the incoming data has a accumulation feature, the new
    // |txBytes|/|rxBytes| is assigend by differnces between the new
    // |txTotalBytes|/|rxTotalBytes| and the last |txTotalBytes|/|rxTotalBytes|.
    // Else, if incoming data is non-accumulative, the |txBytes|/|rxBytes|
    // is the new |txBytes|/|rxBytes|.
    let rxDiff = 0;
    let txDiff = 0;
    if (aIsAccumulative) {
      rxDiff = aNewSample.rxSystemBytes - lastSample.rxSystemBytes;
      txDiff = aNewSample.txSystemBytes - lastSample.txSystemBytes;
      if (rxDiff < 0 || txDiff < 0) {
        rxDiff = aNewSample.rxSystemBytes;
        txDiff = aNewSample.txSystemBytes;
      }
      aNewSample.rxBytes = rxDiff;
      aNewSample.txBytes = txDiff;

      aNewSample.rxTotalBytes = lastSample.rxTotalBytes + rxDiff;
      aNewSample.txTotalBytes = lastSample.txTotalBytes + txDiff;
    } else {
      rxDiff = aNewSample.rxBytes;
      txDiff = aNewSample.txBytes;
    }

    if (diff == 1) {
      // New element.

      // If the incoming data is non-accumulative, the new
      // |rxTotalBytes|/|txTotalBytes| needs to be updated by adding new
      // |rxBytes|/|txBytes| to the last |rxTotalBytes|/|txTotalBytes|.
      if (!aIsAccumulative) {
        aNewSample.rxTotalBytes = aNewSample.rxBytes + lastSample.rxTotalBytes;
        aNewSample.txTotalBytes = aNewSample.txBytes + lastSample.txTotalBytes;
      }

      this._saveStats(aNetworkStore, aNewSample);
      return;
    }
    if (diff > 1) {
      // Some samples lost. Device off during one or more samplerate periods.
      // Time or timezone changed
      // Add lost samples with 0 bytes and the actual one.
      if (diff > VALUES_MAX_LENGTH) {
        diff = VALUES_MAX_LENGTH;
      }

      let data = [];
      for (let i = diff - 2; i >= 0; i--) {
        let time = aNewSample.timestamp - SAMPLE_RATE * (i + 1);
        let sample = { appId:         aNewSample.appId,
                       serviceType:   aNewSample.serviceType,
                       network:       aNewSample.network,
                       timestamp:     time,
                       rxBytes:       0,
                       txBytes:       0,
                       rxSystemBytes: lastSample.rxSystemBytes,
                       txSystemBytes: lastSample.txSystemBytes,
                       rxTotalBytes:  lastSample.rxTotalBytes,
                       txTotalBytes:  lastSample.txTotalBytes };

        data.push(sample);
      }

      data.push(aNewSample);
      this._saveStats(aNetworkStore, data);
      return;
    }
    if (diff == 0 || diff < 0) {
      // New element received before samplerate period. It means that device has
      // been restarted (or clock / timezone change).
      // Update element. If diff < 0, clock or timezone changed back. Place data
      // in the last sample.

      // Old |rxTotalBytes|/|txTotalBytes| needs to get updated by adding the
      // last |rxTotalBytes|/|txTotalBytes|.
      lastSample.rxBytes += rxDiff;
      lastSample.txBytes += txDiff;
      lastSample.rxSystemBytes = aNewSample.rxSystemBytes;
      lastSample.txSystemBytes = aNewSample.txSystemBytes;
      lastSample.rxTotalBytes += rxDiff;
      lastSample.txTotalBytes += txDiff;

      if (DEBUG) {
        debug("Update: " + JSON.stringify(lastSample));
      }
      let req = aLastSampleCursor.update(lastSample);
    }
  },

  _saveStats: function(aNetworkStore, aNetworkStats) {
    if (DEBUG) {
      debug("_saveStats: " + JSON.stringify(aNetworkStats));
    }

    if (Array.isArray(aNetworkStats)) {
      let len = aNetworkStats.length - 1;
      for (let i = 0; i <= len; i++) {
        aNetworkStore.put(aNetworkStats[i]);
      }
    } else {
      aNetworkStore.put(aNetworkStats);
    }
  },

  _removeOldStats: function(aNetworkStore, aAppId, aServiceType, aNetwork,
                            aTimestamp) {
    // Callback function to remove old items when new ones are added.
    let filterTimestamp = aTimestamp - (SAMPLE_RATE * VALUES_MAX_LENGTH - 1);
    let lowerFilter = [aAppId, aServiceType, aNetwork, 0];
    let upperFilter = [aAppId, aServiceType, aNetwork, filterTimestamp];
    let range = IDBKeyRange.bound(lowerFilter, upperFilter, false, false);
    let lastSample = null;
    let self = this;

    aNetworkStore.openCursor(range).onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        lastSample = cursor.value;
        cursor.delete();
        cursor.continue();
        return;
      }

      // If all samples for a network are removed, an empty sample
      // has to be saved to keep the totalBytes in order to compute
      // future samples because system counters are not set to 0.
      // Thus, if there are no samples left, the last sample removed
      // will be saved again after setting its bytes to 0.
      let request = aNetworkStore.index("network").openCursor(aNetwork);
      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (!cursor && lastSample != null) {
          lastSample.timestamp = self.normalizeDate(new Date());
          lastSample.rxBytes = 0;
          lastSample.txBytes = 0;
          self._saveStats(aNetworkStore, lastSample);
        }
      };
    };
  },

  clearInterfaceStats: function(aNetwork, aResultCb) {
    let self = this;

    // Clear and save an empty sample to keep sync with system counters
    this._dbNewTxn(NETWORK_STORE_NAME, "readwrite",
                   function(aTransaction, aNetworkStore) {
      let sample = null;
      let request = aNetworkStore.index("network").openCursor(aNetwork, "prev");
      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor) {
          if (!sample && cursor.value.appId == 0) {
            sample = cursor.value;
          }

          cursor.delete();
          cursor.continue();
          return;
        }

        if (sample) {
          sample.timestamp = self.normalizeDate(new Date());
          sample.appId = 0;
          sample.serviceType = "";
          sample.rxBytes = 0;
          sample.txBytes = 0;
          sample.rxTotalBytes = 0;
          sample.txTotalBytes = 0;

          self._saveStats(aNetworkStore, sample);
        }
      };
    }, this._resetAlarms.bind(this, aNetwork.id + '' + aNetwork.type, aResultCb));
  },

  clearStats: function(aNetworks, aResultCb) {
    let index = 0;
    let stats = [];
    let self = this;

    let callback = function(aError, aUndefined) {
      index++;

      if (!aError && index < aNetworks.length) {
        self.clearInterfaceStats(aNetworks[index], callback);
        return;
      }

      aResultCb(aError, null);
    };

    if (!aNetworks[index]) {
      aResultCb(null, true);
      return;
    }
    this.clearInterfaceStats(aNetworks[index], callback);
  },

  getCurrentStats: function(aNetwork, aTimestamp, aResultCb) {
    if (DEBUG) {
      debug("Get current stats for " + JSON.stringify(aNetwork) +
            " since " + aTimestamp);
    }

    let network = [aNetwork.id, aNetwork.type];
    if (aTimestamp) {
      this._getCurrentStatsFromTimestamp(network, aTimestamp, aResultCb);
      return;
    }

    this._getCurrentStats(network, aResultCb);
  },

  _getCurrentStats: function(aNetwork, aResultCb) {
    this._dbNewTxn(NETWORK_STORE_NAME, "readonly",
                   function(aTransaction, aNetworkStore) {
      let request = null;
      let upperFilter = [0, "", aNetwork, Date.now()];
      let range = IDBKeyRange.upperBound(upperFilter, false);
      request = aNetworkStore.openCursor(range, "prev");

      let result = { rxBytes:      0, txBytes:      0,
                     rxTotalBytes: 0, txTotalBytes: 0 };

      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor) {
          result.rxBytes = result.rxTotalBytes = cursor.value.rxTotalBytes;
          result.txBytes = result.txTotalBytes = cursor.value.txTotalBytes;
        }

        aTransaction.result = result;
      };
    }.bind(this), aResultCb);
  },

  _getCurrentStatsFromTimestamp: function(aNetwork, aTimestamp, aResultCb) {
    this._dbNewTxn(NETWORK_STORE_NAME, "readonly",
                   function(aTransaction, aNetworkStore) {
      let request = null;
      let startTimestamp = this.normalizeDate(new Date(aTimestamp));
      let lowerFilter = [0, "", aNetwork, startTimestamp];
      let upperFilter = [0, "", aNetwork, Date.now()];

      let range = IDBKeyRange.upperBound(upperFilter, false);

      let result = { rxBytes:      0, txBytes:      0,
                     rxTotalBytes: 0, txTotalBytes: 0 };

      request = aNetworkStore.openCursor(range, "prev");

      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor) {
          result.rxBytes = result.rxTotalBytes = cursor.value.rxTotalBytes;
          result.txBytes = result.txTotalBytes = cursor.value.txTotalBytes;
        }

        let timestamp = cursor.value.timestamp;
        let range = IDBKeyRange.lowerBound(lowerFilter, false);
        request = aNetworkStore.openCursor(range);

        request.onsuccess = function(event) {
          let cursor = event.target.result;
          if (cursor) {
            if (cursor.value.timestamp == timestamp) {
              // There is one sample only.
              result.rxBytes = cursor.value.rxBytes;
              result.txBytes = cursor.value.txBytes;
            } else {
              result.rxBytes -= cursor.value.rxTotalBytes;
              result.txBytes -= cursor.value.txTotalBytes;
            }
          }

          aTransaction.result = result;
        };
      };
    }.bind(this), aResultCb);
  },

  find: function(aResultCb, aAppId, aServiceType, aNetwork, aStartDate, aEndDate,
                 aManifestURL) {
    let offset = (new Date()).getTimezoneOffset() * 60 * 1000;
    let startTimestamp = this.normalizeDate(aStartDate);
    let endTimestamp = this.normalizeDate(aEndDate);

    if (DEBUG) {
      debug("Find samples for appId: " + aAppId + " serviceType: " +
            aServiceType + " network: " + JSON.stringify(aNetwork) + " from " +
            startTimestamp + " until " + endTimestamp);
      debug("Start time: " + new Date(startTimestamp));
      debug("End time: " + new Date(endTimestamp));
    }

    this._dbNewTxn(NETWORK_STORE_NAME, "readonly",
                   function(aTransaction, aNetworkStore) {
      let network = [aNetwork.id, aNetwork.type];
      let lowerFilter = [aAppId, aServiceType, network, startTimestamp];
      let upperFilter = [aAppId, aServiceType, network, endTimestamp];
      let range = IDBKeyRange.bound(lowerFilter, upperFilter, false, false);

      let data = [];
      let request = aNetworkStore.openCursor(range).onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor){
          data.push({ rxBytes: cursor.value.rxBytes,
                      txBytes: cursor.value.txBytes,
                      timestamp: (cursor.value.timestamp + offset) });
          cursor.continue();
          return;
        }

        // When requested samples (start / end) are not in the range of now and
        // now - VALUES_MAX_LENGTH, fill with empty samples.
        this._fillResultSamples(startTimestamp + offset,
                                endTimestamp + offset, data);

        aTransaction.result = data;
      }.bind(this);
    }.bind(this), aResultCb);
  },

  /*
   * Fill data array (samples from database) with empty samples to match
   * requested start / end dates.
   */
  _fillResultSamples: function(aStartTimestamp, aEndTimestamp, aData) {
    if (aData.length == 0) {
      aData.push({ rxBytes: undefined,
                   txBytes: undefined,
                   timestamp: aStartTimestamp });
    }

    while (aStartTimestamp < aData[0].timestamp) {
      aData.unshift({ rxBytes: undefined,
                      txBytes: undefined,
                      timestamp: (aData[0].timestamp - SAMPLE_RATE) });
    }

    while (aEndTimestamp > aData[aData.length - 1].timestamp) {
      aData.push({ rxBytes: undefined,
                   txBytes: undefined,
                   timestamp: (aData[aData.length - 1].timestamp + SAMPLE_RATE) });
    }
  },

  getAvailableNetworks: function(aResultCb) {
    this._dbNewTxn(NETWORK_STORE_NAME, "readonly",
                   function(aTransaction, aNetworkStore) {
      if (!aTransaction.result) {
        aTransaction.result = [];
      }

      let request = aNetworkStore.index("network").openKeyCursor(null, "nextunique");
      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor) {
          aTransaction.result.push({ id: cursor.key[0],
                                     type: cursor.key[1] });
          cursor.continue();
          return;
        }
      };
    }, aResultCb);
  },

  isNetworkAvailable: function(aNetwork, aResultCb) {
    this._dbNewTxn(NETWORK_STORE_NAME, "readonly",
                   function(aTransaction, aNetworkStore) {
      if (!aTransaction.result) {
        aTransaction.result = false;
      }

      let network = [aNetwork.id, aNetwork.type];
      let request = aNetworkStore.index("network").openKeyCursor(IDBKeyRange.only(network));
      request.onsuccess = function(event) {
        if (event.target.result) {
          aTransaction.result = true;
        }
      };
    }, aResultCb);
  },

  getAvailableServiceTypes: function(aResultCb) {
    this._dbNewTxn(NETWORK_STORE_NAME, "readonly",
                   function(aTransaction, aNetworkStore) {
      if (!aTransaction.result) {
        aTransaction.result = [];
      }

      let request = aNetworkStore.index("serviceType").openKeyCursor(null, "nextunique");
      request.onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor && cursor.key != "") {
          aTransaction.result.push({ serviceType: cursor.key });
          cursor.continue();
          return;
        }
      };
    }, aResultCb);
  },

  get sampleRate () {
    return SAMPLE_RATE;
  },

  get maxStorageSamples () {
    return VALUES_MAX_LENGTH;
  },

  logAllRecords: function(aResultCb) {
    this._dbNewTxn(NETWORK_STORE_NAME, "readonly",
                   function(aTransaction, aNetworkStore) {
      aNetworkStore.mozGetAll().onsuccess = function(event) {
        aTransaction.result = event.target.result;
      };
    }, aResultCb);
  },

  addAlarm: function(aAlarmRecord, aResultCb) {
    this._dbNewTxn(ALARM_STORE_NAME, "readwrite",
                   function(aTransaction, aAlarmStore) {
      if (DEBUG) {
        debug("Going to add " + JSON.stringify(aAlarmRecord));
      }

      aAlarmStore.put(aAlarmRecord).onsuccess = function(aEvent) {
        aTransaction.result = aEvent.target.result;
        if (DEBUG) {
          debug("Request successful. New record ID: " + aTransaction.result);
        }
      };
    }.bind(this), aResultCb);
  },

  getFirstAlarm: function(aNetworkId, aResultCb) {
    this._dbNewTxn(ALARM_STORE_NAME, "readonly",
                   function(aTransaction, aAlarmStore) {
      if (DEBUG) {
        debug("Get first alarm for network " + aNetworkId);
      }

      let lowerFilter = [aNetworkId, 0];
      let upperFilter = [aNetworkId, ""];
      let range = IDBKeyRange.bound(lowerFilter, upperFilter);

      aAlarmStore.index("alarm").openCursor(range).onsuccess = function(event) {
        let cursor = event.target.result;
        aTransaction.result = null;
        if (cursor) {
          aTransaction.result = cursor.value;
        }
      };
    }, aResultCb);
  },

  removeAlarm: function(aAlarmId, aManifestURL, aResultCb) {
    this._dbNewTxn(ALARM_STORE_NAME, "readwrite",
                   function(aTransaction, aAlarmStore) {
      if (DEBUG) {
        debug("Remove alarm " + aAlarmId);
      }

      aAlarmStore.get(aAlarmId).onsuccess = function(event) {
        let alarmRecord = event.target.result;
        aTransaction.result = false;
        if (!alarmRecord ||
            (aManifestURL && alarmRecord.manifestURL != aManifestURL)) {
          return;
        }

        aAlarmStore.delete(aAlarmId);
        aTransaction.result = true;
      }
    }, aResultCb);
  },

  removeAlarms: function(aManifestURL, aResultCb) {
    this._dbNewTxn(ALARM_STORE_NAME, "readwrite",
                   function(aTransaction, aAlarmStore) {
      if (DEBUG) {
        debug("Remove alarms of " + aManifestURL);
      }

      aAlarmStore.index("manifestURL").openCursor(aManifestURL)
                                      .onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      }
    }, aResultCb);
  },

  getAlarms: function(aNetworkId, aManifestURL, aResultCb) {
    this._dbNewTxn(ALARM_STORE_NAME, "readonly",
                   function(aTransaction, aAlarmStore) {
      if (DEBUG) {
        debug("Get alarms for " + aManifestURL);
      }

      aTransaction.result = [];
      aAlarmStore.index("manifestURL").openCursor(aManifestURL)
                                      .onsuccess = function(event) {
        let cursor = event.target.result;
        if (!cursor) {
          return;
        }

        if (!aNetworkId || cursor.value.networkId == aNetworkId) {
          aTransaction.result.push(cursor.value);
        }

        cursor.continue();
      }
    }, aResultCb);
  },

  _resetAlarms: function(aNetworkId, aResultCb) {
    this._dbNewTxn(ALARM_STORE_NAME, "readwrite",
                   function(aTransaction, aAlarmStore) {
      if (DEBUG) {
        debug("Reset alarms for network " + aNetworkId);
      }

      let lowerFilter = [aNetworkId, 0];
      let upperFilter = [aNetworkId, ""];
      let range = IDBKeyRange.bound(lowerFilter, upperFilter);

      aAlarmStore.index("alarm").openCursor(range).onsuccess = function(event) {
        let cursor = event.target.result;
        if (cursor) {
          if (cursor.value.startTime) {
            cursor.value.relativeThreshold = cursor.value.threshold;
            cursor.update(cursor.value);
          }
          cursor.continue();
          return;
        }
      };
    }, aResultCb);
  }
};
