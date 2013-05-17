/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * vim: sw=2 ts=2 sts=2 et filetype=javascript
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyGetter(this, "RIL", function () {
  let obj = {};
  Cu.import("resource://gre/modules/ril_consts.js", obj);
  return obj;
});

XPCOMUtils.defineLazyGetter(this, "WAP", function() {
  let wap = {};
  Cu.import("resource://gre/modules/WapPushManager.js", wap);
  return wap;
});

XPCOMUtils.defineLazyGetter(this, "PhoneNumberUtils", function() {
  let ns = {};
  Cu.import("resource://gre/modules/PhoneNumberUtils.jsm", ns);
  return ns.PhoneNumberUtils;
});

XPCOMUtils.defineLazyServiceGetter(this, "gPowerManagerService",
                                   "@mozilla.org/power/powermanagerservice;1",
                                   "nsIPowerManagerService");

XPCOMUtils.defineLazyServiceGetter(this, "gMobileMessageService",
                                   "@mozilla.org/mobilemessage/mobilemessageservice;1",
                                   "nsIMobileMessageService");

XPCOMUtils.defineLazyServiceGetter(this, "gMobileMessageDatabaseService",
                                   "@mozilla.org/mobilemessage/mobilemessagedatabaseservice;1",
                                   "nsIRilMobileMessageDatabaseService");

XPCOMUtils.defineLazyServiceGetter(this, "gSystemMessenger",
                                   "@mozilla.org/system-message-internal;1",
                                   "nsISystemMessagesInternal");

XPCOMUtils.defineLazyServiceGetter(this, "gMobileConnectionService",
                                   "@mozilla.org/mobileconnection/mobileconnectionservice;1",
                                   "nsIMobileConnectionService");

XPCOMUtils.defineLazyServiceGetter(this, "gIccProvider",
                                   "@mozilla.org/ril/content-helper;1",
                                   "nsIIccProvider");

const GONK_SMSSERVICE_CONTRACTID =
  "@mozilla.org/mobilemessage/gonksmsservice;1";
const GONK_SMSSERVICE_CID =
  Components.ID("{819124d5-80c3-42f2-8a62-d61165aba936}");

const kSmsReceivedObserverTopic          = "sms-received";
const kSilentSmsReceivedObserverTopic    = "silent-sms-received";
const kSmsSendingObserverTopic           = "sms-sending";
const kSmsSentObserverTopic              = "sms-sent";
const kSmsFailedObserverTopic            = "sms-failed";
const kSmsDeliverySuccessObserverTopic   = "sms-delivery-success";
const kSmsDeliveryErrorObserverTopic     = "sms-delivery-error";

const kPrefRilDebuggingEnabled = "ril.debugging.enabled";

const DOM_MOBILE_MESSAGE_DELIVERY_RECEIVED = "received";
const DOM_MOBILE_MESSAGE_DELIVERY_SENDING  = "sending";
const DOM_MOBILE_MESSAGE_DELIVERY_SENT     = "sent";
const DOM_MOBILE_MESSAGE_DELIVERY_ERROR    = "error";

const SMS_HANDLED_WAKELOCK_TIMEOUT = 5000;

let DEBUG;
function debug(s) {
  dump("SmsService: " + s + "\n");
}

function SmsService() {
  this._receivedSegmentsMap = new Map();

  Services.prefs.addObserver(kPrefRilDebuggingEnabled, this, false);
  this._updateDebugFlag();
}

SmsService.prototype = {
  classID: GONK_SMSSERVICE_CID,
  classInfo: XPCOMUtils.generateCI({
    classID: GONK_SMSSERVICE_CID,
    contractID: GONK_SMSSERVICE_CONTRACTID,
    classDescription: "SmsService",
    interfaces: [
      Ci.nsIGonkSmsService,
      Ci.nsISmsService
    ],
    flags: Ci.nsIClassInfo.SINGLETON
  }),
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIGonkSmsService,
    Ci.nsISmsService,
    Ci.nsIObserver
  ]),

  _updateDebugFlag: function() {
    try {
      DEBUG = RIL.DEBUG_RIL ||
              Services.prefs.getBoolPref(kPrefRilDebuggingEnabled);
    } catch (e) {}
  },

  /**
   * Get phone number from iccInfo.
   *
   * If the icc card is gsm card, the phone number is in msisdn.
   * @see nsIDOMMozGsmIccInfo
   *
   * Otherwise, the phone number is in mdn.
   * @see nsIDOMMozCdmaIccInfo
   */
  _getPhoneNumber: function(aServiceId) {
    let iccInfo = gIccProvider.getIccInfo(aServiceId);
    if (!iccInfo) {
      return null;
    }

    // After moving SMS code out of RadioInterfaceLayer, we could use
    // |iccInfo instanceof Ci.nsIDOMMozGsmIccInfo| here.
    // TODO: Bug 873351 - B2G SMS: move SMS code out of RadioInterfaceLayer to
    //                    SmsService
    let number = (iccInfo instanceof GsmIccInfo) ? iccInfo.msisdn : iccInfo.mdn;

    // Workaround an xpconnect issue with undefined string objects.
    // See bug 808220
    if (number === undefined || number === "undefined") {
      return null;
    }

    return number;
  },

  /**
   * A utility function to get the ICC ID of the SIM card (if installed).
   */
  _getIccId: function(aServiceId) {
    let iccInfo = gIccProvider.getIccInfo(aServiceId);
    if (!iccInfo) {
      return null;
    }

    let iccId = iccInfo.iccid;

    // Workaround an xpconnect issue with undefined string objects.
    // See bug 808220
    if (iccId === undefined || iccId === "undefined") {
      return null;
    }

    return iccId;
  },

  _handlePortAddressedMessage: function(message) {
    switch (message.destinationPort) {
      case WAP.WDP_PORT_PUSH:
        this._handleWdpPortPush(message);
        break;

      default:
        if (DEBUG) {
          debug("Unhandled port addressed message for " + message.destinationPort);
        }
        break;
    }
  },

  /**
   * Handle WDP port push PDU. Constructor WDP bearer information and deliver
   * to WapPushManager.
   *
   * @param message
   *        A SMS message.
   */
  _handleWdpPortPush: function(message) {
    if (message.encoding != RIL.PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
      if (DEBUG) {
        this.debug("Got port addressed SMS but not encoded in 8-bit alphabet." +
                   " Drop!");
      }
      return;
    }

    let options = {
      bearer: WAP.WDP_BEARER_GSM_SMS_GSM_MSISDN,
      sourceAddress: message.sender,
      sourcePort: message.originatorPort,
      destinationAddress: this._getPhoneNumber(message.serviceId),
      destinationPort: message.destinationPort,
      serviceId: message.serviceId
    };
    WAP.WapPushManager.receiveWdpPDU(message.fullData, message.fullData.length,
                                     0, options);
  },

  /**
   * A helper to broadcast the system message to launch registered apps
   * like Costcontrol, Notification and Message app... etc.
   *
   * @param aName
   *        The system message name.
   * @param aDomMessage
   *        The nsIDOMMozSmsMessage object.
   */
  _broadcastSystemMessage: function(aName, aDomMessage) {
    if (DEBUG) this.debug("Broadcasting the SMS system message: " + aName);

    // Sadly we cannot directly broadcast the aDomMessage object
    // because the system message mechamism will rewrap the object
    // based on the content window, which needs to know the properties.
    gSystemMessenger.broadcastMessage(aName, {
      iccId:             aDomMessage.iccId,
      type:              aDomMessage.type,
      id:                aDomMessage.id,
      threadId:          aDomMessage.threadId,
      delivery:          aDomMessage.delivery,
      deliveryStatus:    aDomMessage.deliveryStatus,
      sender:            aDomMessage.sender,
      receiver:          aDomMessage.receiver,
      body:              aDomMessage.body,
      messageClass:      aDomMessage.messageClass,
      timestamp:         aDomMessage.timestamp,
      sentTimestamp:     aDomMessage.sentTimestamp,
      deliveryTimestamp: aDomMessage.deliveryTimestamp,
      read:              aDomMessage.read
    });
  },

  // The following attributes/functions are used for acquiring/releasing the
  // CPU wake lock when the RIL handles the received SMS. Note that we need
  // a timer to bound the lock's life cycle to avoid exhausting the battery.
  _handledWakeLock: null,
  _handledWakeLockTimer: null,

  _acquireHandledWakeLock: function() {
    if (!this._handledWakeLock) {
      if (DEBUG) this.debug("Acquiring a CPU wake lock for handling SMS.");
      this._handledWakeLock = gPowerManagerService.newWakeLock("cpu");
    }
    if (!this._handledWakeLockTimer) {
      if (DEBUG) this.debug("Creating a timer for releasing the CPU wake lock.");
      this._handledWakeLockTimer =
        Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    }
    if (DEBUG) this.debug("Setting the timer for releasing the CPU wake lock.");
    this._handledWakeLockTimer
        .initWithCallback(this._releaseHandledWakeLock.bind(this),
                          SMS_HANDLED_WAKELOCK_TIMEOUT,
                          Ci.nsITimer.TYPE_ONE_SHOT);
  },

  _releaseHandledWakeLock: function() {
    if (DEBUG) this.debug("Releasing the CPU wake lock for handling SMS.");
    if (this._handledWakeLockTimer) {
      this._handledWakeLockTimer.cancel();
    }
    if (this._handledWakeLock) {
      this._handledWakeLock.unlock();
      this._handledWakeLock = null;
    }
  },

  /**
   * Hash map for received multipart sms fragments. Messages are hashed with
   * its sender address and concatenation reference number. Three additional
   * attributes `segmentMaxSeq`, `receivedSegments`, `segments` are inserted.
   */
  _receivedSegmentsMap: null,

  /**
   * Helper for processing received multipart SMS.
   *
   * @return null for handled segments, and an object containing full message
   *         body/data once all segments are received.
   */
  _processReceivedSegment: function(aSegment) {

    // Directly replace full message body for single SMS.
    if (!(aSegment.segmentMaxSeq && (aSegment.segmentMaxSeq > 1))) {
      if (aSegment.encoding == RIL.PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
        aSegment.fullData = aSegment.data;
      } else {
        aSegment.fullBody = aSegment.body;
      }
      return aSegment;
    }

    // Handle Concatenation for Class 0 SMS
    let hash = aSegment.sender + ":" +
               aSegment.segmentRef + ":" +
               aSegment.segmentMaxSeq;
    let seq = aSegment.segmentSeq;

    let options = this._receivedSegmentsMap.get(hash);
    if (!options) {
      options = aSegment;
      this._receivedSegmentsMap.set(hash, options);

      options.receivedSegments = 0;
      options.segments = [];
    } else if (options.segments[seq]) {
      // Duplicated segment?
      if (DEBUG) {
        this.debug("Got duplicated segment no." + seq +
                           " of a multipart SMS: " + JSON.stringify(aSegment));
      }
      return null;
    }

    if (options.receivedSegments > 0) {
      // Update received timestamp.
      options.timestamp = aSegment.timestamp;
    }

    if (options.encoding == RIL.PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
      options.segments[seq] = aSegment.data;
    } else {
      options.segments[seq] = aSegment.body;
    }
    options.receivedSegments++;

    // The port information is only available in 1st segment for CDMA WAP Push.
    // If the segments of a WAP Push are not received in sequence
    // (e.g., SMS with seq == 1 is not the 1st segment received by the device),
    // we have to retrieve the port information from 1st segment and
    // save it into the cached options.
    if (aSegment.teleservice === RIL.PDU_CDMA_MSG_TELESERIVCIE_ID_WAP
        && seq === 1) {
      if (!options.originatorPort && aSegment.originatorPort) {
        options.originatorPort = aSegment.originatorPort;
      }

      if (!options.destinationPort && aSegment.destinationPort) {
        options.destinationPort = aSegment.destinationPort;
      }
    }

    if (options.receivedSegments < options.segmentMaxSeq) {
      if (DEBUG) {
        this.debug("Got segment no." + seq + " of a multipart SMS: " +
                           JSON.stringify(options));
      }
      return null;
    }

    // Remove from map
    this._receivedSegmentsMap.delete(hash);

    // Rebuild full body
    if (options.encoding == RIL.PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
      // Uint8Array doesn't have `concat`, so we have to merge all segements
      // by hand.
      let fullDataLen = 0;
      for (let i = 1; i <= options.segmentMaxSeq; i++) {
        fullDataLen += options.segments[i].length;
      }

      options.fullData = new Uint8Array(fullDataLen);
      for (let d= 0, i = 1; i <= options.segmentMaxSeq; i++) {
        let data = options.segments[i];
        for (let j = 0; j < data.length; j++) {
          options.fullData[d++] = data[j];
        }
      }
    } else {
      options.fullBody = options.segments.join("");
    }

    // Remove handy fields after completing the concatenation.
    delete options.receivedSegments;
    delete options.segments;

    if (DEBUG) {
      this.debug("Got full multipart SMS: " + JSON.stringify(options));
    }

    return options;
  },

  /**
   * Helper to create savable SMS segment.
   */
  _createSavableSegment: function(aMessage) {
    // We precisely define what data fields to be stored into
    // DB here for better data migration.
    let segment = {};
    segment.messageType = aMessage.messageType;
    segment.teleservice = aMessage.teleservice;
    segment.SMSC = aMessage.SMSC;
    segment.sentTimestamp = aMessage.sentTimestamp;
    segment.timestamp = Date.now();
    segment.sender = aMessage.sender;
    segment.pid = aMessage.pid;
    segment.encoding = aMessage.encoding;
    segment.messageClass = aMessage.messageClass;
    segment.iccId = this._getIccId(aMessage.serviceId);
    if (aMessage.header) {
      segment.segmentRef = aMessage.header.segmentRef;
      segment.segmentSeq = aMessage.header.segmentSeq;
      segment.segmentMaxSeq = aMessage.header.segmentMaxSeq;
      segment.originatorPort = aMessage.header.originatorPort;
      segment.destinationPort = aMessage.header.destinationPort;
    }
    segment.mwiPresent = (aMessage.mwi)? true: false;
    segment.mwiDiscard = (segment.mwiPresent)? aMessage.mwi.discard: false;
    segment.mwiMsgCount = (segment.mwiPresent)? aMessage.mwi.msgCount: 0;
    segment.mwiActive = (segment.mwiPresent)? aMessage.mwi.active: false;
    segment.serviceCategory = aMessage.serviceCategory;
    segment.language = aMessage.language;
    segment.data = aMessage.data;
    segment.body = aMessage.body;

    return segment;
  },

  /**
   * Helper to purge complete message.
   *
   * We remove unnessary fields defined in _createSavableSegment() after
   * completing the concatenation.
   */
  _purgeCompleteMessage: function(aMessage) {
    // Purge concatenation info
    delete aMessage.segmentRef;
    delete aMessage.segmentSeq;
    delete aMessage.segmentMaxSeq;

    // Purge partial message body
    delete aMessage.data;
    delete aMessage.body;
  },

  /**
   * handle concatenation of received SMS.
   */
  handleMultipart: function(aMessage) {
    if (DEBUG) this.debug("handleMultipart: " + JSON.stringify(aMessage));

    this._acquireHandledWakeLock();

    let segment = this._createSavableSegment(aMessage);

    let isMultipart = (segment.segmentMaxSeq && (segment.segmentMaxSeq > 1));
    let messageClass = segment.messageClass;

    let handleReceivedAndAck = function(aRvOfIncompleteMsg, aCompleteMessage) {
      if (aCompleteMessage) {
        this._purgeCompleteMessage(aCompleteMessage);
        if (this.handleReceived(aCompleteMessage)) {
          this.sendAckSms(Cr.NS_OK, aCompleteMessage);
        }
        // else Ack will be sent after further process in handleReceived.
      } else {
        this.sendAckSms(aRvOfIncompleteMsg, segment);
      }
    }.bind(this);

    // No need to access SmsSegmentStore for Class 0 SMS and Single SMS.
    if (!isMultipart ||
        (messageClass == RIL.GECKO_SMS_MESSAGE_CLASSES[RIL.PDU_DCS_MSG_CLASS_0])) {
      // `When a mobile terminated message is class 0 and the MS has the
      // capability of displaying short messages, the MS shall display the
      // message immediately and send an acknowledgement to the SC when the
      // message has successfully reached the MS irrespective of whether
      // there is memory available in the (U)SIM or ME. The message shall
      // not be automatically stored in the (U)SIM or ME.`
      // ~ 3GPP 23.038 clause 4

      handleReceivedAndAck(Cr.NS_OK,  // ACK OK For Incomplete Class 0
                           this._processReceivedSegment(segment));
    } else {
      gMobileMessageDatabaseService
        .saveSmsSegment(segment, function notifyResult(aRv, aCompleteMessage) {
        handleReceivedAndAck(aRv,  // Ack according to the result after saving
                             aCompleteMessage);
      });
    }
  },

  handleReceived: function(message) {
    if (DEBUG) this.debug("handleReceived: " + JSON.stringify(message));

    if (message.messageType == RIL.PDU_CDMA_MSG_TYPE_BROADCAST) {
      gMessageManager.sendCellBroadcastMessage("RIL:CellBroadcastReceived",
                                               this.clientId, message);
      return true;
    }

    // Dispatch to registered handler if application port addressing is
    // available. Note that the destination port can possibly be zero when
    // representing a UDP/TCP port.
    if (message.destinationPort != null) {
      this._handlePortAddressedMessage(message);
      return true;
    }

    if (message.encoding == RIL.PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
      // Don't know how to handle binary data yet.
      return true;
    }

    message.type = "sms";
    message.sender = message.sender || null;
    message.receiver = this._getPhoneNumber(message.serviceId);
    message.body = message.fullBody = message.fullBody || null;

    if (gSmsService.isSilentNumber(message.sender)) {
      message.id = -1;
      message.threadId = 0;
      message.delivery = DOM_MOBILE_MESSAGE_DELIVERY_RECEIVED;
      message.deliveryStatus = RIL.GECKO_SMS_DELIVERY_STATUS_SUCCESS;
      message.read = false;

      let domMessage =
        gMobileMessageService.createSmsMessage(message.id,
                                               message.threadId,
                                               message.iccId,
                                               message.delivery,
                                               message.deliveryStatus,
                                               message.sender,
                                               message.receiver,
                                               message.body,
                                               message.messageClass,
                                               message.timestamp,
                                               message.sentTimestamp,
                                               0,
                                               message.read);

      Services.obs.notifyObservers(domMessage,
                                   kSilentSmsReceivedObserverTopic,
                                   null);
      return true;
    }

    if (message.mwiPresent) {
      let mwi = {
        discard: message.mwiDiscard,
        msgCount: message.mwiMsgCount,
        active: message.mwiActive
      };
      this.workerMessenger.send("updateMwis", { mwi: mwi });

      mwi.returnNumber = message.sender;
      mwi.returnMessage = message.fullBody;
      this.handleIccMwis(mwi);

      // Dicarded MWI comes without text body.
      // Hence, we discard it here after notifying the MWI status.
      if (message.mwiDiscard) {
        return true;
      }
    }

    let notifyReceived = function notifyReceived(rv, domMessage) {
      let success = Components.isSuccessCode(rv);

      this.sendAckSms(rv, message);

      if (!success) {
        // At this point we could send a message to content to notify the user
        // that storing an incoming SMS failed, most likely due to a full disk.
        if (DEBUG) {
          this.debug("Could not store SMS, error code " + rv);
        }
        return;
      }

      this._broadcastSystemMessage(kSmsReceivedObserverTopic, domMessage);
      Services.obs.notifyObservers(domMessage, kSmsReceivedObserverTopic, null);
    }.bind(this);

    if (message.messageClass != RIL.GECKO_SMS_MESSAGE_CLASSES[RIL.PDU_DCS_MSG_CLASS_0]) {
      gMobileMessageDatabaseService.saveReceivedMessage(message,
                                                        notifyReceived);
    } else {
      message.id = -1;
      message.threadId = 0;
      message.delivery = DOM_MOBILE_MESSAGE_DELIVERY_RECEIVED;
      message.deliveryStatus = RIL.GECKO_SMS_DELIVERY_STATUS_SUCCESS;
      message.read = false;

      let domMessage =
        gMobileMessageService.createSmsMessage(message.id,
                                               message.threadId,
                                               message.iccId,
                                               message.delivery,
                                               message.deliveryStatus,
                                               message.sender,
                                               message.receiver,
                                               message.body,
                                               message.messageClass,
                                               message.timestamp,
                                               message.sentTimestamp,
                                               0,
                                               message.read);

      notifyReceived(Cr.NS_OK, domMessage);
    }

    // SMS ACK will be sent in notifyReceived. Return false here.
    return false;
  },

  /**
   * Handle ACK response of received SMS.
   */
  sendAckSms: function(aRv, aMessage) {
    if (aMessage.messageClass === RIL.GECKO_SMS_MESSAGE_CLASSES[RIL.PDU_DCS_MSG_CLASS_2]) {
      return;
    }

    let result = RIL.PDU_FCS_OK;
    if (!Components.isSuccessCode(aRv)) {
      if (DEBUG) this.debug("Failed to handle received sms: " + aRv);
      result = (aRv === Cr.NS_ERROR_FILE_NO_DEVICE_SPACE)
                ? RIL.PDU_FCS_MEMORY_CAPACITY_EXCEEDED
                : RIL.PDU_FCS_UNSPECIFIED;
    }

    this.workerMessenger.send("ackSMS", { result: result });

  },

  /**
   * List of tuples of national language identifier pairs.
   *
   * TODO: Support static/runtime settings, see bug 733331.
   */
  enabledGsmTableTuples: [
    [RIL.PDU_NL_IDENTIFIER_DEFAULT, RIL.PDU_NL_IDENTIFIER_DEFAULT],
  ],

  /**
   * Use 16-bit reference number for concatenated outgoint messages.
   *
   * TODO: Support static/runtime settings, see bug 733331.
   */
  segmentRef16Bit: false,

  /**
   * Get valid SMS concatenation reference number.
   */
  _segmentRef: 0,
  get nextSegmentRef() {
    let ref = this._segmentRef++;

    this._segmentRef %= (this.segmentRef16Bit ? 65535 : 255);

    // 0 is not a valid SMS concatenation reference number.
    return ref + 1;
  },

  /**
   * Calculate encoded length using specified locking/single shift table
   *
   * @param message
   *        message string to be encoded.
   * @param langTable
   *        locking shift table string.
   * @param langShiftTable
   *        single shift table string.
   * @param strict7BitEncoding
   *        Optional. Enable Latin characters replacement with corresponding
   *        ones in GSM SMS 7-bit default alphabet.
   *
   * @return encoded length in septets.
   *
   * @note that the algorithm used in this function must match exactly with
   * GsmPDUHelper#writeStringAsSeptets.
   */
  _countGsm7BitSeptets: function(message, langTable, langShiftTable, strict7BitEncoding) {
    let length = 0;
    for (let msgIndex = 0; msgIndex < message.length; msgIndex++) {
      let c = message.charAt(msgIndex);
      if (strict7BitEncoding) {
        c = RIL.GSM_SMS_STRICT_7BIT_CHARMAP[c] || c;
      }

      let septet = langTable.indexOf(c);

      // According to 3GPP TS 23.038, section 6.1.1 General notes, "The
      // characters marked '1)' are not used but are displayed as a space."
      if (septet == RIL.PDU_NL_EXTENDED_ESCAPE) {
        continue;
      }

      if (septet >= 0) {
        length++;
        continue;
      }

      septet = langShiftTable.indexOf(c);
      if (septet < 0) {
        if (!strict7BitEncoding) {
          return -1;
        }

        // Bug 816082, when strict7BitEncoding is enabled, we should replace
        // characters that can't be encoded with GSM 7-Bit alphabets with '*'.
        c = "*";
        if (langTable.indexOf(c) >= 0) {
          length++;
        } else if (langShiftTable.indexOf(c) >= 0) {
          length += 2;
        } else {
          // We can't even encode a '*' character with current configuration.
          return -1;
        }

        continue;
      }

      // According to 3GPP TS 23.038 B.2, "This code represents a control
      // character and therefore must not be used for language specific
      // characters."
      if (septet == RIL.PDU_NL_RESERVED_CONTROL) {
        continue;
      }

      // The character is not found in locking shfit table, but could be
      // encoded as <escape><char> with single shift table. Note that it's
      // still possible for septet to has the value of PDU_NL_EXTENDED_ESCAPE,
      // but we can display it as a space in this case as said in previous
      // comment.
      length += 2;
    }

    return length;
  },

  /**
   * Calculate user data length of specified message string encoded in GSM 7Bit
   * alphabets.
   *
   * @param message
   *        a message string to be encoded.
   * @param strict7BitEncoding
   *        Optional. Enable Latin characters replacement with corresponding
   *        ones in GSM SMS 7-bit default alphabet.
   *
   * @return null or an options object with attributes `dcs`,
   *         `userDataHeaderLength`, `encodedFullBodyLength`, `langIndex`,
   *         `langShiftIndex`, `segmentMaxSeq` set.
   *
   * @see #_calculateUserDataLength().
   */
  _calculateUserDataLength7Bit: function(message, strict7BitEncoding) {
    let options = null;
    let minUserDataSeptets = Number.MAX_VALUE;
    for (let i = 0; i < this.enabledGsmTableTuples.length; i++) {
      let [langIndex, langShiftIndex] = this.enabledGsmTableTuples[i];

      const langTable = RIL.PDU_NL_LOCKING_SHIFT_TABLES[langIndex];
      const langShiftTable = RIL.PDU_NL_SINGLE_SHIFT_TABLES[langShiftIndex];

      let bodySeptets = this._countGsm7BitSeptets(message,
                                                  langTable,
                                                  langShiftTable,
                                                  strict7BitEncoding);
      if (bodySeptets < 0) {
        continue;
      }

      let headerLen = 0;
      if (langIndex != RIL.PDU_NL_IDENTIFIER_DEFAULT) {
        headerLen += 3; // IEI + len + langIndex
      }
      if (langShiftIndex != RIL.PDU_NL_IDENTIFIER_DEFAULT) {
        headerLen += 3; // IEI + len + langShiftIndex
      }

      // Calculate full user data length, note the extra byte is for header len
      let headerSeptets = Math.ceil((headerLen ? headerLen + 1 : 0) * 8 / 7);
      let segmentSeptets = RIL.PDU_MAX_USER_DATA_7BIT;
      if ((bodySeptets + headerSeptets) > segmentSeptets) {
        headerLen += this.segmentRef16Bit ? 6 : 5;
        headerSeptets = Math.ceil((headerLen + 1) * 8 / 7);
        segmentSeptets -= headerSeptets;
      }

      let segments = Math.ceil(bodySeptets / segmentSeptets);
      let userDataSeptets = bodySeptets + headerSeptets * segments;
      if (userDataSeptets >= minUserDataSeptets) {
        continue;
      }

      minUserDataSeptets = userDataSeptets;

      options = {
        dcs: RIL.PDU_DCS_MSG_CODING_7BITS_ALPHABET,
        encodedFullBodyLength: bodySeptets,
        userDataHeaderLength: headerLen,
        langIndex: langIndex,
        langShiftIndex: langShiftIndex,
        segmentMaxSeq: segments,
        segmentChars: segmentSeptets,
      };
    }

    return options;
  },

  /**
   * Calculate user data length of specified message string encoded in UCS2.
   *
   * @param message
   *        a message string to be encoded.
   *
   * @return an options object with attributes `dcs`, `userDataHeaderLength`,
   *         `encodedFullBodyLength`, `segmentMaxSeq` set.
   *
   * @see #_calculateUserDataLength().
   */
  _calculateUserDataLengthUCS2: function(message) {
    let bodyChars = message.length;
    let headerLen = 0;
    let headerChars = Math.ceil((headerLen ? headerLen + 1 : 0) / 2);
    let segmentChars = RIL.PDU_MAX_USER_DATA_UCS2;
    if ((bodyChars + headerChars) > segmentChars) {
      headerLen += this.segmentRef16Bit ? 6 : 5;
      headerChars = Math.ceil((headerLen + 1) / 2);
      segmentChars -= headerChars;
    }

    let segments = Math.ceil(bodyChars / segmentChars);

    return {
      dcs: RIL.PDU_DCS_MSG_CODING_16BITS_ALPHABET,
      encodedFullBodyLength: bodyChars * 2,
      userDataHeaderLength: headerLen,
      segmentMaxSeq: segments,
      segmentChars: segmentChars,
    };
  },

  /**
   * Calculate user data length and its encoding.
   *
   * @param message
   *        a message string to be encoded.
   * @param strict7BitEncoding
   *        Optional. Enable Latin characters replacement with corresponding
   *        ones in GSM SMS 7-bit default alphabet.
   *
   * @return an options object with some or all of following attributes set:
   *
   * @param dcs
   *        Data coding scheme. One of the PDU_DCS_MSG_CODING_*BITS_ALPHABET
   *        constants.
   * @param userDataHeaderLength
   *        Length of embedded user data header, in bytes. The whole header
   *        size will be userDataHeaderLength + 1; 0 for no header.
   * @param encodedFullBodyLength
   *        Length of the message body when encoded with the given DCS. For
   *        UCS2, in bytes; for 7-bit, in septets.
   * @param langIndex
   *        Table index used for normal 7-bit encoded character lookup.
   * @param langShiftIndex
   *        Table index used for escaped 7-bit encoded character lookup.
   * @param segmentMaxSeq
   *        Max sequence number of a multi-part messages, or 1 for single one.
   *        This number might not be accurate for a multi-part message until
   *        it's processed by #_fragmentText() again.
   */
  _calculateUserDataLength: function(message, strict7BitEncoding) {
    let options = this._calculateUserDataLength7Bit(message, strict7BitEncoding);
    if (!options) {
      options = this._calculateUserDataLengthUCS2(message);
    }

    if (DEBUG) this.debug("_calculateUserDataLength: " + JSON.stringify(options));
    return options;
  },

  /**
   * Fragment GSM 7-Bit encodable string for transmission.
   *
   * @param text
   *        text string to be fragmented.
   * @param langTable
   *        locking shift table string.
   * @param langShiftTable
   *        single shift table string.
   * @param segmentSeptets
   *        Number of available spetets per segment.
   * @param strict7BitEncoding
   *        Optional. Enable Latin characters replacement with corresponding
   *        ones in GSM SMS 7-bit default alphabet.
   *
   * @return an array of objects. See #_fragmentText() for detailed definition.
   */
  _fragmentText7Bit: function(text, langTable, langShiftTable, segmentSeptets, strict7BitEncoding) {
    let ret = [];
    let body = "", len = 0;
    // If the message is empty, we only push the empty message to ret.
    if (text.length === 0) {
      ret.push({
        body: text,
        encodedBodyLength: text.length,
      });
      return ret;
    }

    for (let i = 0, inc = 0; i < text.length; i++) {
      let c = text.charAt(i);
      if (strict7BitEncoding) {
        c = RIL.GSM_SMS_STRICT_7BIT_CHARMAP[c] || c;
      }

      let septet = langTable.indexOf(c);
      if (septet == RIL.PDU_NL_EXTENDED_ESCAPE) {
        continue;
      }

      if (septet >= 0) {
        inc = 1;
      } else {
        septet = langShiftTable.indexOf(c);
        if (septet == RIL.PDU_NL_RESERVED_CONTROL) {
          continue;
        }

        inc = 2;
        if (septet < 0) {
          if (!strict7BitEncoding) {
            throw new Error("Given text cannot be encoded with GSM 7-bit Alphabet!");
          }

          // Bug 816082, when strict7BitEncoding is enabled, we should replace
          // characters that can't be encoded with GSM 7-Bit alphabets with '*'.
          c = "*";
          if (langTable.indexOf(c) >= 0) {
            inc = 1;
          }
        }
      }

      if ((len + inc) > segmentSeptets) {
        ret.push({
          body: body,
          encodedBodyLength: len,
        });
        body = c;
        len = inc;
      } else {
        body += c;
        len += inc;
      }
    }

    if (len) {
      ret.push({
        body: body,
        encodedBodyLength: len,
      });
    }

    return ret;
  },

  /**
   * Fragment UCS2 encodable string for transmission.
   *
   * @param text
   *        text string to be fragmented.
   * @param segmentChars
   *        Number of available characters per segment.
   *
   * @return an array of objects. See #_fragmentText() for detailed definition.
   */
  _fragmentTextUCS2: function(text, segmentChars) {
    let ret = [];
    // If the message is empty, we only push the empty message to ret.
    if (text.length === 0) {
      ret.push({
        body: text,
        encodedBodyLength: text.length,
      });
      return ret;
    }

    for (let offset = 0; offset < text.length; offset += segmentChars) {
      let str = text.substr(offset, segmentChars);
      ret.push({
        body: str,
        encodedBodyLength: str.length * 2,
      });
    }

    return ret;
  },

  /**
   * Fragment string for transmission.
   *
   * Fragment input text string into an array of objects that contains
   * attributes `body`, substring for this segment, `encodedBodyLength`,
   * length of the encoded segment body in septets.
   *
   * @param text
   *        Text string to be fragmented.
   * @param options
   *        Optional pre-calculated option object. The output array will be
   *        stored at options.segments if there are multiple segments.
   * @param strict7BitEncoding
   *        Optional. Enable Latin characters replacement with corresponding
   *        ones in GSM SMS 7-bit default alphabet.
   *
   * @return Populated options object.
   */
  _fragmentText: function(text, options, strict7BitEncoding) {
    if (!options) {
      options = this._calculateUserDataLength(text, strict7BitEncoding);
    }

    if (options.dcs == RIL.PDU_DCS_MSG_CODING_7BITS_ALPHABET) {
      const langTable = RIL.PDU_NL_LOCKING_SHIFT_TABLES[options.langIndex];
      const langShiftTable = RIL.PDU_NL_SINGLE_SHIFT_TABLES[options.langShiftIndex];
      options.segments = this._fragmentText7Bit(text,
                                                langTable, langShiftTable,
                                                options.segmentChars,
                                                strict7BitEncoding);
    } else {
      options.segments = this._fragmentTextUCS2(text,
                                                options.segmentChars);
    }

    // Re-sync options.segmentMaxSeq with actual length of returning array.
    options.segmentMaxSeq = options.segments.length;

    return options;
  },

  getSegmentInfoForText: function(text, request) {
    let strict7BitEncoding;
    try {
      strict7BitEncoding = Services.prefs.getBoolPref("dom.sms.strict7BitEncoding");
    } catch (e) {
      strict7BitEncoding = false;
    }

    let options = this._fragmentText(text, null, strict7BitEncoding);
    let charsInLastSegment;
    if (options.segmentMaxSeq) {
      let lastSegment = options.segments[options.segmentMaxSeq - 1];
      charsInLastSegment = lastSegment.encodedBodyLength;
      if (options.dcs == RIL.PDU_DCS_MSG_CODING_16BITS_ALPHABET) {
        // In UCS2 encoding, encodedBodyLength is in octets.
        charsInLastSegment /= 2;
      }
    } else {
      charsInLastSegment = 0;
    }

    request.notifySegmentInfoForTextGot(options.segmentMaxSeq,
                                        options.segmentChars,
                                        options.segmentChars - charsInLastSegment);
  },

  getSmscAddress: function(request) {
    this.workerMessenger.send("getSmscAddress",
                              null,
                              (function(response) {
      if (!response.errorMsg) {
        request.notifyGetSmscAddress(response.smscAddress);
      } else {
        request.notifyGetSmscAddressFailed(Ci.nsIMobileMessageCallback.NOT_FOUND_ERROR);
      }
    }).bind(this));
  },

  sendSMS: function(number, message, silent, request) {
    let strict7BitEncoding;
    try {
      strict7BitEncoding = Services.prefs.getBoolPref("dom.sms.strict7BitEncoding");
    } catch (e) {
      strict7BitEncoding = false;
    }

    let options = this._fragmentText(message, null, strict7BitEncoding);
    options.number = PhoneNumberUtils.normalize(number);
    let requestStatusReport;
    try {
      requestStatusReport =
        Services.prefs.getBoolPref("dom.sms.requestStatusReport");
    } catch (e) {
      requestStatusReport = true;
    }
    options.requestStatusReport = requestStatusReport && !silent;
    if (options.segmentMaxSeq > 1) {
      options.segmentRef16Bit = this.segmentRef16Bit;
      options.segmentRef = this.nextSegmentRef;
    }

    let notifyResult = (function notifyResult(rv, domMessage) {
      if (!Components.isSuccessCode(rv)) {
        if (DEBUG) this.debug("Error! Fail to save sending message! rv = " + rv);
        request.notifySendMessageFailed(
          gMobileMessageDatabaseService.translateCrErrorToMessageCallbackError(rv),
          domMessage);
        Services.obs.notifyObservers(domMessage, kSmsFailedObserverTopic, null);
        return;
      }

      if (!silent) {
        Services.obs.notifyObservers(domMessage, kSmsSendingObserverTopic, null);
      }

      let connection =
        gMobileConnectionService.getItemByServiceId(this.clientId);
      // If the radio is disabled or the SIM card is not ready, just directly
      // return with the corresponding error code.
      let errorCode;
      let radioState = connection && connection.radioState;
      if (!PhoneNumberUtils.isPlainPhoneNumber(options.number)) {
        if (DEBUG) this.debug("Error! Address is invalid when sending SMS: " +
                              options.number);
        errorCode = Ci.nsIMobileMessageCallback.INVALID_ADDRESS_ERROR;
      } else if (radioState == null ||
                 radioState == RIL.GECKO_RADIOSTATE_DISABLED) {
        if (DEBUG) this.debug("Error! Radio is disabled when sending SMS.");
        errorCode = Ci.nsIMobileMessageCallback.RADIO_DISABLED_ERROR;
      } else if (this.rilContext.cardState != "ready") {
        if (DEBUG) this.debug("Error! SIM card is not ready when sending SMS.");
        errorCode = Ci.nsIMobileMessageCallback.NO_SIM_CARD_ERROR;
      }
      if (errorCode) {
        if (silent) {
          request.notifySendMessageFailed(errorCode, domMessage);
          return;
        }

        gMobileMessageDatabaseService
          .setMessageDeliveryByMessageId(domMessage.id,
                                         null,
                                         DOM_MOBILE_MESSAGE_DELIVERY_ERROR,
                                         RIL.GECKO_SMS_DELIVERY_STATUS_ERROR,
                                         null,
                                         function notifyResult(rv, domMessage) {
          // TODO bug 832140 handle !Components.isSuccessCode(rv)
          request.notifySendMessageFailed(errorCode, domMessage);
          Services.obs.notifyObservers(domMessage, kSmsFailedObserverTopic, null);
        });
        return;
      }

      // Keep current SMS message info for sent/delivered notifications
      let context = {
        request: request,
        sms: domMessage,
        requestStatusReport: options.requestStatusReport,
        silent: silent
      };

      // This is the entry point starting to send SMS.
      this.workerMessenger.send("sendSMS", options,
                                (function(context, response) {
        if (response.errorMsg) {
          // Failed to send SMS out.
          let error = Ci.nsIMobileMessageCallback.UNKNOWN_ERROR;
          switch (response.errorMsg) {
            case RIL.ERROR_RADIO_NOT_AVAILABLE:
              error = Ci.nsIMobileMessageCallback.NO_SIGNAL_ERROR;
              break;
            case RIL.ERROR_FDN_CHECK_FAILURE:
              error = Ci.nsIMobileMessageCallback.FDN_CHECK_ERROR;
              break;
          }

          if (context.silent) {
            // There is no way to modify nsIDOMMozSmsMessage attributes as they
            // are read only so we just create a new sms instance to send along
            // with the notification.
            let sms = context.sms;
            context.request.notifySendMessageFailed(
              error,
              gMobileMessageService.createSmsMessage(sms.id,
                                                     sms.threadId,
                                                     sms.iccId,
                                                     DOM_MOBILE_MESSAGE_DELIVERY_ERROR,
                                                     RIL.GECKO_SMS_DELIVERY_STATUS_ERROR,
                                                     sms.sender,
                                                     sms.receiver,
                                                     sms.body,
                                                     sms.messageClass,
                                                     sms.timestamp,
                                                     0,
                                                     0,
                                                     sms.read));
            return false;
          }

          gMobileMessageDatabaseService
            .setMessageDeliveryByMessageId(context.sms.id,
                                           null,
                                           DOM_MOBILE_MESSAGE_DELIVERY_ERROR,
                                           RIL.GECKO_SMS_DELIVERY_STATUS_ERROR,
                                           null,
                                           function notifyResult(rv, domMessage) {
            // TODO bug 832140 handle !Components.isSuccessCode(rv)
            context.request.notifySendMessageFailed(error, domMessage);
            Services.obs.notifyObservers(domMessage, kSmsFailedObserverTopic, null);
          });
          return false;
        } // End of send failure.

        if (response.deliveryStatus) {
          // Message delivery.
          gMobileMessageDatabaseService
            .setMessageDeliveryByMessageId(context.sms.id,
                                           null,
                                           context.sms.delivery,
                                           response.deliveryStatus,
                                           null,
                                           (function notifyResult(rv, domMessage) {
            // TODO bug 832140 handle !Components.isSuccessCode(rv)

            let topic = (response.deliveryStatus ==
                         RIL.GECKO_SMS_DELIVERY_STATUS_SUCCESS)
                        ? kSmsDeliverySuccessObserverTopic
                        : kSmsDeliveryErrorObserverTopic;

            // Broadcasting a "sms-delivery-success" system message to open apps.
            if (topic == kSmsDeliverySuccessObserverTopic) {
              this._broadcastSystemMessage(topic, domMessage);
            }

            // Notifying observers the delivery status is updated.
            Services.obs.notifyObservers(domMessage, topic, null);
          }).bind(this));

          // Send transaction has ended completely.
          return false;
        } // End of message delivery.

        // Message sent.
        if (context.silent) {
          // There is no way to modify nsIDOMMozSmsMessage attributes as they
          // are read only so we just create a new sms instance to send along
          // with the notification.
          let sms = context.sms;
          context.request.notifyMessageSent(
            gMobileMessageService.createSmsMessage(sms.id,
                                                   sms.threadId,
                                                   sms.iccId,
                                                   DOM_MOBILE_MESSAGE_DELIVERY_SENT,
                                                   sms.deliveryStatus,
                                                   sms.sender,
                                                   sms.receiver,
                                                   sms.body,
                                                   sms.messageClass,
                                                   sms.timestamp,
                                                   Date.now(),
                                                   0,
                                                   sms.read));
          // We don't wait for SMS-DELIVER-REPORT for silent one.
          return false;
        }

        gMobileMessageDatabaseService
          .setMessageDeliveryByMessageId(context.sms.id,
                                         null,
                                         DOM_MOBILE_MESSAGE_DELIVERY_SENT,
                                         context.sms.deliveryStatus,
                                         null,
                                         (function notifyResult(rv, domMessage) {
          // TODO bug 832140 handle !Components.isSuccessCode(rv)

          if (context.requestStatusReport) {
            context.sms = domMessage;
          }

          this._broadcastSystemMessage(kSmsSentObserverTopic, domMessage);
          context.request.notifyMessageSent(domMessage);
          Services.obs.notifyObservers(domMessage, kSmsSentObserverTopic, null);
        }).bind(this));

        // Only keep current context if we have requested for delivery report.
        return context.requestStatusReport;
      }).bind(this, context)); // End of |workerMessenger.send| callback.
    }).bind(this); // End of DB saveSendingMessage callback.

    let sendingMessage = {
      type: "sms",
      sender: this._getPhoneNumber(serviceId),
      receiver: number,
      body: message,
      deliveryStatusRequested: options.requestStatusReport,
      timestamp: Date.now(),
      iccId: this._getIccId(serviceId)
    };

    if (silent) {
      let delivery = DOM_MOBILE_MESSAGE_DELIVERY_SENDING;
      let deliveryStatus = RIL.GECKO_SMS_DELIVERY_STATUS_PENDING;
      let domMessage =
        gMobileMessageService.createSmsMessage(-1, // id
                                               0,  // threadId
                                               sendingMessage.iccId,
                                               delivery,
                                               deliveryStatus,
                                               sendingMessage.sender,
                                               sendingMessage.receiver,
                                               sendingMessage.body,
                                               "normal", // message class
                                               sendingMessage.timestamp,
                                               0,
                                               0,
                                               false);
      notifyResult(Cr.NS_OK, domMessage);
      return;
    }

    let id = gMobileMessageDatabaseService.saveSendingMessage(
      sendingMessage, notifyResult);
  },
