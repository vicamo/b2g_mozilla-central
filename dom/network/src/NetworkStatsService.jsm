/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const DEBUG = false;
function debug(s) {
  if (DEBUG) {
    dump("-*- NetworkStatsService: " + s + "\n");
  }
}

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

this.EXPORTED_SYMBOLS = ["NetworkStatsService"];

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/NetworkStatsDB.jsm");

const TOPIC_BANDWIDTH_CONTROL = "netd-bandwidth-control"

const TOPIC_INTERFACE_REGISTERED   = "network-interface-registered";
const TOPIC_INTERFACE_UNREGISTERED = "network-interface-unregistered";
const NET_TYPE_WIFI = Ci.nsINetworkInterface.NETWORK_TYPE_WIFI;
const NET_TYPE_MOBILE = Ci.nsINetworkInterface.NETWORK_TYPE_MOBILE;

// Networks have different status that NetworkStats API needs to be aware of.
// Network is present and ready, so NetworkManager provides the whole info.
const NETWORK_STATUS_READY   = 0;
// Network is present but hasn't established a connection yet (e.g. SIM that has not
// enabled 3G since boot).
const NETWORK_STATUS_STANDBY = 1;
// Network is not present, but stored in database by the previous connections.
const NETWORK_STATUS_AWAY    = 2;

// The maximum traffic amount can be saved in the |_cachedStats|.
const MAX_CACHED_TRAFFIC = 500 * 1000 * 1000; // 500 MB

const QUEUE_TYPE_UPDATE_STATS = 0;
const QUEUE_TYPE_UPDATE_CACHE = 1;
const QUEUE_TYPE_WRITE_CACHE = 2;

XPCOMUtils.defineLazyServiceGetter(this, "ppmm",
                                   "@mozilla.org/parentprocessmessagemanager;1",
                                   "nsIMessageListenerManager");

XPCOMUtils.defineLazyServiceGetter(this, "gRil",
                                   "@mozilla.org/ril;1",
                                   "nsIRadioInterfaceLayer");

XPCOMUtils.defineLazyServiceGetter(this, "networkService",
                                   "@mozilla.org/network/service;1",
                                   "nsINetworkService");

XPCOMUtils.defineLazyServiceGetter(this, "appsService",
                                   "@mozilla.org/AppsService;1",
                                   "nsIAppsService");

XPCOMUtils.defineLazyServiceGetter(this, "gSettingsService",
                                   "@mozilla.org/settingsService;1",
                                   "nsISettingsService");

XPCOMUtils.defineLazyServiceGetter(this, "messenger",
                                   "@mozilla.org/system-message-internal;1",
                                   "nsISystemMessagesInternal");

this.NetworkStatsService = {
  init: function() {
    debug("Service started");

    Services.obs.addObserver(this, "xpcom-shutdown", false);
    Services.obs.addObserver(this, TOPIC_INTERFACE_REGISTERED, false);
    Services.obs.addObserver(this, TOPIC_INTERFACE_UNREGISTERED, false);
    Services.obs.addObserver(this, TOPIC_BANDWIDTH_CONTROL, false);
    Services.obs.addObserver(this, "profile-after-change", false);

    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

    // Object to store network interfaces, each network interface is composed
    // by a network object (network type and network Id) and a interfaceName
    // that contains the name of the physical interface (wlan0, rmnet0, etc.).
    // The network type can be 0 for wifi or 1 for mobile. On the other hand,
    // the network id is '0' for wifi or the iccid for mobile (SIM).
    // Each networkInterface is placed in the _networks object by the index of
    // 'networkId + networkType'.
    //
    // _networks object allows to map available network interfaces at low level
    // (wlan0, rmnet0, etc.) to a network. It's not mandatory to have a
    // networkInterface per network but can't exist a networkInterface not
    // being mapped to a network.

    this._networks = {};

    // There is no way to know a priori if wifi connection is available,
    // just when the wifi driver is loaded, but it is unloaded when
    // wifi is switched off. So wifi connection is hardcoded
    let networkId = this._getNetworkId('0', NET_TYPE_WIFI);
    this._networks[networkId] = {
      network: {
        id: '0',
        type: NET_TYPE_WIFI
      },
      interfaceName: null,
      status: NETWORK_STATUS_STANDBY
    };

    this._messages = ["NetworkStats:Get",
                      "NetworkStats:Clear",
                      "NetworkStats:ClearAll",
                      "NetworkStats:SetAlarm",
                      "NetworkStats:GetAlarms",
                      "NetworkStats:RemoveAlarms",
                      "NetworkStats:GetAvailableNetworks",
                      "NetworkStats:GetAvailableServiceTypes",
                      "NetworkStats:SampleRate",
                      "NetworkStats:MaxStorageAge"];

    this._messages.forEach(function(aMsgName) {
      ppmm.addMessageListener(aMsgName, this);
    }, this);

    this._db = new NetworkStatsDB();

    // Stats for all interfaces are updated periodically
    this._timer.initWithCallback(this, this._db.sampleRate,
                                Ci.nsITimer.TYPE_REPEATING_PRECISE);

    // Stats not from netd are firstly stored in the cached.
    this._cachedStats = {};
    this._cachedStatsDate = new Date();

    this._updateQueue = [];
    this._isQueueRunning = false;

    this._currentAlarms = {};
    this._initAlarms();
  },

  receiveMessage: function(aMessage) {
    if (!aMessage.target.assertPermission("networkstats-manage")) {
      return;
    }

    debug("receiveMessage " + aMessage.name);

    let target = aMessage.target;
    let json = aMessage.json;

    switch (aMessage.name) {
      case "NetworkStats:Get":
        this.getSamples(target, json);
        break;
      case "NetworkStats:Clear":
        this.clearInterfaceStats(target, json);
        break;
      case "NetworkStats:ClearAll":
        this.clearDB(target, json);
        break;
      case "NetworkStats:SetAlarm":
        this.setAlarm(target, json);
        break;
      case "NetworkStats:GetAlarms":
        this.getAlarms(target, json);
        break;
      case "NetworkStats:RemoveAlarms":
        this.removeAlarms(target, json);
        break;
      case "NetworkStats:GetAvailableNetworks":
        this.getAvailableNetworks(target, json);
        break;
      case "NetworkStats:GetAvailableServiceTypes":
        this.getAvailableServiceTypes(target, json);
        break;
      case "NetworkStats:SampleRate":
        // This message is sync.
        return this._db.sampleRate;
      case "NetworkStats:MaxStorageAge":
        // This message is sync.
        return this._db.maxStorageSamples * this._db.sampleRate;
    }
  },

  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case TOPIC_INTERFACE_REGISTERED:
      case TOPIC_INTERFACE_UNREGISTERED:

        // If new interface is registered (notified from NetworkService),
        // the stats are updated for the new interface without waiting to
        // complete the updating period.

        let networkInterface = aSubject.QueryInterface(Ci.nsINetworkInterface);
        debug("Network " + networkInterface.name + " of type " +
              networkInterface.type + " status change");

        let networkId = this._convertNetworkInterface(networkInterface);
        if (!networkId) {
          break;
        }

        this._updateCurrentAlarm(networkId);

        debug("NetworkId: " + networkId);
        this._updateStats(networkId);
        break;

      case TOPIC_BANDWIDTH_CONTROL:
        debug("Bandwidth message from netd: " + JSON.stringify(aData));

        let interfaceName = aData.substring(aData.lastIndexOf(" ") + 1);
        for (let networkId in this._networks) {
          if (interfaceName == this._networks[networkId].interfaceName) {
            let currentAlarm = this._currentAlarms[networkId];
            if (Object.getOwnPropertyNames(currentAlarm).length !== 0) {
              this._fireAlarm(currentAlarm.alarm);
            }
            break;
          }
        }
        break;

      case "xpcom-shutdown":
        debug("Service shutdown");

        this._messages.forEach(function(aMsgName) {
          ppmm.removeMessageListener(aMsgName, this);
        }, this);

        Services.obs.removeObserver(this, "xpcom-shutdown");
        Services.obs.removeObserver(this, "profile-after-change");
        Services.obs.removeObserver(this, TOPIC_INTERFACE_REGISTERED);
        Services.obs.removeObserver(this, TOPIC_INTERFACE_UNREGISTERED);
        Services.obs.removeObserver(this, TOPIC_BANDWIDTH_CONTROL);

        this._timer.cancel();
        this._timer = null;

        // Update stats before shutdown
        this._updateAllStats();
        break;
    }
  },

  /*
   * nsITimerCallback
   * Timer triggers the update of all stats
   */
  notify: function(aTimer) {
    this._updateAllStats();
  },

  /*
   * nsINetworkStatsService
   */
  _getRilNetworks: function() {
    let networks = {};
    let numRadioInterfaces = gRil.numRadioInterfaces;
    for (let i = 0; i < numRadioInterfaces; i++) {
      let radioInterface = gRil.getRadioInterface(i);
      if (radioInterface.rilContext.iccInfo) {
        let networkId =
          this._getNetworkId(radioInterface.rilContext.iccInfo.iccid,
                             NET_TYPE_MOBILE);
        networks[networkId] = {
          id: radioInterface.rilContext.iccInfo.iccid,
          type: NET_TYPE_MOBILE
        };
      }
    }
    return networks;
  },

  _convertNetworkInterface: function(aNetworkInterface) {
    if (aNetworkInterface.type != NET_TYPE_MOBILE &&
        aNetworkInterface.type != NET_TYPE_WIFI) {
      return null;
    }

    let id = '0';
    if (aNetworkInterface.type == NET_TYPE_MOBILE) {
      if (!(aNetworkInterface instanceof Ci.nsIRilNetworkInterface)) {
        debug("Error! Mobile network should be an nsIRilNetworkInterface!");
        return null;
      }

      let rilNetworkInterface =
        aNetworkInterface.QueryInterface(Ci.nsIRilNetworkInterface);
      id = rilNetworkInterface.iccId;
    }

    let networkId = this._getNetworkId(id, aNetworkInterface.type);

    if (!this._networks[networkId]) {
      this._networks[networkId] = {
        network: {
          id: id,
          type: aNetworkInterface.type
        }
      };
    }

    this._networks[networkId].status = NETWORK_STATUS_READY;
    this._networks[networkId].interfaceName = aNetworkInterface.name;
    return networkId;
  },

  _getNetworkId: function(aIccId, aNetworkType) {
    return aIccId + '' + aNetworkType;
  },

  /* Function to ensure that one network is valid. The network is valid if its status is
   * NETWORK_STATUS_READY, NETWORK_STATUS_STANDBY or NETWORK_STATUS_AWAY.
   *
   * The result is |networkId| or null in case of a non-valid network
   * aCallback is signatured as |function(networkId)|.
   */
  _validateNetwork: function(aNetwork, aCallback) {
    let networkId = this._getNetworkId(aNetwork.id, aNetwork.type);

    if (this._networks[networkId]) {
      aCallback(networkId);
      return;
    }

    // Check if network is valid (RIL entry) but has not established a connection yet.
    // If so add to networks list with empty interfaceName.
    let rilNetworks = this._getRilNetworks();
    if (rilNetworks[networkId]) {
      this._networks[networkId] = {
        network: rilNetworks[networkId],
        status: NETWORK_STATUS_STANDBY,
      };
      this._currentAlarms[networkId] = {};
      aCallback(networkId);
      return;
    }

    // Check if network is available in the DB.
    this._db.isNetworkAvailable(aNetwork, function(aError, aAvailable) {
      if (aAvailable) {
        this._networks[networkId] = {
          network: aNetwork,
          status: NETWORK_STATUS_AWAY,
        };
        this._currentAlarms[networkId] = {};
        aCallback(networkId);
        return;
      }

      aCallback(null);
    }.bind(this));
  },

  getAvailableNetworks: function(aMsgTarget, aMsgJson) {
    let self = this;
    let rilNetworks = this._getRilNetworks();
    this._db.getAvailableNetworks(function(aError, aNetworksArray) {

      // Also return the networks that are valid but have not
      // established connections yet.
      for (let networkId in rilNetworks) {
        let found = false;
        for (let i = 0; i < aNetworksArray.length; i++) {
          if (networkId == self._getNetworkId(aNetworksArray[i].id,
                                              aNetworksArray[i].type)) {
            found = true;
            break;
          }
        }
        if (!found) {
          aNetworksArray.push(rilNetworks[networkId]);
        }
      }

      aMsgTarget.sendAsyncMessage("NetworkStats:GetAvailableNetworks:Return", {
        id: aMsgJson.id,
        error: aError,
        result: aNetworksArray
      });
    });
  },

  getAvailableServiceTypes: function(aMsgTarget, aMsgJson) {
    this._db.getAvailableServiceTypes(function(aError, aServiceTypesArray) {
      aMsgTarget.sendAsyncMessage("NetworkStats:GetAvailableServiceTypes:Return", {
        id: aMsgJson.id,
        error: aError,
        result: aServiceTypesArray
      });
    });
  },

  _initAlarms: function() {
    debug("Init usage alarms");
    let self = this;

    for (let networkId in this._networks) {
      this._currentAlarms[networkId] = {};

      this._db.getFirstAlarm(networkId, function(aError, aAlarmRecord) {
        if (!aError && aAlarmRecord) {
          self._setAlarm(aAlarmRecord, function(aError) {
            if (aError == "InvalidStateError") {
              self._fireAlarm(aAlarmRecord);
            }
          });
        }
      });
    }
  },

  /*
   * Function called from manager to get stats from database.
   * In order to return updated stats, first is performed a call to
   * _updateAllStats function, which will get last stats from netd
   * and update the database.
   * Then, depending on the request (stats per appId or total stats)
   * it retrieve them from database and return to the manager.
   */
  getSamples: function(aMsgTarget, aMsgJson) {
    let network = aMsgJson.network;

    let appId = 0;
    let manifestURL = aMsgJson.manifestURL;
    if (manifestURL) {
      appId = appsService.getAppLocalIdByManifestURL(manifestURL);

      if (!appId) {
        aMsgTarget.sendAsyncMessage("NetworkStats:Get:Return", {
          id: aMsgJson.id,
          error: "Invalid appManifestURL",
          result: null
        });
        return;
      }
    }

    let serviceType = aMsgJson.serviceType || "";

    let startDate = new Date(aMsgJson.startTimestamp);
    let endDate = new Date(aMsgJson.endTimestamp);

    let callback = (function() {
      this._db.find(function(aError, aResult) {
        aMsgTarget.sendAsyncMessage("NetworkStats:Get:Return", {
          id: aMsgJson.id,
          error: aError,
          result: aResult
        });
      }, appId, serviceType, network, startDate, endDate, manifestURL);
    }).bind(this);

    this._validateNetwork(network, function(aNetworkId) {
      if (!aNetworkId) {
        aMsgTarget.sendAsyncMessage("NetworkStats:Get:Return", {
          id: aMsgJson.id,
          error: "Invalid connectionType",
          result: null
        });
        return;
      }

      // If network is currently active we need to update the cached stats first before
      // retrieving stats from the DB.
      if (this._networks[aNetworkId].status == NETWORK_STATUS_READY) {
        debug("getstats for network " + network.id + " of type " + network.type);
        debug("appId: " + appId + " from manifestURL: " + manifestURL);
        debug("serviceType: " + serviceType);

        if (appId || serviceType) {
          this._updateCachedStats(callback);
          return;
        }

        this._updateStats(aNetworkId, this._updateCachedStats.bind(this, callback));
        return;
      }

      // Network not active, so no need to update
      callback();
    }.bind(this));
  },

  clearInterfaceStats: function(aMsgTarget, aMsgJson) {
    let self = this;
    let network = aMsgJson.network;

    debug("clear stats for network " + network.id + " of type " + network.type);

    this._validateNetwork(network, function(aNetworkId) {
      if (!aNetworkId) {
        aMsgTarget.sendAsyncMessage("NetworkStats:Clear:Return", {
          id: aMsgJson.id,
          error: "Invalid connectionType",
          result: null
        });
        return;
      }

      self._updateStats(aNetworkId, function(aSuccess, aMessage) {
        if (!aSuccess) {
          aMsgTarget.sendAsyncMessage("NetworkStats:Clear:Return", {
            id: aMsgJson.id,
            error: aMessage,
            result: null
          });
          return;
        }

        self._db.clearInterfaceStats(network, function(aError, aUndefined) {
          self._updateCurrentAlarm(aNetworkId);
          aMsgTarget.sendAsyncMessage("NetworkStats:Clear:Return", {
            id: aMsgJson.id,
            error: aError,
            result: null
          });
        });
      });
    });
  },

  clearDB: function(aMsgTarget, aMsgJson) {
    let self = this;
    this._db.getAvailableNetworks(function(aError, aNetworksArray) {
      if (aError) {
        aMsgTarget.sendAsyncMessage("NetworkStats:ClearAll:Return", {
          id: aMsgJson.id,
          error: aError,
          result: aNetworksArray
        });
        return;
      }

      self._updateAllStats(function(aResult, aMessage) {
        if (!aResult) {
          aMsgTarget.sendAsyncMessage("NetworkStats:ClearAll:Return", {
            id: aMsgJson.id,
            error: aMessage,
            result: null
          });
          return;
        }

        self._db.clearStats(aNetworksArray, function(aError, aUndefined) {
          aNetworksArray.forEach(function(aNetwork) {
            self._updateCurrentAlarm(self._getNetworkId(aNetwork.id,
                                                        aNetwork.type));
          }, self);
          aMsgTarget.sendAsyncMessage("NetworkStats:ClearAll:Return", {
            id: aMsgJson.id,
            error: aError,
            result: null
          });
        });
      });
    });
  },

  _updateAllStats: function(aCallback) {
    let elements = [];
    let lastElement = null;
    let callback = this._updateCachedStats.bind(this, aCallback);

    // For each connectionType create an object containning the type
    // and the 'queueIndex', the 'queueIndex' is an integer representing
    // the index of a connection type in the global queue array. So, if
    // the connection type is already in the queue it is not appended again,
    // else it is pushed in 'elements' array, which later will be pushed to
    // the queue array.
    for (let networkId in this._networks) {
      if (this._networks[networkId].status != NETWORK_STATUS_READY) {
        continue;
      }

      lastElement = {
        networkId: networkId,
        queueIndex: this._updateQueueIndex(networkId)
      };

      if (lastElement.queueIndex == -1) {
        elements.push({
          networkId: lastElement.networkId,
          callbacks: [],
          queueType: QUEUE_TYPE_UPDATE_STATS
        });
      }
    }

    if (!lastElement) {
      // No elements need to be updated, probably because status is different than
      // NETWORK_STATUS_READY.
      if (aCallback) {
        aCallback(true, "OK");
      }
      return;
    }

    if (elements.length > 0) {
      // If length of elements is greater than 0, callback is set to
      // the last element.
      elements[elements.length - 1].callbacks.push(callback);
      this._updateQueue = this._updateQueue.concat(elements);
    } else {
      // Else, it means that all connection types are already in the queue to
      // be updated, so callback for this request is added to
      // the element in the main queue with the index of the last 'lastElement'.
      // But before is checked that element is still in the queue because it can
      // be processed while generating 'elements' array.
      let element = this._updateQueue[lastElement.queueIndex];
      if (aCallback &&
         (!element || element.networkId != lastElement.networkId)) {
        aCallback();
        return;
      }

      this._updateQueue[lastElement.queueIndex].callbacks.push(callback);
    }

    // Call the function that process the elements of the queue.
    this._processQueue();

    if (DEBUG) {
      this.logAllRecords();
    }
  },

  _updateStats: function(aNetworkId, aCallback) {
    // Check if the connection is in the main queue, push a new element
    // if it is not being processed or add a callback if it is.
    let index = this._updateQueueIndex(aNetworkId);
    if (index == -1) {
      this._updateQueue.push({
       networkId: aNetworkId,
       callbacks: [aCallback],
       queueType: QUEUE_TYPE_UPDATE_STATS
      });
    } else {
      this._updateQueue[index].callbacks.push(aCallback);
      return;
    }

    // Call the function that process the elements of the queue.
    this._processQueue();
  },

  /*
   * Find if a connection is in the main queue array and return its
   * index, if it is not in the array return -1.
   */
  _updateQueueIndex: function(aNetworkId) {
    return this._updateQueue.map(function(aElement) {
      return aElement.networkId;
    }).indexOf(aNetworkId);
  },

  /*
   * Function responsible of process all requests in the queue.
   */
  _processQueue: function(aResult, aMessage) {
    // If aResult is not undefined, the caller of the function is the result
    // of processing an element, so remove that element and call the callbacks
    // it has.
    if (aResult != undefined) {
      let item = this._updateQueue.shift();
      for (let callback of item.callbacks) {
        if (callback) {
          callback(aResult, aMessage);
        }
      }
    } else {
      // The caller is a function that has pushed new elements to the queue,
      // if _isQueueRunning is false it means there is no processing currently
      // being done, so start.
      if (this._isQueueRunning) {
        return;
      } else {
        this._isQueueRunning = true;
      }
    }

    // Check length to determine if queue is empty and stop processing.
    if (this._updateQueue.length < 1) {
      this._isQueueRunning = false;
      return;
    }

    // Call the update function for the next element.
    switch (this._updateQueue[0].queueType) {
      case QUEUE_TYPE_UPDATE_STATS:
        this._update(this._updateQueue[0].networkId,
                     this._processQueue.bind(this));
        break;
      case QUEUE_TYPE_UPDATE_CACHE:
        this._updateCache(this._processQueue.bind(this));
        break;
      case QUEUE_TYPE_WRITE_CACHE:
        this._writeCache(this._updateQueue[0].stats,
                         this._processQueue.bind(this));
        break;
    }
  },

  _update: function(aNetworkId, aCallback) {
    // Check if connection type is valid.
    if (!this._networks[aNetworkId]) {
      if (aCallback) {
        aCallback(false, "Invalid network " + aNetworkId);
      }
      return;
    }

    let interfaceName = this._networks[aNetworkId].interfaceName;
    debug("Update stats for " + interfaceName);

    // Request stats to NetworkService, which will get stats from netd, passing
    // '_networkStatsAvailable' as a callback.
    if (interfaceName) {
      networkService.getNetworkInterfaceStats(interfaceName,
                this._networkStatsAvailable.bind(this, aCallback, aNetworkId));
      return;
    }

    if (aCallback) {
      aCallback(true, "ok");
    }
  },

  /*
   * Callback of request stats. Store stats in database.
   */
  _networkStatsAvailable: function(aCallback, aNetworkId, aResult, aRxBytes,
                                   aTxBytes, aTimestamp) {
    if (!aResult) {
      if (aCallback) {
        aCallback(false, "Netd IPC error");
      }
      return;
    }

    let stats = {
      appId: 0,
      serviceType: "",
      networkId: this._networks[aNetworkId].network.id,
      networkType: this._networks[aNetworkId].network.type,
      date: new Date(aTimestamp),
      rxBytes: aTxBytes,
      txBytes: aRxBytes,
      isAccumulative: true
    };

    debug("Update stats for: " + JSON.stringify(stats));

    this._db.saveStats(stats, function(aError, aUndefined) {
      if (aCallback) {
        if (aError) {
          aCallback(false, aError);
          return;
        }

        aCallback(true, "OK");
      }
    });
  },

  /*
   * Function responsible for receiving stats which are not from netd.
   */
  saveStats: function(aAppId, aServiceType, aNetworkInterface, aTimeStamp,
                      aRxBytes, aTxBytes, aIsAccumulative, aCallback) {
    let networkId = this._convertNetworkInterface(aNetworkInterface);
    if (!networkId) {
      if (aCallback) {
        aCallback(false, "Invalid network type");
      }
      return;
    }

    // Check if |aConnectionType|, |aAppId| and |aServiceType| are valid.
    // There are two invalid cases for the combination of |aAppId| and
    // |aServiceType|:
    // a. Both |aAppId| is non-zero and |aServiceType| is non-empty.
    // b. Both |aAppId| is zero and |aServiceType| is empty.
    if (!this._networks[networkId] || (aAppId && aServiceType) ||
        (!aAppId && !aServiceType)) {
      debug("Invalid network interface, appId or serviceType");
      return;
    }

    let stats = {
      appId: aAppId,
      serviceType: aServiceType,
      networkId: this._networks[networkId].network.id,
      networkType: this._networks[networkId].network.type,
      date: new Date(aTimeStamp),
      rxBytes: aRxBytes,
      txBytes: aTxBytes,
      isAccumulative: aIsAccumulative
    };

    this._updateQueue.push({
      stats: stats,
      callbacks: [aCallback],
      queueType: QUEUE_TYPE_WRITE_CACHE
    });

    this._processQueue();
  },

  _writeCache: function(aStats, aCallback) {
    debug("saveStats: " + aStats.appId + " " + aStats.serviceType + " " +
          aStats.networkId + " " + aStats.networkType + " " + aStats.date + " "
          + aStats.date + " " + aStats.rxBytes + " " + aStats.txBytes);

    // Generate an unique key from |appId|, |serviceType| and |networkId|,
    // which is used to retrieve data in |_cachedStats|.
    let networkId = this._getNetworkId(aStats.networkId, aStats.networkType);
    let key = aStats.appId + "" + aStats.serviceType + "" + networkId;

    // |_cachedStats| only keeps the data with the same date.
    // If the incoming date is different from |_cachedStatsDate|,
    // both |_cachedStats| and |_cachedStatsDate| will get updated.
    let diff = (this._db.normalizeDate(aStats.date) -
                this._db.normalizeDate(this._cachedStatsDate)) /
               this._db.sampleRate;
    if (diff != 0) {
      this._updateCache(function() {
        this._cachedStatsDate = aStats.date;
        this._cachedStats[key] = aStats;

        if (aCallback) {
          aCallback(true, "ok");
        }
      }.bind(this));
      return;
    }

    // Try to find the matched row in the cached by |appId| and |connectionType|.
    // If not found, save the incoming data into the cached.
    let cachedStat = this._cachedStats[key];
    if (!cachedStat) {
      this._cachedStats[key] = aStats;
      if (aCallback) {
        aCallback(true, "ok");
      }
      return;
    }

    // Find matched row, accumulate the traffic amount.
    cachedStat.rxBytes += aStats.rxBytes;
    cachedStat.txBytes += aStats.txBytes;

    // If new rxBytes or txBytes exceeds MAX_CACHED_TRAFFIC
    // the corresponding row will be saved to indexedDB.
    // Then, the row will be removed from the cached.
    if (cachedStat.rxBytes > MAX_CACHED_TRAFFIC ||
        cachedStat.txBytes > MAX_CACHED_TRAFFIC) {
      this._db.saveStats(cachedStat, function(aError, aUndefined) {
        debug("Application stats inserted in indexedDB");
        if (aCallback) {
          aCallback(true, "ok");
        }
      });
      delete this._cachedStats[key];
      return;
    }

    if (aCallback) {
      aCallback(true, "ok");
    }
  },

  _updateCachedStats: function(aCallback) {
    this._updateQueue.push({ callbacks: [aCallback],
                             queueType: QUEUE_TYPE_UPDATE_CACHE });

    this._processQueue();
  },

  _updateCache: function(aCallback) {
    debug("_updateCache: " + this._cachedStatsDate);

    let stats = Object.keys(this._cachedStats);
    if (stats.length == 0) {
      // |_cachedStats| is empty, no need to update.
      if (aCallback) {
        aCallback(true, "no need to update");
      }
      return;
    }

    let index = 0;
    this._db.saveStats(this._cachedStats[stats[index]],
                       function onSavedStats(aError, aUndefined) {
      debug("Application stats inserted in indexedDB");

      // Clean up the |_cachedStats| after updating.
      if (index == stats.length - 1) {
        this._cachedStats = {};

        if (aCallback) {
          aCallback(true, "ok");
        }
        return;
      }

      // Update is not finished, keep updating.
      index += 1;
      this._db.saveStats(this._cachedStats[stats[index]],
                         onSavedStats.bind(this));
    }.bind(this));
  },

  get maxCachedTraffic() {
    return MAX_CACHED_TRAFFIC;
  },

  logAllRecords: function() {
    this._db.logAllRecords(function(aError, aNetRecords) {
      if (aError) {
        debug("Error: " + aError);
        return;
      }

      debug("===== LOG =====");
      debug("There are " + aNetRecords.length + " items");
      debug(JSON.stringify(aNetRecords));
    });
  },

  getAlarms: function(aMsgTarget, aMsgJson) {
    let self = this;
    let network = aMsgJson.data.network;
    let manifestURL = aMsgJson.data.manifestURL;

    if (network) {
      this._validateNetwork(network, function(aNetworkId) {
        if (!aNetworkId) {
          aMsgTarget.sendAsyncMessage("NetworkStats:GetAlarms:Return", {
            id: aMsgJson.id,
            error: "InvalidInterface",
            result: null
          });
          return;
        }

        self._getAlarms(aMsgTarget, aMsgJson, aNetworkId, manifestURL);
      });
      return;
    }

    this._getAlarms(aMsgTarget, aMsgJson, null, manifestURL);
  },

  _getAlarms: function(aMsgTarget, aMsgJson, aNetworkId, aManifestURL) {
    let self = this;
    this._db.getAlarms(aNetworkId, aManifestURL, function(aError, aAlarmRecords) {
      if (aError) {
        aMsgTarget.sendAsyncMessage("NetworkStats:GetAlarms:Return", {
          id: aMsgJson.id,
          error: aError,
          result: aAlarmRecords
        });
        return;
      }

      let alarms = [];
      // NetworkStatsManager must return the network instead of the networkId.
      for (let i = 0; i < aAlarmRecords.length; i++) {
        let alarm = aAlarmRecords[i];
        alarms.push({
          id: alarm.id,
          network: self._networks[alarm.networkId].network,
          threshold: alarm.absoluteThreshold,
          data: alarm.data
        });
      }

      aMsgTarget.sendAsyncMessage("NetworkStats:GetAlarms:Return", {
        id: aMsgJson.id,
        error: null,
        result: alarms
      });
    });
  },

  removeAlarms: function(aMsgTarget, aMsgJson) {
    let alarmId = aMsgJson.data.alarmId;
    let manifestURL = aMsgJson.data.manifestURL;

    let self = this;
    let callback = function(aError, aUnused) {
      if (aError) {
        aMsgTarget.sendAsyncMessage("NetworkStats:RemoveAlarms:Return", {
          id: aMsgJson.id,
          error: aError,
          result: null
        });
        return;
      }

      for (let i in self._currentAlarms) {
        let currentAlarm = self._currentAlarms[i].alarm;
        if (currentAlarm && ((alarmId == currentAlarm.id) ||
            (alarmId == -1 && currentAlarm.manifestURL == manifestURL))) {

          self._updateCurrentAlarm(currentAlarm.networkId);
        }
      }

      aMsgTarget.sendAsyncMessage("NetworkStats:RemoveAlarms:Return", {
        id: aMsgJson.id,
        error: aError,
        result: true
      });
    };

    if (alarmId == -1) {
      this._db.removeAlarms(manifestURL, callback);
    } else {
      this._db.removeAlarm(alarmId, manifestURL, callback);
    }
  },

  /*
   * Function called from manager to set an alarm.
   */
  setAlarm: function(aMsgTarget, aMsgJson) {
    let options = aMsgJson.data;
    let network = options.network;
    let threshold = options.threshold;

    debug("Set alarm at " + threshold + " for " + JSON.stringify(network));

    if (threshold < 0) {
      aMsgTarget.sendAsyncMessage("NetworkStats:SetAlarm:Return", {
        id: aMsgJson.id,
        error: "InvalidThresholdValue",
        result: null
      });
      return;
    }

    let self = this;
    this._validateNetwork(network, function(aNetworkId) {
      if (!aNetworkId) {
        aMsgTarget.sendAsyncMessage("NetworkStats:SetAlarm:Return", {
          id: aMsgJson.id,
          error: "InvalidiConnectionType",
          result: null
        });
        return;
      }

      let newAlarm = {
        id: null,
        networkId: aNetworkId,
        absoluteThreshold: threshold,
        relativeThreshold: null,
        startTime: options.startTimestamp,
        data: options.data,
        pageURL: options.pageURL,
        manifestURL: options.manifestURL
      };

      self._getAlarmQuota(newAlarm, function(aError, aAlarmQuota) {
        if (aError) {
          aMsgTarget.sendAsyncMessage("NetworkStats:SetAlarm:Return", {
            id: aMsgJson.id,
            error: aError,
            result: null
          });
          return;
        }

        self._db.addAlarm(newAlarm, function(aError, aAlarmId) {
          if (aError) {
            aMsgTarget.sendAsyncMessage("NetworkStats:SetAlarm:Return", {
              id: aMsgJson.id,
              error: aError,
              result: null
            });
            return;
          }

          newAlarm.id = aAlarmId;
          self._setAlarm(newAlarm, function(aError) {
            aMsgTarget.sendAsyncMessage("NetworkStats:SetAlarm:Return", {
              id: aMsgJson.id,
              error: aError,
              result: aAlarmId
            });

            if (aError == "InvalidStateError") {
              self._fireAlarm(newAlarm);
            }
          });
        });
      });
    });
  },

  _setAlarm: function(aAlarm, aCallback) {
    let currentAlarm = this._currentAlarms[aAlarm.networkId];
    if ((Object.getOwnPropertyNames(currentAlarm).length !== 0 &&
         aAlarm.relativeThreshold > currentAlarm.alarm.relativeThreshold) ||
        this._networks[aAlarm.networkId].status != NETWORK_STATUS_READY) {
      aCallback(null);
      return;
    }

    let self = this;

    this._getAlarmQuota(aAlarm, function(aError, aAlarmQuota) {
      if (aError) {
        aCallback(aError);
        return;
      }

      let callback = function(aError) {
        if (aError) {
          debug("Set alarm error: " + aError);
          aCallback("netdError");
          return;
        }

        self._currentAlarms[aAlarm.networkId].alarm = aAlarm;

        aCallback(null);
      };

      debug("Set alarm " + JSON.stringify(aAlarm));
      let interfaceName = self._networks[aAlarm.networkId].interfaceName;
      if (interfaceName) {
        networkService.setNetworkInterfaceAlarm(interfaceName,
                                                aQuota,
                                                callback);
        return;
      }

      aCallback(null);
    });
  },

  _getAlarmQuota: function(aAlarm, aCallback) {
    let self = this;
    this._updateStats(aAlarm.networkId, function(aSuccess, aMessage) {
      self._db.getCurrentStats(self._networks[aAlarm.networkId].network,
                               aAlarm.startTime,
                               function(aError, aNetRecord) {
        if (aError) {
          debug("Error getting stats for " +
                JSON.stringify(self._networks[aAlarm.networkId]) + ": " + aError);
          aCallback(aError, null);
          return;
        }

        let quota = aAlarm.absoluteThreshold - aNetRecord.rxBytes - aNetRecord.txBytes;

        // Alarm set to a threshold lower than current rx/tx bytes.
        if (quota <= 0) {
          aCallback("InvalidStateError", null);
          return;
        }

        aAlarm.relativeThreshold = aAlarm.startTime
                                 ? aNetRecord.rxTotalBytes + aNetRecord.txTotalBytes + quota
                                 : aAlarm.absoluteThreshold;

        aCallback(null, quota);
      });
    });
  },

  _fireAlarm: function(aAlarm) {
    debug("Fire alarm");

    let self = this;
    this._db.removeAlarm(aAlarm.id, null, function(aError, aRemoved) {
      if (!aError && !aRemoved) {
        return;
      }

      self._fireSystemMessage(aAlarm);
      self._updateCurrentAlarm(aAlarm.networkId);
    });
  },

  _updateCurrentAlarm: function(aNetworkId) {
    this._currentAlarms[aNetworkId] = {};

    let self = this;
    this._db.getFirstAlarm(aNetworkId, function(aError, aAlarmRecord) {
      if (aError) {
        debug("Error getting the first alarm");
        return;
      }

      if (!aAlarmRecord) {
        let interfaceName = self._networks[aNetworkId].interfaceName;
        networkService.setNetworkInterfaceAlarm(interfaceName, -1,
                                                function() {});
        return;
      }

      self._setAlarm(aAlarmRecord, function(aError) {
        if (aError == "InvalidStateError") {
          self._fireAlarm(aAlarmRecord);
          return;
        }
      });
    });
  },

  _fireSystemMessage: function(aAlarm) {
    debug("Fire system message: " + JSON.stringify(aAlarm));

    let manifestURI = Services.io.newURI(aAlarm.manifestURL, null, null);
    let pageURI = Services.io.newURI(aAlarm.pageURL, null, null);

    let message = {
      "id": aAlarm.id,
      "threshold": aAlarm.absoluteThreshold,
      "data": aAlarm.data
    };
    messenger.sendMessage("networkstats-alarm", message, pageURI, manifestURI);
  }
};

NetworkStatsService.init();
