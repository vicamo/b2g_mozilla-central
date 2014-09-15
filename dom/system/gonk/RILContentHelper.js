/* Copyright 2012 Mozilla Foundation and Mozilla contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/DOMRequestHelper.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "RIL", function () {
  let obj = {};
  Cu.import("resource://gre/modules/ril_consts.js", obj);
  return obj;
});

const NS_XPCOM_SHUTDOWN_OBSERVER_ID = "xpcom-shutdown";

const NS_PREFBRANCH_PREFCHANGE_TOPIC_ID = "nsPref:changed";

const kPrefRilNumRadioInterfaces = "ril.numRadioInterfaces";
const kPrefRilDebuggingEnabled = "ril.debugging.enabled";

let DEBUG;
function debug(s) {
  dump("-*- RILContentHelper: " + s + "\n");
}

const RILCONTENTHELPER_CID =
  Components.ID("{472816e1-1fd6-4405-996c-806f9ea68174}");
const ICCINFO_CID =
  Components.ID("{39d64d90-26a6-11e4-8c21-0800200c9a66}");
const GSMICCINFO_CID =
  Components.ID("{e0fa785b-ad3f-46ed-bc56-fcb0d6fe4fa8}");
const CDMAICCINFO_CID =
  Components.ID("{3d1f844f-9ec5-48fb-8907-aed2e5421709}");
const CELLBROADCASTMESSAGE_CID =
  Components.ID("{29474c96-3099-486f-bb4a-3c9a1da834e4}");
const CELLBROADCASTETWSINFO_CID =
  Components.ID("{59f176ee-9dcd-4005-9d47-f6be0cd08e17}");

const RIL_IPC_MSG_NAMES = [
  "RIL:CardStateChanged",
  "RIL:IccInfoChanged",
  "RIL:GetCardLockResult",
  "RIL:CardLockResult",
  "RIL:CardLockRetryCount",
  "RIL:StkCommand",
  "RIL:StkSessionEnd",
  "RIL:CellBroadcastReceived",
  "RIL:IccOpenChannel",
  "RIL:IccCloseChannel",
  "RIL:IccExchangeAPDU",
  "RIL:ReadIccContacts",
  "RIL:UpdateIccContact",
  "RIL:MatchMvno"
];

XPCOMUtils.defineLazyServiceGetter(this, "cpmm",
                                   "@mozilla.org/childprocessmessagemanager;1",
                                   "nsISyncMessageSender");

XPCOMUtils.defineLazyGetter(this, "gNumRadioInterfaces", function() {
  let appInfo = Cc["@mozilla.org/xre/app-info;1"];
  let isParentProcess = !appInfo || appInfo.getService(Ci.nsIXULRuntime)
                          .processType == Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT;

  if (isParentProcess) {
    let ril = Cc["@mozilla.org/ril;1"].getService(Ci.nsIRadioInterfaceLayer);
    return ril.numRadioInterfaces;
  }

  return Services.prefs.getIntPref(kPrefRilNumRadioInterfaces);
});

const WEBIDL_ICC_CARD_LOCK_TYPE_NAMES = [
  "pin", "pin2", "puk", "puk2", "nck", "nck1", "nck2", "hnck", "cck", "spck",
  "rcck", "rspck", "nckPuk", "nck1Puk", "nck2Puk", "hnckPuk", "cckPuk",
  "spckPuk", "rcckPuk", "rspckPuk", "fdn"
];

function MobileIccCardLockResult(options) {
  this.lockType = WEBIDL_ICC_CARD_LOCK_TYPE_NAMES[options.lockType];
  this.enabled = options.enabled;
  this.retryCount = options.retryCount;
  this.success = options.success;
}
MobileIccCardLockResult.prototype = {
  __exposedProps__ : {lockType: 'r',
                      enabled: 'r',
                      retryCount: 'r',
                      success: 'r'}
};

function MobileIccCardLockRetryCount(options) {
  this.lockType = WEBIDL_ICC_CARD_LOCK_TYPE_NAMES[options.lockType];
  this.retryCount = options.retryCount;
  this.success = options.success;
}
MobileIccCardLockRetryCount.prototype = {
  __exposedProps__ : {lockType: 'r',
                      retryCount: 'r',
                      success: 'r'}
};

function IccInfo() {}
IccInfo.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMMozIccInfo]),
  classID: ICCINFO_CID,
  classInfo: XPCOMUtils.generateCI({
    classID:          ICCINFO_CID,
    classDescription: "MozIccInfo",
    flags:            Ci.nsIClassInfo.DOM_OBJECT,
    interfaces:       [Ci.nsIDOMMozIccInfo]
  }),

  // nsIDOMMozIccInfo

  iccType: null,
  iccid: null,
  mcc: null,
  mnc: null,
  spn: null,
  isDisplayNetworkNameRequired: null,
  isDisplaySpnRequired: null
};

function GsmIccInfo() {}
GsmIccInfo.prototype = {
  __proto__: IccInfo.prototype,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMMozGsmIccInfo]),
  classID: GSMICCINFO_CID,
  classInfo: XPCOMUtils.generateCI({
    classID:          GSMICCINFO_CID,
    classDescription: "MozGsmIccInfo",
    flags:            Ci.nsIClassInfo.DOM_OBJECT,
    interfaces:       [Ci.nsIDOMMozGsmIccInfo]
  }),

  // nsIDOMMozGsmIccInfo

  msisdn: null
};

function CdmaIccInfo() {}
CdmaIccInfo.prototype = {
  __proto__: IccInfo.prototype,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMMozCdmaIccInfo]),
  classID: CDMAICCINFO_CID,
  classInfo: XPCOMUtils.generateCI({
    classID:          CDMAICCINFO_CID,
    classDescription: "MozCdmaIccInfo",
    flags:            Ci.nsIClassInfo.DOM_OBJECT,
    interfaces:       [Ci.nsIDOMMozCdmaIccInfo]
  }),

  // nsIDOMMozCdmaIccInfo

  mdn: null,
  prlVersion: 0
};

function CellBroadcastMessage(clientId, pdu) {
  this.serviceId = clientId;
  this.gsmGeographicalScope = RIL.CB_GSM_GEOGRAPHICAL_SCOPE_NAMES[pdu.geographicalScope];
  this.messageCode = pdu.messageCode;
  this.messageId = pdu.messageId;
  this.language = pdu.language;
  this.body = pdu.fullBody;
  this.messageClass = pdu.messageClass;
  this.timestamp = pdu.timestamp;

  if (pdu.etws != null) {
    this.etws = new CellBroadcastEtwsInfo(pdu.etws);
  }

  this.cdmaServiceCategory = pdu.serviceCategory;
}
CellBroadcastMessage.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMMozCellBroadcastMessage]),
  classID:        CELLBROADCASTMESSAGE_CID,
  classInfo:      XPCOMUtils.generateCI({
    classID:          CELLBROADCASTMESSAGE_CID,
    classDescription: "CellBroadcastMessage",
    flags:            Ci.nsIClassInfo.DOM_OBJECT,
    interfaces:       [Ci.nsIDOMMozCellBroadcastMessage]
  }),

  // nsIDOMMozCellBroadcastMessage
  serviceId: -1,

  gsmGeographicalScope: null,
  messageCode: null,
  messageId: null,
  language: null,
  body: null,
  messageClass: null,
  timestamp: null,

  etws: null,
  cdmaServiceCategory: null
};

function CellBroadcastEtwsInfo(etwsInfo) {
  if (etwsInfo.warningType != null) {
    this.warningType = RIL.CB_ETWS_WARNING_TYPE_NAMES[etwsInfo.warningType];
  }
  this.emergencyUserAlert = etwsInfo.emergencyUserAlert;
  this.popup = etwsInfo.popup;
}
CellBroadcastEtwsInfo.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMMozCellBroadcastEtwsInfo]),
  classID:        CELLBROADCASTETWSINFO_CID,
  classInfo:      XPCOMUtils.generateCI({
    classID:          CELLBROADCASTETWSINFO_CID,
    classDescription: "CellBroadcastEtwsInfo",
    flags:            Ci.nsIClassInfo.DOM_OBJECT,
    interfaces:       [Ci.nsIDOMMozCellBroadcastEtwsInfo]
  }),

  // nsIDOMMozCellBroadcastEtwsInfo

  warningType: null,
  emergencyUserAlert: null,
  popup: null
};

function RILContentHelper() {
  this.updateDebugFlag();

  this.numClients = gNumRadioInterfaces;
  if (DEBUG) debug("Number of clients: " + this.numClients);

  this.rilContexts = [];
  for (let clientId = 0; clientId < this.numClients; clientId++) {
    this.rilContexts[clientId] = {
      cardState: Ci.nsIIccService.CARD_STATE_UNKNOWN,
      iccInfo: null
    };
  }

  this.initDOMRequestHelper(/* aWindow */ null, RIL_IPC_MSG_NAMES);
  this._windowsMap = [];
  this._cellBroadcastListeners = [];
  this._iccListeners = [];

  Services.obs.addObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID, false);

  Services.prefs.addObserver(kPrefRilDebuggingEnabled, this, false);
}

RILContentHelper.prototype = {
  __proto__: DOMRequestIpcHelper.prototype,

  QueryInterface: XPCOMUtils.generateQI([Ci.nsICellBroadcastProvider,
                                         Ci.nsIIccService,
                                         Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),
  classID:   RILCONTENTHELPER_CID,
  classInfo: XPCOMUtils.generateCI({classID: RILCONTENTHELPER_CID,
                                    classDescription: "RILContentHelper",
                                    interfaces: [Ci.nsICellBroadcastProvider,
                                                 Ci.nsIIccService]}),

  updateDebugFlag: function() {
    try {
      DEBUG = RIL.DEBUG_CONTENT_HELPER ||
              Services.prefs.getBoolPref(kPrefRilDebuggingEnabled);
    } catch (e) {}
  },

  // An utility function to copy objects.
  updateInfo: function(srcInfo, destInfo) {
    for (let key in srcInfo) {
      destInfo[key] = srcInfo[key];
    }
  },

  /**
   * We need to consider below cases when update iccInfo:
   * 1. Should clear iccInfo to null if there is no card detected.
   * 2. Need to create corresponding object based on iccType.
   */
  updateIccInfo: function(clientId, newInfo) {
    let rilContext = this.rilContexts[clientId];

    // Card is not detected, clear iccInfo to null.
    if (!newInfo || !newInfo.iccid) {
      if (rilContext.iccInfo) {
        rilContext.iccInfo = null;
      }
      return;
    }

    // If iccInfo is null, new corresponding object based on iccType.
    if (!rilContext.iccInfo) {
      if (newInfo.iccType === "ruim" || newInfo.iccType === "csim") {
        rilContext.iccInfo = new CdmaIccInfo();
      } else if (newInfo.iccType === "sim" || newInfo.iccType === "usim") {
        rilContext.iccInfo = new GsmIccInfo();
      } else {
        rilContext.iccInfo = new IccInfo();
      }
    }
    let changed = (rilContext.iccInfo.iccid != newInfo.iccid) ?
      true : false;

    this.updateInfo(newInfo, rilContext.iccInfo);
  },

  _windowsMap: null,

  rilContexts: null,

  getRilContext: function(clientId) {
    // Update ril contexts by sending IPC message to chrome only when the first
    // time we require it. The information will be updated by following info
    // changed messages.
    this.getRilContext = function getRilContext(clientId) {
      return this.rilContexts[clientId];
    };

    for (let cId = 0; cId < this.numClients; cId++) {
      let rilContext =
        cpmm.sendSyncMessage("RIL:GetRilContext", {clientId: cId})[0];
      if (!rilContext) {
        if (DEBUG) debug("Received null rilContext from chrome process.");
        continue;
      }
      this.rilContexts[cId].cardState = rilContext.cardState;
      this.updateIccInfo(cId, rilContext.iccInfo);
    }

    return this.rilContexts[clientId];
  },

  /**
   * nsIIccService
   */

  getIccInfo: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.iccInfo;
  },

  getCardState: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.cardState;
  },

  matchMvno: function(clientId, callback, mvnoType, mvnoData) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:MatchMvno", {
      clientId: clientId,
      data: {
        requestId: requestId,
        mvnoType: mvnoType,
        mvnoData: mvnoData
      }
    });
  },

  getCardLockState: function(clientId, callback, lockType, aid) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:GetCardLockState", {
      clientId: clientId,
      data: {
        lockType: lockType,
        aid: aid,
        requestId: requestId
      }
    });
  },

  unlockCardLock: function(clientId, callback, lockType, password, newPassword, aid) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:UnlockCardLock", {
      clientId: clientId,
      data: {
        lockType: lockType,
        password: password,
        newPassword: newPassword,
        aid: aid,
        requestId: requestId
      }
    });
  },

  enableCardLock: function(clientId, callback, lockType, password, enabled, aid) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:EnableCardLock", {
      clientId: clientId,
      data: {
        lockType: lockType,
        password: password,
        enabled: enabled,
        aid: aid,
        requestId: requestId
      }
    });
  },

  changeCardLockPassword: function(clientId, callback, lockType, password,
                                   newPassword, aid) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:ChangeCardLockPassword", {
      clientId: clientId,
      data: {
        lockType: lockType,
        password: password,
        newPassword: newPassword,
        aid: aid,
        requestId: requestId
      }
    });
  },

  getCardLockRetryCount: function(clientId, callback, lockType) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:GetCardLockRetryCount", {
      clientId: clientId,
      data: {
        lockType: lockType,
        requestId: requestId
      }
    });
  },

  sendStkResponse: function(clientId, command, response) {
    response.command = command;
    cpmm.sendAsyncMessage("RIL:SendStkResponse", {
      clientId: clientId,
      data: response
    });
  },

  sendStkMenuSelection: function(clientId, itemIdentifier, helpRequested) {
    cpmm.sendAsyncMessage("RIL:SendStkMenuSelection", {
      clientId: clientId,
      data: {
        itemIdentifier: itemIdentifier,
        helpRequested: helpRequested
      }
    });
  },

  sendStkTimerExpiration: function(clientId, timerId, timerValue) {
    cpmm.sendAsyncMessage("RIL:SendStkTimerExpiration", {
      clientId: clientId,
      data: {
        timerId: timerId,
        timerValue: timerValue
      }
    });
  },

  sendStkEventDownload: function(clientId, event) {
    cpmm.sendAsyncMessage("RIL:SendStkEventDownload", {
      clientId: clientId,
      data: {
        event: event
      }
    });
  },

  iccOpenChannel: function(clientId, callback, aid) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:IccOpenChannel", {
      clientId: clientId,
      data: {
        requestId: requestId,
        aid: aid
      }
    });
  },

  iccExchangeAPDU: function(clientId, callback, channel, cla, command, path, p1,
                            p2, p3, data, data2) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:IccExchangeAPDU", {
      clientId: clientId,
      data: {
        requestId: requestId,
        channel: channel,
        apdu: {
          cla: cla,
          command: command,
          path: path,
          p1: p1,
          p2: p2,
          p3: p3,
          data: data,
          data2: data2
        }
      }
    });
  },

  iccCloseChannel: function(clientId, callback, channel) {
    let requestId = this.getRequestId(callback);
    cpmm.sendAsyncMessage("RIL:IccCloseChannel", {
      clientId: clientId,
      data: {
        requestId: requestId,
        channel: channel
      }
    });
  },

  readContacts: function(clientId, callback, contactType) {
    let self = this;

    let context = {
      contacts: null,
      callback: callback,
      fireSuccess: function() {
        if (!this.contacts || !this.contacts.length) {
          this.callback.notifySuccess();
          return;
        }

	let iccContact = this.contacts.shift();
        let tels = [iccContact.number];
        if (iccContact.anr != null && Array.isArray(iccContact.anr)) {
          tels = tels.concat(iccContact.anr);
        }
        let emails = null;
        if (iccContact.email != null) {
          emails = [iccContact.email]
        }
        this.callback.notifyContactSuccess(iccContact.contactId,
                                           [iccContact.alphaId],
                                           1,
                                           tels,
                                           tels.length,
                                           emails || null,
                                           emails && emails.length);
      }
    };

    let requestId = this.getRequestId(context);
    cpmm.sendAsyncMessage("RIL:ReadIccContacts", {
      clientId: clientId,
      data: {
        requestId: requestId,
        contactType: contactType
      }
    });

    return {
      QueryInterface: XPCOMUtils.generateQI([Ci.nsICursorContinueCallback]),
      handleContinue: function() {
        let currentThread = Services.tm.currentThread;
        currentThread.dispatch(context.fireSuccess.bind(context),
                               Ci.nsIThread.DISPATCH_NORMAL);
      }
    };
  },

  updateContact: function(clientId, callback, contactType, id, names, nameCount,
                          tels, telCount, emails, emailCount, pin2) {
    debug("updateContact(" + clientId + ", window, " + contactType + ", " + id +
          ", '" + JSON.stringify(names) + "', " + nameCount +
          ", '" + JSON.stringify(tels) + "', " + telCount +
          ", '" + JSON.stringify(emails) + "', " + emailCount);

    let requestId = this.getRequestId(callback);

    // Parsing nsDOMContact to Icc Contact format
    let iccContact = { contactId: id };

    if (nameCount && Array.isArray(names) && names[0]) {
      iccContact.alphaId = names[0];
    }

    if (telCount && Array.isArray(tels)) {
      iccContact.number = tels[0];
      if (telCount > 1) {
        iccContact.anr = tels.slice(1);
      }
    }

    if (emailCount && Array.isArray(emails) && emails[0]) {
      iccContact.email = emails[0];
    }
    if (DEBUG) {
      debug("updateContact: iccContact = " + JSON.stringify(iccContact));
    }

    cpmm.sendAsyncMessage("RIL:UpdateIccContact", {
      clientId: clientId,
      data: {
        requestId: requestId,
        contactType: contactType,
        contact: iccContact,
        pin2: pin2
      }
    });
  },

  _cellBroadcastListeners: null,
  _iccListeners: null,

  registerListener: function(listenerType, clientId, listener) {
    if (!this[listenerType]) {
      return;
    }
    let listeners = this[listenerType][clientId];
    if (!listeners) {
      listeners = this[listenerType][clientId] = [];
    }

    if (listeners.indexOf(listener) != -1) {
      throw new Error("Already registered this listener!");
    }

    listeners.push(listener);
    if (DEBUG) debug("Registered " + listenerType + " listener: " + listener);
  },

  unregisterListener: function(listenerType, clientId, listener) {
    if (!this[listenerType]) {
      return;
    }
    let listeners = this[listenerType][clientId];
    if (!listeners) {
      return;
    }

    let index = listeners.indexOf(listener);
    if (index != -1) {
      listeners.splice(index, 1);
      if (DEBUG) debug("Unregistered listener: " + listener);
    }
  },

  registerCellBroadcastMsg: function(listener) {
    if (DEBUG) debug("Registering for Cell Broadcast related messages");
    // Instead of registering multiple listeners for Multi-SIM, we reuse
    // clientId 0 to route all CBS messages to single listener and provide the
    // |clientId| info by |CellBroadcastMessage.serviceId|.
    this.registerListener("_cellBroadcastListeners", 0, listener);
    cpmm.sendAsyncMessage("RIL:RegisterCellBroadcastMsg");
  },

  unregisterCellBroadcastMsg: function(listener) {
    // Instead of unregistering multiple listeners for Multi-SIM, we reuse
    // clientId 0 to route all CBS messages to single listener and provide the
    // |clientId| info by |CellBroadcastMessage.serviceId|.
    this.unregisterListener("_cellBroadcastListeners", 0, listener);
  },

  registerIccMsg: function(clientId, listener) {
    if (DEBUG) debug("Registering for ICC related messages");
    this.registerListener("_iccListeners", clientId, listener);
    cpmm.sendAsyncMessage("RIL:RegisterIccMsg");
  },

  unregisterIccMsg: function(clientId, listener) {
    this.unregisterListener("_iccListeners", clientId, listener);
  },

  // nsIObserver

  observe: function(subject, topic, data) {
    switch (topic) {
      case NS_PREFBRANCH_PREFCHANGE_TOPIC_ID:
        if (data == kPrefRilDebuggingEnabled) {
          this.updateDebugFlag();
        }
        break;

      case NS_XPCOM_SHUTDOWN_OBSERVER_ID:
        this.destroyDOMRequestHelper();
        Services.obs.removeObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID);
        break;
    }
  },

  // nsIMessageListener

  doCallback: function(requestId, funcName, args) {
    let callback = this.takeRequest(requestId);
    if (!callback) {
      if (DEBUG) debug("Callback doesn't exist. ID: " + requestId);
      return;
    }

    callback[funcName].apply(callback, args);
  },

  fireRequestSuccess: function(requestId) {
    this.doCallback(requestId, "notifySuccess", []);
  },

  fireRequestError: function(requestId, rilRequestError) {
    this.doCallback(requestId, "notifyError", [rilRequestError]);
  },

  fireContactSuccess: function(iccContact) {
  },

  fireRequestDetailedError: function(requestId, detailedError) {
    let callback = this.takeRequest(requestId);
    if (!callback) {
      if (DEBUG) {
        debug("not firing detailed error for id: " + requestId +
              ", detailedError: " + JSON.stringify(detailedError));
      }
      return;
    }

    Services.DOMRequest.fireDetailedError(callback, detailedError);
  },

  receiveMessage: function(msg) {
    let request;
    if (DEBUG) {
      debug("Received message '" + msg.name + "': " + JSON.stringify(msg.json));
    }

    let data = msg.json.data;
    let clientId = msg.json.clientId;
    switch (msg.name) {
      case "RIL:CardStateChanged":
        if (this.rilContexts[clientId].cardState != data.cardState) {
          this.rilContexts[clientId].cardState = data.cardState;
          this._deliverEvent(clientId,
                             "_iccListeners",
                             "notifyCardStateChanged",
                             null);
        }
        break;
      case "RIL:IccInfoChanged":
        this.updateIccInfo(clientId, data);
        this._deliverEvent(clientId,
                           "_iccListeners",
                           "notifyIccInfoChanged",
                           null);
        break;
      case "RIL:GetCardLockResult":
        if (data.rilRequestError !== Ci.nsIRilCallback.SUCCESS) {
          this.fireRequestError(data.requestId, data.rilRequestError);
        } else {
          this.doCallback(data.requestId, "notifyGetCardLockStateSuccess",
                          [data.lockType, data.enabled]);
        }
        break;
      case "RIL:CardLockResult":
        if (data.rilRequestError !== Ci.nsIRilCallback.SUCCESS) {
          this.doCallback(data.requestId, "notifySetCardLockError",
                          [data.lockType, data.rilRequestError, data.retryCount]);
        } else {
          this.doCallback(data.requestId, "notifySetCardLockSuccess",
                          [data.lockType]);
        }
        break;
      case "RIL:CardLockRetryCount":
        if (data.rilRequestError !== Ci.nsIRilCallback.SUCCESS) {
          this.fireRequestError(data.requestId, data.rilRequestError);
        } else {
          this.doCallback(data.requestId, "notifyGetCardLockRetryCountSuccess",
                          [data.lockType, data.retryCount]);
        }
        break;
      case "RIL:StkCommand":
        this._deliverEvent(clientId, "_iccListeners", "notifyStkCommand",
                           [JSON.stringify(data)]);
        break;
      case "RIL:StkSessionEnd":
        this._deliverEvent(clientId, "_iccListeners", "notifyStkSessionEnd", null);
        break;
      case "RIL:IccOpenChannel":
        if (data.rilRequestError !== Ci.nsIRilCallback.SUCCESS) {
          this.fireRequestError(data.requestId, data.rilRequestError);
        } else {
          this.doCallback(data.requestId, "notifyOpenChannelSuccess",
                          [data.channel]);
        }
        break;
      case "RIL:IccCloseChannel":
        if (data.rilRequestError !== Ci.nsIRilCallback.SUCCESS) {
          this.fireRequestError(data.requestId, data.rilRequestError);
        } else {
          this.fireRequestSuccess(data.requestId);
        }
        break;
      case "RIL:IccExchangeAPDU":
        if (data.rilRequestError !== Ci.nsIRilCallback.SUCCESS) {
          this.fireRequestError(data.requestId, data.rilRequestError);
        } else {
          this.doCallback(data.requestId, "notifyExchangeAPDUSuccess",
                          [data.sw1, data.sw2, data.simResponse]);
        }
        break;
      case "RIL:ReadIccContacts":
        this.handleReadIccContacts(data);
        break;
      case "RIL:UpdateIccContact":
        this.handleUpdateIccContact(data);
        break;
      case "RIL:MatchMvno":
        if (data.rilRequestError !== Ci.nsIRilCallback.SUCCESS) {
          this.fireRequestError(data.requestId, data.rilRequestError);
        } else {
          this.doCallback(data.requestId, "notifyMatchMvnoSuccess",
                          [data.result]);
        }
        break;
      case "RIL:CellBroadcastReceived": {
        // All CBS messages are to routed the listener for clientId 0 and
        // provide the |clientId| info by |CellBroadcastMessage.serviceId|.
        let message = new CellBroadcastMessage(clientId, data);
        this._deliverEvent(0, // route to clientId 0.
                           "_cellBroadcastListeners",
                           "notifyMessageReceived",
                           [message]);
        break;
      }
    }
  },

  handleReadIccContacts: function(message) {
    if (message.rilRequestError) {
      this.fireRequestError(message.requestId, message.rilRequestError);
      return;
    }

    let context = this.takeRequest(message.requestId);
    if (!context) {
      if (DEBUG) debug("Context doesn't exist. ID: " + message.requestId);
      return;
    }

    context.contacts = message.contacts;
    context.fireSuccess();
  },

  handleUpdateIccContact: function(message) {
    if (message.rilRequestError) {
      this.fireRequestError(message.requestId, message.rilRequestError);
      return;
    }

    let iccContact = message.contact;
    let tels = [iccContact.number];
    if (iccContact.anr != null && Array.isArray(iccContact.anr)) {
      tels = tels.concat(iccContact.anr);
    }
    let emails = null;
    if (iccContact.email != null) {
      emails = [iccContact.email]
    }
    this.doCallback(requestId, "notifyContactSuccess", [iccContact.contactId,
                                                        [iccContact.alphaId],
                                                        1,
                                                        tels,
                                                        tels.length,
                                                        emails || null,
                                                        emails && emails.length]);
  },

  _deliverEvent: function(clientId, listenerType, name, args) {
    if (!this[listenerType]) {
      return;
    }
    let thisListeners = this[listenerType][clientId];
    if (!thisListeners) {
      return;
    }

    let listeners = thisListeners.slice();
    for (let listener of listeners) {
      if (thisListeners.indexOf(listener) == -1) {
        continue;
      }
      let handler = listener[name];
      if (typeof handler != "function") {
        throw new Error("No handler for " + name);
      }
      try {
        handler.apply(listener, args);
      } catch (e) {
        if (DEBUG) debug("listener for " + name + " threw an exception: " + e);
      }
    }
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([RILContentHelper]);
