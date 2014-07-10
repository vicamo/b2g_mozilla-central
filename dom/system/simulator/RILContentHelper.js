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

const NS_XPCOM_SHUTDOWN_OBSERVER_ID = "xpcom-shutdown";

const NS_PREFBRANCH_PREFCHANGE_TOPIC_ID = "nsPref:changed";

const kPrefRilNumRadioInterfaces = "ril.numRadioInterfaces";
const kPrefRilDebuggingEnabled = "ril.debugging.enabled";
const kPrefVoicemailDefaultServiceId = "dom.voicemail.defaultServiceId";

let DEBUG;
function debug(s) {
  dump("-*- RILContentHelper: " + s + "\n");
}

const RILCONTENTHELPER_CID =
  Components.ID("{472816e1-1fd6-4405-996c-806f9ea68174}");
const GSMICCINFO_CID =
  Components.ID("{e0fa785b-ad3f-46ed-bc56-fcb0d6fe4fa8}");
const CDMAICCINFO_CID =
  Components.ID("{3d1f844f-9ec5-48fb-8907-aed2e5421709}");
const MOBILECONNECTIONINFO_CID =
  Components.ID("{a35cfd39-2d93-4489-ac7d-396475dacb27}");
const MOBILENETWORKINFO_CID =
  Components.ID("{a6c8416c-09b4-46d1-bf29-6520d677d085}");
const MOBILECELLINFO_CID =
  Components.ID("{ae724dd4-ccaf-4006-98f1-6ce66a092464}");
const VOICEMAILSTATUS_CID=
  Components.ID("{5467f2eb-e214-43ea-9b89-67711241ec8e}");
const MOBILECFINFO_CID=
  Components.ID("{a4756f16-e728-4d9f-8baa-8464f894888a}");
const ICCCARDLOCKERROR_CID =
  Components.ID("{08a71987-408c-44ff-93fd-177c0a85c3dd}");

function MobileIccCardLockResult(options) {
  this.lockType = options.lockType;
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
  this.lockType = options.lockType;
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
  iccType: null,
  iccid: null,
  mcc: null,
  mnc: null,
  spn: null,
  isDisplayNetworkNameRequired: null,
  isDisplaySpnRequired: null
};

function GsmIccInfo(aMsisdn) {
  this.msisdn = aMsisdn;
}
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

function VoicemailInfo(aNumber, aDisplayName) {
  this.number = aNumber;
  this.displayName = aDisplayName;
}
VoicemailInfo.prototype = {
  number: null,
  displayName: null
};

function MobileConnectionInfo() {}
MobileConnectionInfo.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMobileConnectionInfo]),
  classID:        MOBILECONNECTIONINFO_CID,
  classInfo:      XPCOMUtils.generateCI({
    classID:          MOBILECONNECTIONINFO_CID,
    classDescription: "MobileConnectionInfo",
    interfaces:       [Ci.nsIMobileConnectionInfo]
  }),

  // nsIMobileConnectionInfo

  connected: false,
  state: null,
  emergencyCallsOnly: false,
  roaming: false,
  network: null,
  cell: null,
  type: null,
  signalStrength: null,
  relSignalStrength: null
};

function MobileNetworkInfo() {}
MobileNetworkInfo.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMobileNetworkInfo]),
  classID:        MOBILENETWORKINFO_CID,
  classInfo:      XPCOMUtils.generateCI({
    classID:          MOBILENETWORKINFO_CID,
    classDescription: "MobileNetworkInfo",
    interfaces:       [Ci.nsIMobileNetworkInfo]
  }),

  // nsIMobileNetworkInfo

  shortName: null,
  longName: null,
  mcc: null,
  mnc: null,
  state: null
};

function MobileCellInfo() {}
MobileCellInfo.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMobileCellInfo]),
  classID:        MOBILECELLINFO_CID,
  classInfo:      XPCOMUtils.generateCI({
    classID:          MOBILECELLINFO_CID,
    classDescription: "MobileCellInfo",
    interfaces:       [Ci.nsIMobileCellInfo]
  }),

  // nsIMobileCellInfo

  gsmLocationAreaCode: -1,
  gsmCellId: -1,
  cdmaBaseStationId: -1,
  cdmaBaseStationLatitude: -2147483648,
  cdmaBaseStationLongitude: -2147483648,
  cdmaSystemId: -1,
  cdmaNetworkId: -1
};

function VoicemailStatus(clientId) {
  this.serviceId = clientId;
}
VoicemailStatus.prototype = {
  QueryInterface: XPCOMUtils.generateQI([]),
  classID:        VOICEMAILSTATUS_CID,
  contractID:     "@mozilla.org/voicemailstatus;1",

  serviceId: -1,
  hasMessages: false,
  messageCount: -1, // Count unknown.
  returnNumber: null,
  returnMessage: null
};

function IccCardLockError() {
}
IccCardLockError.prototype = {
  classDescription: "IccCardLockError",
  classID:          ICCCARDLOCKERROR_CID,
  contractID:       "@mozilla.org/dom/icccardlock-error;1",
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsISupports]),
  __init: function(lockType, errorMsg, retryCount) {
    this.__DOM_IMPL__.init(errorMsg);
    this.lockType = lockType;
    this.retryCount = retryCount;
  },
};

function RILContentHelper() {
  this.updateDebugFlag();

  this.numClients = 1;
  Services.prefs.setIntPref(kPrefRilNumRadioInterfaces, this.numClients);
  if (DEBUG) debug("Number of clients: " + this.numClients);

  this.rilContexts = [];
  this.voicemailInfos = [];
  this.voicemailStatuses = [];
  for (let clientId = 0; clientId < this.numClients; clientId++) {
    let context = this.rilContexts[clientId] = {
      cardState:            "ready",
      networkSelectionMode: "automatic",
      radioState:           "enabled",
      iccInfo:              new GsmIccInfo("155552" + (clientId + 1) +"5554"),
      voiceConnectionInfo:  new MobileConnectionInfo(),
      dataConnectionInfo:   new MobileConnectionInfo()
    };

    // Voice
    let voice = context.voiceConnectionInfo;
    voice.connected = true;
    voice.state = "registered";
    voice.type = "gsm";
    voice.signalStrength = -70;
    voice.relSignalStrength = 100;

    voice.network = new MobileNetworkInfo();
    voice.network.shortName = "Android";
    voice.network.longName = "Android";
    voice.network.mcc = "320";
    voice.network.mnc = "260";
    voice.network.state = "connected";

    // data
    let data = context.dataConnectionInfo;
    data.connected = false;
    data.emergencyCallsOnly = true;
    data.state = "registered";
    data.type = "umts";
    data.signalStrength = -70;
    data.relSignalStrength = 100;

    data.network = new MobileNetworkInfo();
    data.network.shortName = "Android";
    data.network.longName = "Android";
    data.network.mcc = "320";
    data.network.mnc = "260";
    data.network.state = "connected";

    // ICC
    let icc = context.iccInfo;
    icc.iccid = "8901410321111851072" + clientId;
    icc.iccType = "sim";
    icc.mcc = "320";
    icc.mnc = "260";
    icc.spn = "Android";

    this.voicemailInfos[clientId] = new VoicemailInfo("+15552175049", "Voicemail");
  }

  this._roamingPreference = "any";

  this.voicemailDefaultServiceId = this.getVoicemailDefaultServiceId();

  this.initDOMRequestHelper(/* aWindow */ null, []);

  Services.obs.addObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID, false);

  Services.prefs.addObserver(kPrefRilDebuggingEnabled, this, false);
}

RILContentHelper.prototype = {
  __proto__: DOMRequestIpcHelper.prototype,

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMobileConnectionProvider,
                                         Ci.nsICellBroadcastProvider,
                                         Ci.nsIVoicemailProvider,
                                         Ci.nsIIccProvider,
                                         Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference,
                                         Ci.nsIObserver]),
  classID:   RILCONTENTHELPER_CID,
  classInfo: XPCOMUtils.generateCI({classID: RILCONTENTHELPER_CID,
                                    classDescription: "RILContentHelper",
                                    interfaces: [Ci.nsIMobileConnectionProvider,
                                                 Ci.nsICellBroadcastProvider,
                                                 Ci.nsIVoicemailProvider,
                                                 Ci.nsIIccProvider]}),

  updateDebugFlag: function() {
    try {
      DEBUG = Services.prefs.getBoolPref(kPrefRilDebuggingEnabled);
    } catch (e) {}
  },

  rilContexts: null,

  getRilContext: function(clientId) {
    return this.rilContexts[clientId];
  },

  /**
   * nsIIccProvider
   */

  getIccInfo: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.iccInfo;
  },

  getCardState: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.cardState;
  },

  matchMvno: function(clientId, window, mvnoType, mvnoData) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * nsIMobileConnectionProvider
   */

  getLastKnownNetwork: function(clientId) {
    return "310-260";
  },

  getLastKnownHomeNetwork: function(clientId) {
    return "310-260-Android";
  },

  getVoiceConnectionInfo: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.voiceConnectionInfo;
  },

  getDataConnectionInfo: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.dataConnectionInfo;
  },

  getIccId: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.iccInfo && context.iccInfo.iccid;
  },

  getNetworkSelectionMode: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.networkSelectionMode;
  },

  getRadioState: function(clientId) {
    let context = this.getRilContext(clientId);
    return context && context.radioState;
  },

  getSupportedNetworkTypes: function(clientId) {
    return "gsm,wcdma";
  },

  getNetworks: function(clientId, window) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    this.dispatchFireRequestSuccess(requestId, []);
    return request;
  },

  selectNetwork: function(clientId, window, network) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    if (!network ||
        isNaN(parseInt(network.mcc, 10)) || isNaN(parseInt(network.mnc, 10))) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    if (this.rilContexts[clientId].voiceConnectionInfo.network === network) {
      // Already manually selected this network, so schedule
      // onsuccess to be fired on the next tick
      this.dispatchFireRequestSuccess(requestId, null);
    } else {
      this.dispatchFireRequestError(requestId, "GenericFailure");
    }

    return request;
  },

  selectNetworkAutomatically: function(clientId, window) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    this.dispatchFireRequestSuccess(requestId, null);
    return request;
  },

  _preferredNetworkTypes: null,
  _getPreferredNetworkType: function(clientId) {
    if (!this._preferredNetworkTypes) {
      this._preferredNetworkTypes = {};
    }
    if (!this._preferredNetworkTypes[clientId]) {
      this._preferredNetworkTypes[clientId] = "wcdma/gsm";
    }
    return this._preferredNetworkTypes[clientId];
  },

  setPreferredNetworkType: function(clientId, window, type) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    let radioState = this.rilContexts[clientId].radioState;
    if (radioState !== "enabled") {
      this.dispatchFireRequestError(requestId, "RadioNotAvailable");
      return request;
    }

    if (["wcdma/gsm", "gsm", "wcdma", "wcdma/gsm-auto", "cdma/evdo",
         "cdma", "evdo", "wcdma/gsm/cdma/evdo", "lte/cdma/evdo",
         "lte/wcdma/gsm", "lte/wcdma/gsm/cdma/evdo", "lte"].IndexOf(type) < 0) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    this._getPreferredNetworkType(clientId);
    this._preferredNetworkTypes[clientId] = type;
    this.dispatchFireRequestSuccess(requestId, null);

    return request;
  },

  getPreferredNetworkType: function(clientId, window) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    let radioState = this.rilContexts[clientId].radioState;
    if (radioState !== "enabled") {
      this.dispatchFireRequestError(requestId, "RadioNotAvailable");
      return request;
    }

    let type = this._getPreferredNetworkType(clientId);
    this.dispatchFireRequestSuccess(requestId, type);

    return request;
  },

  _roamingPreference: null,
  setRoamingPreference: function(clientId, window, mode) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    if (!mode || ["home", "affiliated", "any"].indexOf(mode) < 0) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    this._roamingPreference = mode;
    this.dispatchFireRequestSuccess(requestId, null);
    return request;
  },

  getRoamingPreference: function(clientId, window) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    this.dispatchFireRequestSuccess(requestId, this._roamingPreference);
    return request;
  },

  _voicePrivacyMode: false,
  setVoicePrivacyMode: function(clientId, window, enabled) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    this._voicePrivacyMode = enabled;
    this.dispatchFireRequestSuccess(requestId, null);
    return request;
  },

  getVoicePrivacyMode: function(clientId, window) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    this.dispatchFireRequestSuccess(requestId, this._voicePrivacyMode);
    return request;
  },

  getCardLockState: function(clientId, window, lockType) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    this.dispatchFireRequestSuccess(requestId,
                                    new MobileIccCardLockResult({
      lockType: lockType,
      enabled: false,
      retryCount: 3,
      success: true,
    }));
    return request;
  },

  unlockCardLock: function(clientId, window, info) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    this.dispatchFireRequestSuccess(requestId,
                                    new MobileIccCardLockResult({
      lockType: info.lockType,
      enabled: false,
      retryCount: 3,
      success: true,
    }));
    return request;
  },

  setCardLock: function(clientId, window, info) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    let error = new window.IccCardLockError(info.lockType,
                                            "GenericFailure",
                                            3);
    this._dispatchLater(this.fireRequestDetailedError.bind(this, error));
    return request;
  },

  getCardLockRetryCount: function(clientId, window, lockType) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    this.dispatchFireRequestSuccess(requestId,
                                    new MobileIccCardLockRetryCount({
      lockType: lockType,
      retryCount: 3,
      success: true,
    }));
    return request;
  },

  sendMMI: function(clientId, window, mmi) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  cancelMMI: function(clientId, window) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  sendStkResponse: function(clientId, window, command, response) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  sendStkMenuSelection: function(clientId, window, itemIdentifier,
                                 helpRequested) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  sendStkTimerExpiration: function(clientId, window, timer) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  sendStkEventDownload: function(clientId, window, event) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  iccOpenChannel: function(clientId, window, aid) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  iccExchangeAPDU: function(clientId, window, channel, apdu) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  iccCloseChannel: function(clientId, window, channel) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  readContacts: function(clientId, window, contactType) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    this.dispatchFireRequestSuccess(requestId, []);
    return request;
  },

  updateContact: function(clientId, window, contactType, contact, pin2) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }

    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);
    this.dispatchFireRequestError(requestId, "GenericFailure");

    return request;
  },

  getCallForwarding: function(clientId, window, reason) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    if (!this._isValidCallForwardingReason(reason)) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  setCallForwarding: function(clientId, window, options) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    if (!options ||
        !this._isValidCallForwardingReason(options.reason) ||
        !this._isValidCallForwardingAction(options.action)) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  getCallBarring: function(clientId, window, options) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    if (DEBUG) debug("getCallBarring: " + JSON.stringify(options));
    if (!this._isValidCallBarringOptions(options)) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  setCallBarring: function(clientId, window, options) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    if (DEBUG) debug("setCallBarringOptions: " + JSON.stringify(options));
    if (!this._isValidCallBarringOptions(options, true)) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  changeCallBarringPassword: function(clientId, window, info) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    // Checking valid PIN for supplementary services. See TS.22.004 clause 5.2.
    if (info.pin == null || !info.pin.match(/^\d{4}$/) ||
        info.newPin == null || !info.newPin.match(/^\d{4}$/)) {
      this.dispatchFireRequestError(requestId, "InvalidPassword");
      return request;
    }

    if (DEBUG) debug("changeCallBarringPassword: " + JSON.stringify(info));
    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  getCallWaiting: function(clientId, window) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  setCallWaiting: function(clientId, window, enabled) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  getCallingLineIdRestriction: function(clientId, window) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    let radioState = this.rilContexts[clientId].radioState;
    if (radioState !== "enabled") {
      this.dispatchFireRequestError(requestId, "RadioNotAvailable");
      return request;
    }

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  setCallingLineIdRestriction: function(clientId, window, clirMode) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    let radioState = this.rilContexts[clientId].radioState;
    if (radioState !== "enabled") {
      this.dispatchFireRequestError(requestId, "RadioNotAvailable");
      return request;
    }

    if (!this._isValidClirMode(clirMode)) {
      this.dispatchFireRequestError(requestId, "InvalidParameter");
      return request;
    }

    this.dispatchFireRequestError(requestId, "GenericFailure");
    return request;
  },

  exitEmergencyCbMode: function(clientId, window) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  setRadioEnabled: function(clientId, window, enabled) {
    if (window == null) {
      throw Components.Exception("Can't get window object",
                                  Cr.NS_ERROR_UNEXPECTED);
    }
    let request = Services.DOMRequest.createRequest(window);
    let requestId = this.getRequestId(request);

    if (enabled) {
      this.dispatchFireRequestSuccess(requestId, null);
    } else {
      this.dispatchFireRequestError(requestId, "GenericFailure");
    }
    return request;
  },

  voicemailInfos: null,
  voicemailStatuses: null,

  voicemailDefaultServiceId: 0,
  getVoicemailDefaultServiceId: function() {
    let id = Services.prefs.getIntPref(kPrefVoicemailDefaultServiceId);

    if (id >= this.numClients || id < 0) {
      id = 0;
    }

    return id;
  },

  getVoicemailInfo: function(clientId) {
    return this.voicemailInfos[clientId];
  },

  getVoicemailNumber: function(clientId) {
    return this.getVoicemailInfo(clientId).number;
  },

  getVoicemailDisplayName: function(clientId) {
    return this.getVoicemailInfo(clientId).displayName;
  },

  getVoicemailStatus: function(clientId) {
    return this.voicemailStatuses[clientId];
  },

  registerMobileConnectionMsg: function(clientId, listener) {
    if (DEBUG) debug("Registering for mobile connection related messages");
  },

  unregisterMobileConnectionMsg: function(clientId, listener) {
  },

  registerVoicemailMsg: function(listener) {
    if (DEBUG) debug("Registering for voicemail-related messages");
  },

  unregisterVoicemailMsg: function(listener) {
  },

  registerCellBroadcastMsg: function(listener) {
    if (DEBUG) debug("Registering for Cell Broadcast related messages");
  },

  unregisterCellBroadcastMsg: function(listener) {
  },

  registerIccMsg: function(clientId, listener) {
    if (DEBUG) debug("Registering for ICC related messages");
  },

  unregisterIccMsg: function(clientId, listener) {
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

  fireRequestSuccess: function(requestId, result) {
    let request = this.takeRequest(requestId);
    if (!request) {
      if (DEBUG) {
        debug("not firing success for id: " + requestId +
              ", result: " + JSON.stringify(result));
      }
      return;
    }

    if (DEBUG) {
      debug("fire request success, id: " + requestId +
            ", result: " + JSON.stringify(result));
    }
    Services.DOMRequest.fireSuccess(request, result);
  },

  _dispatchLater: function(func) {
    let currentThread = Services.tm.currentThread;
    currentThread.dispatch(func, Ci.nsIThread.DISPATCH_NORMAL);
  },

  dispatchFireRequestSuccess: function(requestId, result) {
    this._dispatchLater(this.fireRequestSuccess.bind(this, requestId, result));
  },

  fireRequestError: function(requestId, error) {
    let request = this.takeRequest(requestId);
    if (!request) {
      if (DEBUG) {
        debug("not firing error for id: " + requestId +
              ", error: " + JSON.stringify(error));
      }
      return;
    }

    if (DEBUG) {
      debug("fire request error, id: " + requestId +
            ", result: " + JSON.stringify(error));
    }
    Services.DOMRequest.fireError(request, error);
  },

  dispatchFireRequestError: function(requestId, error) {
    this._dispatchLater(this.fireRequestError.bind(this, requestId, error));
  },

  fireRequestDetailedError: function(requestId, detailedError) {
    let request = this.takeRequest(requestId);
    if (!request) {
      if (DEBUG) {
        debug("not firing detailed error for id: " + requestId +
              ", detailedError: " + JSON.stringify(detailedError));
      }
      return;
    }

    Services.DOMRequest.fireDetailedError(request, detailedError);
  },

  /**
   * Helper for guarding us against invalid reason values for call forwarding.
   */
  _isValidCallForwardingReason: function(reason) {
    switch (reason) {
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_REASON_UNCONDITIONAL:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_REASON_MOBILE_BUSY:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_REASON_NO_REPLY:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_REASON_NOT_REACHABLE:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_REASON_ALL_CALL_FORWARDING:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_REASON_ALL_CONDITIONAL_CALL_FORWARDING:
        return true;
      default:
        return false;
    }
  },

  /**
   * Helper for guarding us against invalid action values for call forwarding.
   */
  _isValidCallForwardingAction: function(action) {
    switch (action) {
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_ACTION_DISABLE:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_ACTION_ENABLE:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_ACTION_REGISTRATION:
      case Ci.nsIMobileConnectionProvider.CALL_FORWARD_ACTION_ERASURE:
        return true;
      default:
        return false;
    }
  },

  /**
   * Helper for guarding us against invalid program values for call barring.
   */
  _isValidCallBarringProgram: function(program) {
    switch (program) {
      case Ci.nsIMobileConnectionProvider.CALL_BARRING_PROGRAM_ALL_OUTGOING:
      case Ci.nsIMobileConnectionProvider.CALL_BARRING_PROGRAM_OUTGOING_INTERNATIONAL:
      case Ci.nsIMobileConnectionProvider.CALL_BARRING_PROGRAM_OUTGOING_INTERNATIONAL_EXCEPT_HOME:
      case Ci.nsIMobileConnectionProvider.CALL_BARRING_PROGRAM_ALL_INCOMING:
      case Ci.nsIMobileConnectionProvider.CALL_BARRING_PROGRAM_INCOMING_ROAMING:
        return true;
      default:
        return false;
    }
  },

  /**
   * Helper for guarding us against invalid options for call barring.
   */
  _isValidCallBarringOptions: function(options, usedForSetting) {
    if (!options ||
        options.serviceClass == null ||
        !this._isValidCallBarringProgram(options.program)) {
      return false;
    }

    // For setting callbarring options, |enabled| and |password| are required.
    if (usedForSetting && (options.enabled == null || options.password == null)) {
      return false;
    }

    return true;
  },

  /**
   * Helper for guarding us against invalid mode for clir.
   */
  _isValidClirMode: function(mode) {
    switch (mode) {
      case Ci.nsIMobileConnectionProvider.CLIR_DEFAULT:
      case Ci.nsIMobileConnectionProvider.CLIR_INVOCATION:
      case Ci.nsIMobileConnectionProvider.CLIR_SUPPRESSION:
        return true;
      default:
        return false;
    }
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([RILContentHelper,
                                                     IccCardLockError]);
