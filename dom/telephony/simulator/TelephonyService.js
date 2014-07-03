/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Promise.jsm");

const SIMULATOR_TELEPHONYSERVICE_CONTRACTID =
  "@mozilla.org/telephony/simulatortelephonyservice;1";
const SIMULATOR_TELEPHONYSERVICE_CID =
  Components.ID("{b3cf68c9-f32c-4193-b5ab-88243828124f}");

const NS_PREFBRANCH_PREFCHANGE_TOPIC_ID = "nsPref:changed";

const kPrefRilNumRadioInterfaces = "ril.numRadioInterfaces";
const kPrefRilDebuggingEnabled = "ril.debugging.enabled";
const kPrefDefaultServiceId = "dom.telephony.defaultServiceId";

const nsITelephonyService = Ci.nsITelephonyService;

const CALL_ERROR_NORMAL_CALL_CLEARING = "NormalCallClearingError";
const CALL_ERROR_BAD_NUMBER_ERROR = "BadNumberError";
const CALL_ERROR_INVALID_STATE_ERROR = "InvalidStateError";
const CALL_ERROR_OTHER_CONNECTION_IN_USE = "OtherConnectionInUse";

let DEBUG;
function debug(s) {
  dump("TelephonyService: " + s + "\n");
}

XPCOMUtils.defineLazyServiceGetter(this, "gSystemMessenger",
                                   "@mozilla.org/system-message-internal;1",
                                   "nsISystemMessagesInternal");

XPCOMUtils.defineLazyServiceGetter(this, "gUUIDGenerator",
                                   "@mozilla.org/uuid-generator;1",
                                   "nsIUUIDGenerator");

XPCOMUtils.defineLazyGetter(this, "gPhoneNumberUtils", function() {
  let ns = {};
  Cu.import("resource://gre/modules/PhoneNumberUtils.jsm", ns);
  return ns.PhoneNumberUtils;
});

const DEFAULT_EMERGENCY_NUMBERS = ["112", "911"];

function isEmergencyNumber(aNumber) {
  return DEFAULT_EMERGENCY_NUMBERS.indexOf(aNumber) != -1;
}

const RIL_CALL_STATE_ACTIVE = 0;
const RIL_CALL_STATE_HOLDING = 1;
const RIL_CALL_STATE_DIALING = 2;
const RIL_CALL_STATE_ALERTING = 3;
const RIL_CALL_STATE_INCOMING = 4;
const RIL_CALL_STATE_WAITING = 5;
const RIL_CALL_STATE_DISCONNECTED = 6;

function convertRilCallState(aRilCallState) {
  switch (aRilCallState) {
    case RIL_CALL_STATE_DISCONNECTED:
      return nsITelephonyService.CALL_STATE_DISCONNECTED;
    case RIL_CALL_STATE_ACTIVE:
      return nsITelephonyService.CALL_STATE_CONNECTED;
    case RIL_CALL_STATE_HOLDING:
      return nsITelephonyService.CALL_STATE_HELD;
    case RIL_CALL_STATE_DIALING:
      return nsITelephonyService.CALL_STATE_DIALING;
    case RIL_CALL_STATE_ALERTING:
      return nsITelephonyService.CALL_STATE_ALERTING;
    case RIL_CALL_STATE_INCOMING:
    case RIL_CALL_STATE_WAITING:
      return nsITelephonyService.CALL_STATE_INCOMING;
    default:
      throw new Error("Unknown RIL call state: " + aRilCallState);
  }
}

function PhoneCall(aUuid) {
  this.uuid = aUuid || gUUIDGenerator.generateUUID().toString();
}
PhoneCall.prototype = {
  uuid: null,
  callIndex: null,
  domState: null,
  rilState: null,
  number: null,
  numberPresentation: nsITelephonyService.CALL_PRESENTATION_ALLOWED,
  name: null,
  namePresentation: nsITelephonyService.CALL_PRESENTATION_ALLOWED,
  isOutgoing: false,
  isEmergency: false,
  isConference: false,
  startTime: 0,
};

function CallManager(aTelephonyService, aClientId) {
  this._service = aTelephonyService;
  this._clientId = aClientId;

  this._calls = {};
}
CallManager.prototype = {
  _service: null,
  _clientId: null,

  /**
   * { callIndex1: call1, callIndex2: call2, ... }
   */
  _calls: null,

  _notifyCallStateChanged: function(aCall) {
    this._service.notifyCallStateChanged(this._clientId, aCall);
  },

  _notifyCallError: function(aCall, aFailCause) {
    this._service.notifyCallError(this._clientId, aCall.callIndex, aFailCause);
  },

  _notifyConferenceCallStateChanged: function(aDomCallState) {
    this._service.notifyConferenceCallStateChanged(aDomCallState);
  },

  _notifyConferenceError: function(aErrorName, aErrorMessage) {
    this._service.notifyConferenceError(aErrorName, aErrorMessage);
  },

  _notifySuppNotification: function(aCall, aSuppNotification) {
    this._service.notifySuppNotification(this._clientId, aCall.callIndex,
                                         aSuppNotification);
  },

  _broadcastTelephonyNewCall: function() {
    this._service.broadcastTelephonyNewCall();
  },

  _broadcastTelephonyEndCall: function(aCall) {
    this._service.broadcastTelephonyEndCall(this._clientId, aCall);
  },

  _getCallByIndex: function(aCallIndex) {
    return this._calls[aCallIndex];
  },

  _findCallById: function(aUuid) {
    for (let callIndex in this._calls) {
      let call = this._getCallByIndex(callIndex);
      if (call.uuid === aUuid) {
        return call;
      }
    }

    return null;
  },

  /**
   * Update |call.rilState| and |call.domState| simultaneously.
   */
  _setCallState: function(aCall, aRilCallState) {
    aCall.rilState = aRilCallState;
    aCall.domState = convertRilCallState(aRilCallState);
  },

  /**
   * Prerequisites:
   *   A valid PhoneCall object with its number/rilState/domState correctly
   *   set.
   *
   * Effect:
   *   1. Assign an unused call index and add to |this._calls| map.
   *   2. Broadcast a "telephony-new-call" system message.
   *   3. Dispatch a "callStateChanged" event on that call object.
   */
  _addCall: function(aCall) {
    let callIndex = 1;
    while (this._calls[callIndex]) {
      ++callIndex;
    }
    aCall.callIndex = callIndex;
    this._calls[callIndex] = aCall;

    this._broadcastTelephonyNewCall();
    this._notifyCallStateChanged(aCall);
  },

  /**
   * Prerequisites:
   *   A valid aCall object.
   *
   * Effect:
   *   1. Remove the call from calls pool and dispatch either a call error or a
   *      "callStateChanged" event on it.
   *   2. validate conference calls and, if necessary, dispatch a
   *      "callStateChanged" event on the orphan call and a
   *      "conferenceCallStateChanged" event.
   */
  _removeCall: function(aCall, aFailCause) {
    let wasConference = aCall.isConference;
    aCall.isConference = false;
    this._setCallState(aCall, RIL_CALL_STATE_DISCONNECTED);

    delete this._calls[aCall.callIndex];
    this._broadcastTelephonyEndCall(aCall);
    if (aFailCause &&
        aFailCause !== "" &&
        aFailCause !== CALL_ERROR_NORMAL_CALL_CLEARING) {
      this._notifyCallError(aCall, aFailCause);
    } else {
      this._notifyCallStateChanged(aCall);
    }

    if (!wasConference) {
      return;
    }

    let conferenceCalls = [];
    for (let callIndex in this._calls) {
      let call = this._getCallByIndex(callIndex);
      if (call.isConference) {
        conferenceCalls.push(call);
      }
    }

    if (conferenceCalls.length >= 2) {
      // Conference is still valid. Return.
      return;
    }

    // We have only one call in the conference call.
    let orphanCall = conferenceCalls[0];
    orphanCall.isConference = false;
    this._notifyCallStateChanged(orphanCall);

    this._notifyConferenceCallStateChanged(nsITelephonyService.CALL_STATE_UNKNOWN);
  },

  /**
   * Prerequisites:
   *   One or more holding calls, or one waiting call.
   *
   * Effect:
   *   1. Places all active calls (if any exist) on hold and accepts the other
   *      (held or waiting) call. "callStateChanged" events are dispatched on
   *      modified calls.
   *   2. Throws if there are both holding and waiting calls.
   */
  _switchWaitingOrHoldingAndActive: function() {
    let hasHolding = false, hasWaiting = false;
    for (let callIndex in this._calls) {
      let call = this._getCallByIndex(callIndex);
      if (call.rilState === RIL_CALL_STATE_WAITING) {
        hasWaiting = true;
      } else if (call.rilState === RIL_CALL_STATE_HOLDING) {
        hasHolding = true;
      }
    }

    if (hasHolding && hasWaiting) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    let modifiedCalls = [];

    for (let callIndex in this._calls) {
      let call = this._getCallByIndex(callIndex);
      if (call.rilState === RIL_CALL_STATE_ACTIVE) {
        this._setCallState(call, RIL_CALL_STATE_HOLDING);
        modifiedCalls.push(call);
      } else if (call.rilState === RIL_CALL_STATE_HOLDING ||
                 call.rilState === RIL_CALL_STATE_WAITING) {
        this._setCallState(call, RIL_CALL_STATE_ACTIVE);
        modifiedCalls.push(call);
      }
    }

    modifiedCalls.forEach(this._notifyCallStateChanged, this);
  },

  /**
   * Hold or resume conference call.
   *
   * Prerequisites:
   *   A conferece call in specified state.
   *
   * Effect:
   *   1. Throw if the prerequisite is not met.
   *   2. Call to _switchWaitingOrHoldingAndActive() to switch call states.
   *   3. Dispatch a "conferenceCallStateChanged" event.
   */
  _holdResumeConference: function(aRilCallState) {
    let conferenceCall;
    for (let callIndex in this._calls) {
      let call = this._getCallByIndex(callIndex);
      if (call.isConference && call.rilState === aRilCallState) {
        conferenceCall = call;
        break;
      }
    }

    if (!conferenceCall) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    // This may throw if there is a waiting call.
    this._switchWaitingOrHoldingAndActive();

    this._notifyConferenceCallStateChanged(conferenceCall.domState);
  },

  /**
   * Run a task function later in current thread.
   */
  _runLater: function(aCallback) {
    let currentThread = Services.tm.currentThread;
    currentThread.dispatch(aCallback, Ci.nsIThread.DISPATCH_NORMAL);
  },

  _setCallStateAndNotifyLater: function(aCall, aRilCallState) {
    this._runLater((function() {
      // Re-retrieve the call because it might have been removed.
      let call = this._findCallById(aCall.uuid);
      if (!call) {
        return;
      }

      this._setCallState(call, aRilCallState);
      this._notifyCallStateChanged(call);
    }).bind(this));
  },

  /**
   * Enumerate all calls.
   */
  enumerateCalls: function(aListener) {
    for (let callIndex in this._calls) {
      let call = this._getCallByIndex(callIndex);
      aListener.enumerateCallState(this._clientId,
                                   call.callIndex,
                                   call.domState,
                                   call.number,
                                   call.numberPresentation,
                                   call.name,
                                   call.namePresentation,
                                   call.isOutgoing,
                                   call.isEmergency,
                                   call.isConference,
                                   true, /* call.isSwitchable */
                                   true /* call.isMergeable*/);
    }
  },

  hasCalls: function() {
    return Object.keys(this._calls).length !== 0;
  },

  // All calls in the conference is regarded as one conference call.
  getNumIndependentCalls: function() {
    let numCalls = 0;
    let hasConference = false;

    for (let callIndex in this._calls) {
      if (this._getCallByIndex(callIndex).isConference) {
        hasConference = true;
      } else {
        numCalls++;
      }
    }

    return hasConference ? numCalls + 1 : numCalls;
  },

  dialCall: function(aNumber, aIsEmergency, aCallback) {
    this._runLater((function() {
      let newCall = new PhoneCall();
      newCall.number = aNumber;
      newCall.isOutgoing = true;
      newCall.isEmergency = isEmergencyNumber(aNumber);
      this._setCallState(newCall, RIL_CALL_STATE_DIALING);
      this._addCall(newCall);

      aCallback({ callIndex: newCall.callIndex });

      // DIALING => ALERTING
      this._setCallStateAndNotifyLater(newCall, RIL_CALL_STATE_ALERTING);
    }).bind(this));
  },

  /**
   * Hang up a call.
   */
  hangUpCall: function(aCallIndex) {
    let targetCall = this._getCallByIndex(aCallIndex);
    if (!targetCall) {
      return;
    }

    this._runLater((function(aUuid) {
      let call = this._findCallById(aUuid);
      if (!call) {
        // If the call has been hangup, abort the operation.
        return;
      }

      this._removeCall(call, null);
    }).bind(this, targetCall.uuid));
  },

  /**
   * Answer an incoming/waiting call.
   *
   * If the call specified by aCallIndex has rilState RIL_CALL_STATE_INCOMING,
   * it's updated as connected because that means there is no any other active
   * or holding call.
   *
   * Otherwise, call to |_switchWaitingOrHoldingAndActive|.
   */
  answerCall: function(aCallIndex) {
    let targetCall = this._getCallByIndex(aCallIndex);
    if (!targetCall) {
      return;
    }

    this._runLater((function(aUuid) {
      let call = this._findCallById(aUuid);
      if (!call ||
          (call.rilState !== RIL_CALL_STATE_INCOMING &&
           call.rilState !== RIL_CALL_STATE_WAITING)) {
        // If the call has been hangup or answered, abort the operation.
        return;
      }

      if (call.rilState === RIL_CALL_STATE_INCOMING) {
        // We have |call.rilState| equals to RIL_CALL_STATE_INCOMING only when
        // There is no other active or holding calls. Just update rilState to
        // active.
        this._setCallState(call, RIL_CALL_STATE_ACTIVE);
        this._notifyCallStateChanged(call);
        return;
      }

      try {
        this._switchWaitingOrHoldingAndActive();
      } catch(e) {
        // There are both holding and waiting calls. Ignore this error.
      }
    }).bind(this, targetCall.uuid));
  },

  /**
   * Reject an incoming/waiting call.
   */
  rejectCall: function(aCallIndex) {
    let targetCall = this._getCallByIndex(aCallIndex);
    if (!targetCall) {
      return;
    }

    this._runLater((function(aUuid) {
      let call = this._findCallById(aUuid);
      if (!call ||
          (call.rilState !== RIL_CALL_STATE_INCOMING &&
           call.rilState !== RIL_CALL_STATE_WAITING)) {
        // If the call has been hangup or answered, abort the operation.
        return;
      }

      this._removeCall(call, null);
    }).bind(this, targetCall.uuid));
  },

  /**
   * Put an active call on hold and resum other holding calls or the waiting
   * call.
   */
  holdCall: function(aCallIndex) {
    let targetCall = this._getCallByIndex(aCallIndex);
    if (!targetCall) {
      return;
    }

    this._runLater((function(aUuid) {
      let call = this._findCallById(aUuid);
      if (!call || call.rilState !== RIL_CALL_STATE_ACTIVE) {
        return;
      }

      try {
        this._switchWaitingOrHoldingAndActive();
      } catch(e) {
        // There are both holding and waiting calls. Ignore this error.
      }
    }).bind(this, targetCall.uuid));
  },

  /**
   * Resume a holding call.
   */
  resumeCall: function(aCallIndex) {
    let targetCall = this._getCallByIndex(aCallIndex);
    if (!targetCall) {
      return;
    }

    this._runLater((function(aUuid) {
      let call = this._findCallById(aUuid);
      if (!call || call.rilState !== RIL_CALL_STATE_HOLDING) {
        return;
      }

      try {
        this._switchWaitingOrHoldingAndActive();
      } catch(e) {
        // There are both holding and waiting calls. Ignore this error.
      }
    }).bind(this, targetCall.uuid));
  },

  /**
   * Create conference call.
   *
   * Prerequisites:
   *   At least one holding and one active call.
   *
   * Effect:
   *   1. Notify "addError" if there is the prerequisite is not met.
   *   2. Set isConference flag to all holding and active calls and set their
   *      states as active. Dispatch "callStateChanged" event on all modified
   *      calls as well as one "conferenceCallStateChanged" event.
   */
  mergeCalls: function() {
    this._runLater((function() {
      let hasHolding = false, hasActive = false;
      let numCalls = 0;
      for (let callIndex in this._calls) {
        let call = this._getCallByIndex(callIndex);
        if (call.rilState === RIL_CALL_STATE_HOLDING) {
          hasHolding = true;
        } else if (call.rilState === RIL_CALL_STATE_ACTIVE) {
          hasActive = true;
        }
      }

      if (!hasHolding || !hasActive) {
        this._notifyConferenceError("addError", "GenericFailure");
        return;
      }

      let modifiedCalls = [];
      for (let callIndex in this._calls) {
        let call = this._getCallByIndex(callIndex);
        if (call.rilState === RIL_CALL_STATE_HOLDING) {
          call.isConference = true;
          this._setCallState(call, RIL_CALL_STATE_ACTIVE);

          modifiedCalls.push(call);
        } else if (call.rilState === RIL_CALL_STATE_ACTIVE &&
                   !call.isConference) {
          call.isConference = true;
          modifiedCalls.push(call);
        }
      }

      modifiedCalls.forEach(this._notifyCallStateChanged, this);

      this._notifyConferenceCallStateChanged(nsITelephonyService.CALL_STATE_CONNECTED);
    }).bind(this));
  },

  /**
   * Separate a call from an active conference.
   *
   * Prerequisites:
   *   A active call in conference.
   *
   * Effect:
   *   1. Notify "removeError" if there is the prerequisite is not met.
   *   2. Set the isConference flag to false and dispatch a "callStateChanged"
   *      event on the specified call.
   *   3. Put all other conference calls in held. If there is only one call
   *      remains in conference, set its isConference flag to false as well.
   *      Dispatch a "callStateChanged" event on each of modified calls.
   *      Dispatch a "conferenceCallStateChanged" event.
   */
  separateCall: function(aCallIndex) {
    let targetCall = this._getCallByIndex(aCallIndex);
    if (!targetCall) {
      return;
    }

    this._runLater((function(aUuid) {
      let separatedCall = this._getCallById(aUuid);
      if (!separatedCall ||
          !separatedCall.isConference ||
          separatedCall.rilState !== RIL_CALL_STATE_ACTIVE) {
        this._notifyConferenceError("removeError", "GenericFailure");
        return;
      }

      // If there are already some calls in held, abort.
      for (let callIndex in this._calls) {
        let call = this._getCallByIndex(callIndex);
        if (call.rilState === RIL_CALL_STATE_HOLDING) {
          this._notifyConferenceError("removeError", "GenericFailure");
          return;
        }
      }

      let modifiedCalls = [];
      for (let callIndex in this._calls) {
        let call = this._getCallByIndex(callIndex);
        if (call.isConference && call.callIndex !== separatedCall.callIndex) {
          this._setCallState(call, RIL_CALL_STATE_HOLDING);
          modifiedCalls.push(call);
        }
      }

      let conferenceState = nsITelephonyService.CALL_STATE_HELD;
      if (modifiedCalls.length === 1) {
        // Separating the last two conference calls will automatically destroy
        // the conference.
        conferenceState = nsITelephonyService.CALL_STATE_UNKNOWN;
        modifiedCalls[0].isConference = false;
      }

      separatedCall.isConference = false;
      modifiedCalls.push(separatedCall);

      modifiedCalls.forEach(this._notifyCallStateChanged, this);

      this._notifyConferenceCallStateChanged(conferenceState);
    }).bind(this, targetCall.uuid));
  },

  /**
   * Hold an active conference call.
   */
  holdConference: function() {
    this._runLater(this._holdResumeConference.bind(this, RIL_CALL_STATE_ACTIVE));
  },

  /**
   * Hold a holding conference call.
   */
  resumeConference: function() {
    this._runLater(this._holdResumeConference.bind(this, RIL_CALL_STATE_HOLDING));
  },

  /**
   * Effect:
   *   1. Throw if there is already an incoming or waiting call.
   *   2. Add a new call to calls pool.  Set its state to incoming if there is
   *      no other calls exist; otherwise waiting.
   */
  createIncomingCall: function(aNumber, aNumberPresentation, aName,
                               aNamePresentation) {
    let hasCall = false;
    for (let callIndex in this._calls) {
      let call = this._getCallByIndex(callIndex);
      if (call.rilState === RIL_CALL_STATE_INCOMING ||
          call.rilState === RIL_CALL_STATE_WAITING) {
        // Can't have yet another unanswered incoming call.
        throw Cr.NS_ERROR_UNEXPECTED;
      }
      hasCall = true;
    }

    let call = new PhoneCall();
    call.number = aNumber;
    call.numberPresentation = aNumberPresentation;
    call.name = aName;
    call.namePresentation = aNamePresentation;

    let rilCallState = hasCall ? RIL_CALL_STATE_WAITING
                               : RIL_CALL_STATE_INCOMING;
    this._setCallState(call, rilCallState);

    this._addCall(call);
  },

  notifyRemoteAccepted: function(aCallIndex) {
    let call = this._getCallByIndex(aCallIndex);
    if (!call) {
      throw Cr.NS_ERROR_INVALID_ARG; // No such call found.
    }

    if (call.rilState !== RIL_CALL_STATE_ALERTING) {
      throw Cr.NS_ERROR_UNEXPECTED; // Invalid state.
    }

    // DIALING/ALERTING => CONNECTED.
    this._setCallState(call, RIL_CALL_STATE_ACTIVE);
    this._notifyCallStateChanged(call);
  },

  notifyRemoteHangUp: function(aCallIndex, aFailCause) {
    let call = this._getCallByIndex(aCallIndex);
    if (!call) {
      throw Cr.NS_ERROR_INVALID_ARG; // No such call found.
    }

    this._removeCall(call, aFailCause);
  },

  notifySupplementaryService: function(aCallIndex, aNotification) {
    let call = this._getCallByIndex(aCallIndex);
    if (!call) {
      throw Cr.NS_ERROR_INVALID_ARG; // No such call found.
    }

    this._notifySuppNotification(call, aNotification);
  }
};

function TelephonyService() {
  this._numClients = (function() {
    try {
      return Services.prefs.getIntPref(kPrefRilNumRadioInterfaces);
    } catch(e) {
      return 1;
    }
  })();
  this._listeners = [];

  this._updateDebugFlag();
  this.defaultServiceId = this._getDefaultServiceId();

  Services.prefs.addObserver(kPrefRilDebuggingEnabled, this, false);
  Services.prefs.addObserver(kPrefDefaultServiceId, this, false);

  this._callManagers = [];
  for (let clientId = 0; clientId < this._numClients; ++clientId) {
    this._callManagers.push(new CallManager(this, clientId));
  }
}
TelephonyService.prototype = {
  classID: SIMULATOR_TELEPHONYSERVICE_CID,
  classInfo: XPCOMUtils.generateCI({classID: SIMULATOR_TELEPHONYSERVICE_CID,
                                    contractID: SIMULATOR_TELEPHONYSERVICE_CONTRACTID,
                                    classDescription: "TelephonyService",
                                    interfaces: [Ci.nsITelephonyService,
                                                 Ci.nsISimulatorTelephonyService],
                                    flags: Ci.nsIClassInfo.SINGLETON}),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsITelephonyService,
                                         Ci.nsISimulatorTelephonyService,
                                         Ci.nsIObserver]),

  // An array of nsITelephonyListener instances.
  _listeners: null,
  _notifyAllListeners: function(aMethodName, aArgs) {
    let listeners = this._listeners.slice();
    for (let listener of listeners) {
      if (this._listeners.indexOf(listener) === -1) {
        // Listener has been unregistered in previous run.
        continue;
      }

      let handler = listener[aMethodName];
      try {
        handler.apply(listener, aArgs);
      } catch (e) {
        debug("listener for " + aMethodName + " threw an exception: " + e);
      }
    }
  },

  notifyCallStateChanged: function(aClientId, aCall) {
    this._notifyAllListeners("callStateChanged",
                             [aClientId,
                              aCall.callIndex,
                              aCall.domState,
                              aCall.number,
                              aCall.numberPresentation,
                              aCall.name,
                              aCall.namePresentation,
                              aCall.isOutgoing,
                              aCall.isEmergency,
                              aCall.isConference,
                              true, /* aCall.isSwitchable */
                              true /* aCall.isMergeable */]);
  },

  notifyCallError: function(aClientId, aCallIndex, aFailCause) {
    this._notifyAllListeners("notifyError",
                             [aClientId, aCallIndex, aFailCause]);
  },

  notifyConferenceCallStateChanged: function(aDomCallState) {
    this._notifyAllListeners("conferenceCallStateChanged",
                             [aDomCallState]);
  },

  notifyConferenceError: function(aErrorName, aErrorMessage) {
    this._notifyAllListeners("notifyConferenceError",
                             [aErrorName, aErrorMessage]);
  },

  notifySuppNotification: function(aClientId, aCallIndex, aSuppNotification) {
    this._notifyAllListeners("supplementaryServiceNotification",
                             [aClientId, aCallIndex, aSuppNotification]);
  },

  broadcastTelephonyNewCall: function() {
    gSystemMessenger.broadcastMessage("telephony-new-call", {});
  },

  broadcastTelephonyEndCall: function(aClientId, aCall) {
    let duration = 0;
    if (aCall.startTime) {
      duration = new Date().getTime() - aCall.startTime;
    }

    let data = {
      number: aCall.number,
      serviceId: aClientId,
      emergency: aCall.isEmergency,
      duration: duration,
      direction: aCall.isOutgoing ? "outgoing" : "incoming"
    };
    gSystemMessenger.broadcastMessage("telephony-call-ended", data);
  },

  _callManagers: null,

  _updateDebugFlag: function() {
    try {
      DEBUG = Services.prefs.getBoolPref(kPrefRilDebuggingEnabled);
    } catch (e) {}
  },

  _getDefaultServiceId: function() {
    let id = Services.prefs.getIntPref(kPrefDefaultServiceId);
    if (id >= this._numClients || id < 0) {
      id = 0;
    }

    return id;
  },

  /**
   * nsITelephonyService interface.
   */

  defaultServiceId: 0,

  registerListener: function(aListener) {
    if (this._listeners.indexOf(aListener) >= 0) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    this._listeners.push(aListener);
  },

  unregisterListener: function(aListener) {
    let index = this._listeners.indexOf(aListener);
    if (index < 0) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    this._listeners.splice(index, 1);
  },

  enumerateCalls: function(aListener) {
    if (DEBUG) debug("Requesting enumeration of calls for callback");

    this._callManagers.forEach(function(aCallManager) {
      aCallManager.enumerateCalls(aListener);
    });

    aListener.enumerateCallStateComplete();
  },

  _hasCallsOnOtherClient: function(aClientId) {
    for (let clientId = 0; clientId < this._numClients; ++clientId) {
      if (clientId !== aClientId &&
          this._callManagers[clientId].hasCalls()) {
        return true;
      }
    }
    return false;
  },

  isDialing: false,
  dial: function(aClientId, aNumber, aIsEmergency, aTelephonyCallback) {
    if (DEBUG) debug("Dialing " + (aIsEmergency ? "emergency " : "") + aNumber);

    if (this.isDialing) {
      if (DEBUG) debug("Error: Already has a dialing call.");
      aTelephonyCallback.notifyDialError(CALL_ERROR_INVALID_STATE_ERROR);
      return;
    }

    // Select a proper clientId for dialEmergency.
    if (aIsEmergency) {
      // FIXME: choose a powered RadioInterface from MobileConnection API.
      aClientId = 0;
      if (aClientId === -1) {
        if (DEBUG) debug("Error: No client is avaialble for emergency call.");
        aTelephonyCallback.notifyDialError(CALL_ERROR_INVALID_STATE_ERROR);
        return;
      }
    }

    // For DSDS, if there is aleady a call on SIM 'aClientId', we cannot place
    // any new call on other SIM.
    if (this._hasCallsOnOtherClient(aClientId)) {
      if (DEBUG) debug("Error: Already has a call on other sim.");
      aTelephonyCallback.notifyDialError(CALL_ERROR_OTHER_CONNECTION_IN_USE);
      return;
    }

    // We can only have at most two calls on the same line (client).
    if (this._callManagers[aClientId].getNumIndependentCalls() >= 2) {
      if (DEBUG) debug("Error: Has more than 2 calls on line.");
      aTelephonyCallback.notifyDialError(CALL_ERROR_INVALID_STATE_ERROR);
      return;
    }

    // We don't try to be too clever here, as the phone is probably in the
    // locked state. Let's just check if it's a number without normalizing
    if (!aIsEmergency) {
      aNumber = gPhoneNumberUtils.normalize(aNumber);
    }

    // Validate the number.
    if (!gPhoneNumberUtils.isPlainPhoneNumber(aNumber)) {
      // Note: isPlainPhoneNumber also accepts USSD and SS numbers
      if (DEBUG) debug("Number '" + aNumber + "' is not viable. Drop.");
      aTelephonyCallback.notifyDialError(CALL_ERROR_BAD_NUMBER_ERROR);
      return;
    }

    this.isDialing = true;
    this._callManagers[aClientId].dialCall(aNumber, aIsEmergency,
                                           (function(aResult) {
      this.isDialing = false;
      if (aResult.errorMsg) {
        aTelephonyCallback.notifyDialError(aResult.errorMsg);
      } else {
        aTelephonyCallback.notifyDialSuccess(aResult.callIndex);
      }
    }).bind(this));
  },

  hangUp: function(aClientId, aCallIndex) {
    this._callManagers[aClientId].hangUpCall(aCallIndex);
  },

  startTone: function(aClientId, aDtmfChar) {
    // Do nothing.
  },

  stopTone: function(aClientId) {
    // Do nothing.
  },

  answerCall: function(aClientId, aCallIndex) {
    this._callManagers[aClientId].answerCall(aCallIndex);
  },

  rejectCall: function(aClientId, aCallIndex) {
    this._callManagers[aClientId].rejectCall(aCallIndex);
  },

  holdCall: function(aClientId, aCallIndex) {
    this._callManagers[aClientId].holdCall(aCallIndex);
  },

  resumeCall: function(aClientId, aCallIndex) {
    this._callManagers[aClientId].resumeCall(aCallIndex);
  },

  conferenceCall: function(aClientId) {
    this._callManagers[aClientId].mergeCalls();
  },

  separateCall: function(aClientId, aCallIndex) {
    this._callManagers[aClientId].separateCall(aCallIndex);
  },

  holdConference: function(aClientId) {
    this._callManagers[aClientId].holdConference();
  },

  resumeConference: function(aClientId) {
    this._callManagers[aClientId].resumeConference();
  },

  microphoneMuted: false,

  speakerEnabled: false,

  /**
   * nsISimulatorTelephonyService interface.
   */

  notifyRemoteIncoming: function(aClientId, aNumber, aNumberPresentation,
                                 aName, aNamePresentation) {
    this._callManagers[aClientId]
        .createIncomingCall(aNumber, aNumberPresentation,
                            aName, aNamePresentation);
  },

  notifyRemoteAccepted: function(aClientId, aCallIndex) {
    this._callManagers[aClientId].notifyRemoteAccepted(aCallIndex);
  },

  notifyRemoteHangUp: function(aClientId, aCallIndex, aFailCause) {
    this._callManagers[aClientId].notifyRemoteHangUp(aCallIndex, aFailCause);
  },

  notifySupplementaryService: function(aClientId, aCallIndex,
                                       aSuppNotification) {
    this._callManagers[aClientId]
        .notifySuppNotification(aCallIndex, aSuppNotification);
  },

  /**
   * nsIObserver interface.
   */

  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case NS_PREFBRANCH_PREFCHANGE_TOPIC_ID:
        if (aData === kPrefRilDebuggingEnabled) {
          this._updateDebugFlag();
        } else if (aData === kPrefDefaultServiceId) {
          this.defaultServiceId = this._getDefaultServiceId();
        }
        break;
    }
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([TelephonyService]);
