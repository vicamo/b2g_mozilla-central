/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Radio Interface Layer (RIL) server actors.
 *
 * This file provides server actors that communicate with Firefox OS
 * Simulator. So far only a voicecalls enumerator is included. These
 * actors talk to several chrome services that implement simulator
 * specific interfaces like nsISimulatorTelephonyService as well as
 * generic backend interfaces like nsITelephonyService.
 */

"use strict";

const {Cc, Ci, Cu} = require("chrome");

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const events = require("sdk/event/core");
const {on, once, off, emit} = events;
const protocol = require("devtools/server/protocol");
const {method, Arg, RetVal} = protocol;

/**
 * See nsITelephonyService.CALL_PRESENTATION_*.
 */
const CALL_PRESENTATION_STRINGS = [
  "allowed", "restricted", "unknown", "payphone"
];

/**
 * See nsITelephonyService.CALL_STATE_*.
 */
const CALL_STATE_STRINGS = [
  "unknown", "dialing", "alerting", "connecting", "connected", "holding",
  "held", "resuming", "disconnecting", "disconnected", "incoming"
];

/**
 * Data type representing a voicecall. Used in VoicecallsActor.
 */
protocol.types.addDictType("voicecall", {
  clientId: "number", // 0..n
  callIndex: "number", // 1..n
  number: "string", // Phone number string.
  state: "string", // CALL_STATE_STRINGS
  direction: "string", // "incoming" or "outgoing".
  emergency: "boolean",
  conference: "boolean",
});

/**
 * Telephony events listener.
 */
function TelephonyListener(aActor) {
  this._actor = aActor;
}
TelephonyListener.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsITelephonyListener]),

  _actor: null,
  _callsEnumerating: null,

  _calls: null,
  get calls() {
    return this._calls;
  },

  callStateChanged: function(aClientId, aCallIndex, aCallState, aNumber,
                             aNumberPresentation, aName, aNamePresentation,
                             aIsOutgoing, aIsEmergency, aIsConference,
                             aIsSwitchable, aIsMergeable) {
    events.emit(this._actor, "voicecall-state-changed", {
      clientId: aClientId,
      callIndex: aCallIndex,
      number: aNumber,
      state: CALL_STATE_STRINGS[aCallState],
      direction: (aIsOutgoing ? "outgoing" : "incoming"),
      emergency: aIsEmergency,
      conference: aIsConference,
    });
  },

  conferenceCallStateChanged: function(aCallState) {
    // FIXME: conference support
  },

  enumerateCallStateComplete: function() {
    if (this._callsEnumerating) {
      this._calls = this._callsEnumerating;
      this._callsEnumerating = null;
    } else {
      this._calls = [];
    }
  },

  enumerateCallState: function(aClientId, aCallIndex, aCallState, aNumber,
                               aNumberPresentation, aName, aNamePresentation,
                               aIsOutgoing, aIsEmergency, aIsConference,
                               aIsSwitchable, aIsMergeable) {
    if (!this._callsEnumerating) {
      this._callsEnumerating = [];
    }

    this._callsEnumerating.push({
      clientId: aClientId,
      callIndex: aCallIndex,
      number: aNumber,
      numberPresentation: CALL_PRESENTATION_STRINGS[aNumberPresentation],
      name: aName || "",
      namePresentation: CALL_PRESENTATION_STRINGS[aNamePresentation],
      state: CALL_STATE_STRINGS[aCallState],
      direction: (aIsOutgoing ? "outgoing" : "incoming"),
      emergency: aIsEmergency,
      conference: aIsConference,
    });
  },

  supplementaryServiceNotification: function() {
    // Not interested.
  },

  notifyError: function(aClientId, aCallIndex, aErrorMessage) {
    events.emit(this._actor, "voicecall-error",
                aClientId, aCallIndex, aErrorMessage);
  },

  notifyCdmaCallWaiting: function() {
    // FIXME: CDMA support
  },

  notifyConferenceError: function() {
    // FIXME: conference support
  },

  /**
   * Static helper function for listener registration.
   */
  register: function(aTelephonyService, aActor) {
    let listener = new TelephonyListener(aActor);
    try {
      aTelephonyService.registerListener(listener);
    } catch(e) {
      listener = null;
    }
    return listener;
  }
};

/**
 * Creates a VoicecallsActor. VoicecallsActor provides remote management to
 * voice calls.
 */
let VoicecallsActor = protocol.ActorClass({
  typeName: "voicecalls",

  /**
   * Events emitted by this actor.
   */
  events: {
    "voicecall-state-changed": {
      type: "voicecallStateChanged",
      voicecall: Arg(0, "voicecall"),
    },

    "voicecall-error": {
      type: "voicecallError",
      clientId: Arg(0, "number"),
      callIndex: Arg(1, "number"),
      errorMessage: Arg(2, "string"),
    },
  },

  destroy: function() {
    if (this._service) {
      if (this._listener) {
        this._service.unregisterListener(this._listener);
        this._listener = null;
      }
      this._service = null;
    }

    protocol.Actor.prototype.destroy.call(this);
  },

  _service: null,
  _listener: null,
  _getService: function() {
    if (this._service) {
      return this._service;
    }

    this._service = Cc["@mozilla.org/telephony/telephonyservice;1"]
                    .getService(Ci.nsITelephonyService);
    if (this._service) {
      this._listener =
        TelephonyListener.prototype.register(this._service, this);
    }

    return this._service;
  },

  _getSimulatorService: function() {
    let service = this._getService();
    return service && service.QueryInterface(Ci.nsISimulatorTelephonyService);
  },

  /**
   * Enumerate all voicecalls.
   *
   * @return An array of voicecalls.
   */
  getAll: method(function() {
    let service = this._getService();
    if (!service) {
      return [];
    }

    let listener = new TelephonyListener(null);
    service.enumerateCalls(listener);
    return listener.calls;
  }, {
    response: {
      value: RetVal("array:voicecall"),
    },
  }),

  /**
   * Simulate an incoming call.
   *
   * @param aClientId
   *        A numeric id for identifying the target modem instance.
   * @param aNumber
   *        A phone number string.
   * @param aNumberPresentation [optional]
   *        One of the CALL_PRESENTATION_STRINGS except "payphone".
   * @param aName [optional]
   *        A caller ID string.
   * @param aNamePresentation [optional]
   *        One of the CALL_PRESENTATION_STRINGS.
   *
   * @return A string "OK" if succeeded, or other strings indicating the error.
   */
  dialCall: method(function(aClientId, aNumber, aNumberPresentation,
                            aName, aNamePresentation) {
    let service = this._getSimulatorService();
    if (!service) {
      return "NotImplemented";
    }

    let numberPresentation =
      CALL_PRESENTATION_STRINGS.indexOf(aNumberPresentation || "allowed");
    if (numberPresentation < 0 || numberPresentation >= 3) {
      return "InvalidParameter";
    }

    let namePresentation =
      CALL_PRESENTATION_STRINGS.indexOf(aNamePresentation || "allowed");

    try {
      service.notifyRemoteIncoming(aClientId, aNumber, numberPresentation,
                                   aName, namePresentation);
    } catch(e) {
      return e.message;
    }

    return "OK";
  }, {
    request: {
      clientIndex: Arg(0, "number"),
      number: Arg(1, "string"),
      numberPresentation: Arg(2, "nullable:string"),
      name: Arg(3, "nullable:string"),
      namePresentation: Arg(4, "nullable:string"),
    },

    response: {
      value: RetVal("string"),
    },
  }),

  /**
   * Simulate an outgoing call being accepted from remote side.
   *
   * @param aClientId
   *        A numeric id for identifying the target modem instance.
   * @param aCallIndex
   *        A numeric call index.
   *
   * @return A string "OK" if succeeded, or other strings indicating the error.
   */
  acceptCall: method(function(aClientId, aCallIndex) {
    let service = this._getSimulatorService();
    if (!service) {
      return "NotImplemented";
    }

    try {
      service.notifyRemoteAccepted(aClientId, aCallIndex);
    } catch(e) {
      return e.message;
    }

    return "OK";
  }, {
    request: {
      clientIndex: Arg(0, "number"),
      callIndex: Arg(1, "number"),
    },

    response: {
      value: RetVal("string"),
    },
  }),

  /**
   * Simulate an outgoing call being hang up from remote side.
   *
   * @param aClientId
   *        A numeric id for identifying the target modem instance.
   * @param aCallIndex
   *        A numeric call index.
   * @param aFailCause [optional]
   *        One of GECKO_CALL_ERROR_* defined in ril_consts.js. Use
   *        "NormalCallClearingError" for normal call termination.
   *
   * @return A string "OK" if succeeded, or other strings indicating the error.
   */
  hangUpCall: method(function(aClientId, aCallIndex, aFailCause) {
    let service = this._getSimulatorService();
    if (!service) {
      return "NotImplemented";
    }

    try {
      service.notifyRemoteHangUp(aClientId, aCallIndex, aFailCause);
    } catch(e) {
      return e.message;
    }

    return "OK";
  }, {
    request: {
      clientIndex: Arg(0, "number"),
      callIndex: Arg(1, "number"),
      failCause: Arg(2, "nullable:string"),
    },

    response: {
      value: RetVal("string"),
    },
  })
}); // End of VoicecallsActor.

let VoicecallsFront = protocol.FrontClass(VoicecallsActor, {
  initialize: function(client, form) {
    protocol.Front.prototype.initialize.call(this, client);
    this.actorID = form.voicecallsActor;
    this.manage(this);
  },
});

exports.register = function(handle) {
  handle.addGlobalActor(VoicecallsActor, "voicecallsActor");
};

exports.unregister = function(handle) {
};

const _knownVoicecallsFronts = new WeakMap();

exports.getVoicecallsFront = function(client, form) {
  if (_knownVoicecallsFronts.has(client))
    return _knownVoicecallsFronts.get(client);

  let front = new VoicecallsFront(client, form);
  _knownVoicecallsFronts.set(client, front);
  return front;
}
