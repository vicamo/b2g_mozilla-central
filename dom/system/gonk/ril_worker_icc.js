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

this.ICC = {
  iccStatus: null,
  cardState: null,
  aid: null,
  appType: null,

  /**
   * Process ICC status.
   */
  processICCStatus: function processICCStatus(iccStatus) {
    this.iccStatus = iccStatus;

    if ((!iccStatus) || (iccStatus.cardState == CARD_STATE_ABSENT)) {
      if (DEBUG) debug("ICC absent");
      if (this.cardState == GECKO_CARDSTATE_ABSENT) {
        RIL.operator = null;
        return;
      }
      this.cardState = GECKO_CARDSTATE_ABSENT;
      RIL.sendDOMMessage({rilMessageType: "cardstatechange",
                          cardState: this.cardState});
      return;
    }

    // TODO: Bug 726098, change to use cdmaSubscriptionAppIndex when in CDMA.
    let index = iccStatus.gsmUmtsSubscriptionAppIndex;
    let app = iccStatus.apps[index];
    if (!app) {
      if (DEBUG) {
        debug("Subscription application is not present in iccStatus.");
      }
      if (this.cardState == GECKO_CARDSTATE_ABSENT) {
        return;
      }
      this.cardState = GECKO_CARDSTATE_ABSENT;
      RIL.operator = null;
      RIL.sendDOMMessage({rilMessageType: "cardstatechange",
                          cardState: this.cardState});
      return;
    }

    // fetchRecords will need to read aid, so read aid here.
    this.aid = app.aid;
    this.appType = app.app_type;

    let newCardState;
    switch (app.app_state) {
      case CARD_APPSTATE_PIN:
        newCardState = GECKO_CARDSTATE_PIN_REQUIRED;
        break;
      case CARD_APPSTATE_PUK:
        newCardState = GECKO_CARDSTATE_PUK_REQUIRED;
        break;
      case CARD_APPSTATE_SUBSCRIPTION_PERSO:
        newCardState = GECKO_CARDSTATE_NETWORK_LOCKED;
        break;
      case CARD_APPSTATE_READY:
        newCardState = GECKO_CARDSTATE_READY;
        break;
      case CARD_APPSTATE_UNKNOWN:
      case CARD_APPSTATE_DETECTED:
      default:
        newCardState = GECKO_CARDSTATE_NOT_READY;
    }

    if (this.cardState == newCardState) {
      return;
    }

    // This was moved down from CARD_APPSTATE_READY
    RIL.requestNetworkInfo();
    RIL.getSignalStrength();
    if (newCardState == GECKO_CARDSTATE_READY) {
      this.fetchRecords();
      RIL.reportStkServiceIsRunning();
    }

    this.cardState = newCardState;
    RIL.sendDOMMessage({rilMessageType: "cardstatechange",
                        cardState: this.cardState});
  },

  /**
   * Process a ICC_COMMAND_GET_RESPONSE type command for REQUEST_SIM_IO.
   */
  processICCIOGetResponse: function processICCIOGetResponse(options) {
    let length = Buf.readUint32();

    // The format is from TS 51.011, clause 9.2.1

    // Skip RFU, data[0] data[1]
    Buf.seekIncoming(2 * PDU_HEX_OCTET_SIZE);

    // File size, data[2], data[3]
    let fileSize = (GsmPDUHelper.readHexOctet() << 8) |
                    GsmPDUHelper.readHexOctet();

    // 2 bytes File id. data[4], data[5]
    let fileId = (GsmPDUHelper.readHexOctet() << 8) |
                  GsmPDUHelper.readHexOctet();
    if (fileId != options.fileId) {
      throw "fileId mismatch, expect " + options.fileId + ", got " + fileId;
    }

    // Type of file, data[6]
    let fileType = GsmPDUHelper.readHexOctet();
    if (fileType != TYPE_EF) {
      throw "Unexpected file type " + fileType;
    }

    // Skip 1 byte RFU, data[7],
    //      3 bytes Access conditions, data[8] data[9] data[10],
    //      1 byte File status, data[11],
    //      1 byte Length of the following data, data[12].
    Buf.seekIncoming(((RESPONSE_DATA_STRUCTURE - RESPONSE_DATA_FILE_TYPE - 1) *
        PDU_HEX_OCTET_SIZE));

    // Read Structure of EF, data[13]
    let efType = GsmPDUHelper.readHexOctet();
    if (efType != options.type) {
      throw "EF type mismatch, expect " + options.type + ", got " + efType;
    }

    // Length of a record, data[14]
    options.recordSize = GsmPDUHelper.readHexOctet();
    options.totalRecords = fileSize / options.recordSize;

    Buf.readStringDelimiter(length);

    switch (options.type) {
      case EF_TYPE_LINEAR_FIXED:
        // Reuse the options object and update some properties.
        options.command = ICC_COMMAND_READ_RECORD;
        options.p1 = 1; // Record number, always use the 1st record
        options.p2 = READ_RECORD_ABSOLUTE_MODE;
        options.p3 = options.recordSize;
        this.iccIO(options);
        break;

      case EF_TYPE_TRANSPARENT:
        // Reuse the options object and update some properties.
        options.command = ICC_COMMAND_READ_BINARY;
        options.p3 = fileSize;
        this.iccIO(options);
        break;

      default:
        throw "Invalid EF type";
    }
  },

  /**
   * Process ICC I/O response.
   */
  processICCIO: function processICCIO(options) {
    switch (options.command) {
      case ICC_COMMAND_GET_RESPONSE:
        this.processICCIOGetResponse(options);
        break;

      case ICC_COMMAND_READ_RECORD:
      case ICC_COMMAND_READ_BINARY:
        if (options.callback) {
          options.callback(options);
        }
        break;

      default:
        throw "Invalid command";
    }
  },

  /**
   * Helper function for getting the pathId for the specific ICC record
   * depeding on which type of ICC card we are using.
   *
   * @param fileId
   *        File id.
   * @return The pathId or null in case of an error or invalid input.
   */
  getPathIdFromFileId: function getPathIdFromFileId(fileId) {
    let index = this.iccStatus.gsmUmtsSubscriptionAppIndex;
    if (index == -1) {
      return null;
    }
    let app = this.iccStatus.apps[index];
    if (!app) {
      return null;
    }

    // Here we handle only file ids that are common to RUIM, SIM, USIM
    // and other types of ICC cards.
    switch (fileId) {
      case ICC_EF_ICCID:
        return EF_PATH_MF_SIM;
      case ICC_EF_ADN:
        return EF_PATH_MF_SIM + EF_PATH_DF_TELECOM;
      case ICC_EF_PBR:
        return EF_PATH_MF_SIM + EF_PATH_DF_TELECOM + EF_PATH_DF_PHONEBOOK;
    }

    switch (app.app_type) {
      case CARD_APPTYPE_SIM:
        switch (fileId) {
          case ICC_EF_FDN:
          case ICC_EF_MSISDN:
            return EF_PATH_MF_SIM + EF_PATH_DF_TELECOM;

          case ICC_EF_AD:
          case ICC_EF_MBDN:
          case ICC_EF_SPN:
          case ICC_EF_SST:
            return EF_PATH_MF_SIM + EF_PATH_DF_GSM;
        }
      case CARD_APPTYPE_USIM:
        switch (fileId) {
          case ICC_EF_AD:
          case ICC_EF_FDN:
          case ICC_EF_MBDN:
          case ICC_EF_UST:
          case ICC_EF_MSISDN:
          case ICC_EF_SPN:
            return EF_PATH_MF_SIM + EF_PATH_ADF_USIM;

          default:
            // The file ids in USIM phone book entries are decided by the
	    // card manufacturer. So if we don't match any of the cases
	    // above and if its a USIM return the phone book path.
            return EF_PATH_MF_SIM + EF_PATH_DF_TELECOM + EF_PATH_DF_PHONEBOOK;
        }
    }
    return null;
  },

  /**
   * Enter a PIN to unlock the ICC.
   *
   * @param pin
   *        String containing the PIN.
   * @param [optional] aid
   *        AID value.
   */
  enterPIN: function enterPIN(options) {
    Buf.newParcel(REQUEST_ENTER_SIM_PIN, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 1 : 2);
    Buf.writeString(options.pin);
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  /**
   * Enter a PIN2 to unlock the ICC.
   *
   * @param pin
   *        String containing the PIN2.
   * @param [optional] aid
   *        AID value.
   */
  enterPIN2: function enterPIN2(options) {
    Buf.newParcel(REQUEST_ENTER_SIM_PIN2, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 1 : 2);
    Buf.writeString(options.pin);
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  /**
   * Requests a network personalization be deactivated.
   *
   * @param type
   *        Integer indicating the network personalization be deactivated.
   * @param pin
   *        String containing the pin.
   */
  enterDepersonalization: function enterDepersonalization(options) {
    Buf.newParcel(REQUEST_ENTER_NETWORK_DEPERSONALIZATION_CODE, options);
    Buf.writeUint32(options.type);
    Buf.writeString(options.pin);
    Buf.sendParcel();
  },

  /**
   * Change the current ICC PIN number.
   *
   * @param pin
   *        String containing the old PIN value
   * @param newPin
   *        String containing the new PIN value
   * @param [optional] aid
   *        AID value.
   */
  changePIN: function changePIN(options) {
    Buf.newParcel(REQUEST_CHANGE_SIM_PIN, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 2 : 3);
    Buf.writeString(options.pin);
    Buf.writeString(options.newPin);
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  /**
   * Change the current ICC PIN2 number.
   *
   * @param pin
   *        String containing the old PIN2 value
   * @param newPin
   *        String containing the new PIN2 value
   * @param [optional] aid
   *        AID value.
   */
  changePIN2: function changePIN2(options) {
    Buf.newParcel(REQUEST_CHANGE_SIM_PIN2, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 2 : 3);
    Buf.writeString(options.pin);
    Buf.writeString(options.newPin);
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },
  /**
   * Supplies ICC PUK and a new PIN to unlock the ICC.
   *
   * @param puk
   *        String containing the PUK value.
   * @param newPin
   *        String containing the new PIN value.
   * @param [optional] aid
   *        AID value.
   */
  enterPUK: function enterPUK(options) {
    Buf.newParcel(REQUEST_ENTER_SIM_PUK, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 2 : 3);
    Buf.writeString(options.puk);
    Buf.writeString(options.newPin);
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  /**
   * Supplies ICC PUK2 and a new PIN2 to unlock the ICC.
   *
   * @param puk
   *        String containing the PUK2 value.
   * @param newPin
   *        String containing the new PIN2 value.
   * @param [optional] aid
   *        AID value.
   */
  enterPUK2: function enterPUK2(options) {
    Buf.newParcel(REQUEST_ENTER_SIM_PUK2, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 2 : 3);
    Buf.writeString(options.puk);
    Buf.writeString(options.newPin);
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  /**
   * Get ICC Pin lock. A wrapper call to queryFacilityLock.
   *
   * @param requestId
   *        Request Id from RadioInterfaceLayer.
   */
  getPinLock: function getPinLock(options) {
    options.facility = ICC_CB_FACILITY_SIM;
    options.password = ""; // For query no need to provide pin.
    options.serviceClass = ICC_SERVICE_CLASS_VOICE |
                           ICC_SERVICE_CLASS_DATA  |
                           ICC_SERVICE_CLASS_FAX;
    this.queryFacilityLock(options);
  },

  /**
   * Query ICC facility lock.
   *
   * @param facility
   *        One of ICC_CB_FACILITY_*.
   * @param password
   *        Password for the facility, or "" if not required.
   * @param serviceClass
   *        One of ICC_SERVICE_CLASS_*.
   * @param [optional] aid
   *        AID value.
   */
  queryFacilityLock: function queryFacilityLock(options) {
    Buf.newParcel(REQUEST_QUERY_FACILITY_LOCK, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 3 : 4);
    Buf.writeString(options.facility);
    Buf.writeString(options.password);
    Buf.writeString(options.serviceClass.toString());
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  /**
   * Set ICC Pin lock. A wrapper call to setFacilityLock.
   *
   * @param enabled
   *        true to enable, false to disable.
   * @param pin
   *        Pin code.
   * @param requestId
   *        Request Id from RadioInterfaceLayer.
   */
  setPinLock: function setPinLock(options) {
    options.facility = ICC_CB_FACILITY_SIM;
    options.enabled = options.enabled;
    options.password = options.pin;
    options.serviceClass = ICC_SERVICE_CLASS_VOICE |
                           ICC_SERVICE_CLASS_DATA  |
                           ICC_SERVICE_CLASS_FAX;
    this.setFacilityLock(options);
  },

  /**
   * Set ICC facility lock.
   *
   * @param facility
   *        One of ICC_CB_FACILITY_*.
   * @param enabled
   *        true to enable, false to disable.
   * @param password
   *        Password for the facility, or "" if not required.
   * @param serviceClass
   *        One of ICC_SERVICE_CLASS_*.
   * @param [optional] aid
   *        AID value.
   */
  setFacilityLock: function setFacilityLock(options) {
    Buf.newParcel(REQUEST_SET_FACILITY_LOCK, options);
    Buf.writeUint32(RILQUIRKS_V5_LEGACY ? 3 : 4);
    Buf.writeString(options.facility);
    Buf.writeString(options.enabled ? "1" : "0");
    Buf.writeString(options.password);
    Buf.writeString(options.serviceClass.toString());
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  /**
   *  Get ICC FDN.
   *
   *  @paran requestId
   *         Request id from RadioInterfaceLayer.
   */
  getFDN: function getFDN(options) {
    this.iccInfo.fdn = [];
    this.getLinearFixedRecords(ICC_EF_FDN, true, (function callback(opt) {
      if (opt.rilRequestError != ERROR_SUCCESS) {
        return;
      }

      function add(contact) {
        this.iccInfo.fdn.push(contact);
      };
      function finish() {
        if (DEBUG) {
          for (let i = 0; i < this.iccInfo.fdn.length; i++) {
            debug("FDN[" + i + "] alphaId = " + this.iccInfo.fdn[i].alphaId +
                                " number = " + this.iccInfo.fdn[i].number);
          }
        }
        options.rilMessageType = "icccontacts";
        options.contacts = this.iccInfo.fdn;
        RIL.sendDOMMessage(options);
      };
      this.parseDiallingNumber(opt, add, finish);
    }).bind(this));
  },

  /**
   *  Get ICC ADN.
   *
   *  @param fileId
   *         EF id of the ADN.
   *  @paran requestId
   *         Request id from RadioInterfaceLayer.
   */
  getADN: function getADN(options) {
    this.iccInfo.adn = [];
    this.getLinearFixedRecords(options.fileId, true, (function callback(opt) {
      if (opt.rilRequestError != ERROR_SUCCESS) {
        options.rilMessageType = "icccontacts";
        options.errorMsg = RIL_ERROR_TO_GECKO_ERROR[opt.rilRequestError];
        RIL.sendDOMMessage(options);
        return;
      }

      function add(contact) {
        this.iccInfo.adn.push(contact);
      };

      function finish() {
        if (DEBUG) {
          for (let i = 0; i < this.iccInfo.adn.length; i++) {
            debug("ADN[" + i + "] alphaId = " + this.iccInfo.adn[i].alphaId +
                                " number  = " + this.iccInfo.adn[i].number);
          }
        }
        options.rilMessageType = "icccontacts";
        options.contacts = this.iccInfo.adn;
        RIL.sendDOMMessage(options);
      };
      this.parseDiallingNumber(opt, add, finish);
    }).bind(this));
  },

  decodeSimTlvs: function decodeSimTlvs(tlvsLen) {
    let index = 0;
    let tlvs = [];
    while (index < tlvsLen) {
      let simTlv = {
        tag : GsmPDUHelper.readHexOctet(),
        length : GsmPDUHelper.readHexOctet(),
      };
      simTlv.value = GsmPDUHelper.readHexOctetArray(simTlv.length)
      tlvs.push(simTlv);
      index += simTlv.length + 2 /* The length of 'tag' and 'length' field */;
    }
    return tlvs;
  },

  searchForIccUsimTag: function searchForIccUsimTag(tlvs, tag) {
    for (let i = 0; i < tlvs.length; i++) {
      if (tlvs[i].tag == tag) {
        return tlvs[i];
      }
    }
    return null;
  },

  /**
   * Get USIM Phonebook.
   *
   * @params requestId
   *         Request id from RadioInterfaceLayer.
   */
  getPBR: function getPBR(options) {
    this.getLinearFixedRecords(ICC_EF_PBR, false, (function callback(opt) {
      if (opt.rilRequestError != ERROR_SUCCESS) {
        options.rilMessageType = "icccontacts";
        options.errorMsg = RIL_ERROR_TO_GECKO_ERROR[opt.rilRequestError];
        RIL.sendDOMMessage(options);
        return;
      }

      let bufLen = Buf.readUint32();

      let tag = GsmPDUHelper.readHexOctet();
      let length = GsmPDUHelper.readHexOctet();
      let value = this.decodeSimTlvs(length);

      let adn = this.searchForIccUsimTag(value, ICC_USIM_EFADN_TAG);
      options.fileId = (adn.value[0] << 8) | adn.value[1];
      this.getADN(options);

      Buf.readStringDelimiter(bufLen);
    }).bind(this));
  },

  /**
   * Fetch ICC records.
   */
  fetchRecords: function fetchRecords() {
    this.getICCID();
    this.getIMSI();
    this.getMSISDN();
    this.getAD();
    this.getSPN();
    this.getSST();
    this.getMBDN();
  },

  /**
   * Update the ICC information to RadioInterfaceLayer.
   */
  sendICCInfoChange: function sendICCInfoChange() {
    this.iccInfo.rilMessageType = "iccinfochange";
    RIL.sendDOMMessage(this.iccInfo);
  },

  /**
   * Read the ICCD from the ICC card.
   */
  getICCID: function getICCID() {
    this.getTransparentRecords(ICC_EF_ICCID, (function callback(options) {
      if (options.rilRequestError != ERROR_SUCCESS) {
        return;
      }

      let length = Buf.readUint32();
      this.iccInfo.iccid = GsmPDUHelper.readSwappedNibbleBcdString(length / 2);
      Buf.readStringDelimiter(length);

      if (DEBUG) debug("ICCID: " + this.iccInfo.iccid);
      if (this.iccInfo.iccid) {
        this.sendICCInfoChange();
      }
    }).bind(this));
  },

  /**
   * Get IMSI.
   *
   * @param [optional] aid
   *        AID value.
   */
  getIMSI: function getIMSI(aid) {
    if (RILQUIRKS_V5_LEGACY) {
      Buf.simpleRequest(REQUEST_GET_IMSI);
      return;
    }
    let token = Buf.newParcel(REQUEST_GET_IMSI);
    Buf.writeUint32(1);
    Buf.writeString(aid ? aid : ICC.aid);
    Buf.sendParcel();
  },

  /**
   * Read the MSISDN from the ICC.
   */
  getMSISDN: function getMSISDN() {
    this.getLinearFixedRecords(ICC_EF_MSISDN, false, (function callback(options) {
      if (options.rilRequestError != ERROR_SUCCESS) {
        return;
      }

      let parseCallback = function parseCallback(msisdn) {
        if (this.iccInfo.msisdn === msisdn.number) {
          return;
        }
        this.iccInfo.msisdn = msisdn.number;
        if (DEBUG) debug("MSISDN: " + this.iccInfo.msisdn);
        this.sendICCInfoChange();
      }
      this.parseDiallingNumber(options, parseCallback);
    }).bind(this));
  },

  /**
   * Read the AD (Administrative Data) from the ICC.
   */
  getAD: function getAD() {
    this.getTransparentRecords(ICC_EF_AD, (function callback(options) {
      if (options.rilRequestError != ERROR_SUCCESS) {
        return;
      }

      let length = Buf.readUint32();
      // Each octet is encoded into two chars.
      let len = length / 2;
      this.iccInfo.ad = GsmPDUHelper.readHexOctetArray(len);
      Buf.readStringDelimiter(length);

      if (DEBUG) {
        let str = "";
        for (let i = 0; i < this.iccInfo.ad.length; i++) {
          str += this.iccInfo.ad[i] + ", ";
        }
        debug("AD: " + str);
      }

      if (this.iccInfo.imsi) {
        // MCC is the first 3 digits of IMSI
        this.iccInfo.mcc = parseInt(this.iccInfo.imsi.substr(0,3));
        // The 4th byte of the response is the length of MNC
        this.iccInfo.mnc = parseInt(this.iccInfo.imsi.substr(3, this.iccInfo.ad[3]));
        if (DEBUG) debug("MCC: " + this.iccInfo.mcc + " MNC: " + this.iccInfo.mnc);
        this.sendICCInfoChange();
      }
    }).bind(this));
  },

  /**
   * Read the SPN (Service Provider Name) from the ICC.
   */
  getSPN: function getSPN() {
    this.getTransparentRecords(ICC_EF_SPN, (function callback(options) {
      if (options.rilRequestError != ERROR_SUCCESS) {
        return;
      }

      let length = Buf.readUint32();
      // Each octet is encoded into two chars.
      // Minus 1 because first is used to store display condition
      let len = (length / 2) - 1;
      let spnDisplayCondition = GsmPDUHelper.readHexOctet();
      this.iccInfo.spn = GsmPDUHelper.readAlphaIdentifier(len);
      Buf.readStringDelimiter(length);

      if (DEBUG) {
        debug("SPN: spn=" + this.iccInfo.spn + ", spnDisplayCondition=" + spnDisplayCondition);
      }
      this.sendICCInfoChange();
    }).bind(this));
  },

  /**
   * Get whether specificed (U)SIM service is available.
   *
   * @param geckoService
   *        Service name like "ADN", "BDN", etc.
   *
   * @return true if the service is enabled, false otherwise.
   */
  isICCServiceAvailable: function isICCServiceAvailable(geckoService) {
    let serviceTable = this.iccInfo.sst;
    let index, bitmask;
    if (this.appType == CARD_APPTYPE_SIM) {
      /**
       * Service id is valid in 1..N, and 2 bits are used to code each service.
       *
       * +----+--  --+----+----+
       * | b8 | ...  | b2 | b1 |
       * +----+--  --+----+----+
       *
       * b1 = 0, service not allocated.
       *      1, service allocated.
       * b2 = 0, service not activatd.
       *      1, service allocated.
       *
       * @see 3GPP TS 51.011 10.3.7.
       */
      let simService = GECKO_ICC_SERVICES.sim[geckoService];
      if (!simService) {
        return false;
      }
      simService -= 1;
      index = Math.floor(simService / 4);
      bitmask = 2 << ((simService % 4) << 1);
    } else {
      /**
       * Service id is valid in 1..N, and 1 bit is used to code each service.
       *
       * +----+--  --+----+----+
       * | b8 | ...  | b2 | b1 |
       * +----+--  --+----+----+
       *
       * b1 = 0, service not avaiable.
       *      1, service available.
       * b2 = 0, service not avaiable.
       *      1, service available.
       *
       * @see 3GPP TS 31.102 4.2.8.
       */
      let usimService = GECKO_ICC_SERVICES.usim[geckoService];
      if (!usimService) {
        return false;
      }
      usimService -= 1;
      index = Math.floor(usimService / 8);
      bitmask = 1 << ((usimService % 8) << 0);
    }

    return (serviceTable &&
           (index < serviceTable.length) &&
           (serviceTable[index] & bitmask)) != 0;
  },

  /**
   * Read the (U)SIM Service Table from the ICC.
   */
  getSST: function getSST() {
    // ICC_EF_UST has the same value with ICC_EF_SST.
    this.getTransparentRecords(ICC_EF_SST, (function callback(options) {
      if (options.rilRequestError != ERROR_SUCCESS) {
        return;
      }

      let length = Buf.readUint32();
      // Each octet is encoded into two chars.
      let len = length / 2;
      this.iccInfo.sst = GsmPDUHelper.readHexOctetArray(len);
      Buf.readStringDelimiter(length);

      if (DEBUG) {
        let str = "";
        for (let i = 0; i < this.iccInfo.sst.length; i++) {
          str += this.iccInfo.sst[i] + ", ";
        }
        debug("SST: " + str);
      }
    }).bind(this));
  },

  /**
   * Get ICC MBDN. (Mailbox Dialling Number)
   *
   * @see TS 131.102, clause 4.2.60
   */
  getMBDN: function getMBDN() {
    this.getLinearFixedRecords(ICC_EF_MBDN, false, (function callback(options) {
      if (options.rilRequestError != ERROR_SUCCESS) {
        return;
      }

      let parseCallback = function parseCallback(contact) {
        if (DEBUG) {
          debug("MBDN, alphaId="+contact.alphaId+" number="+contact.number);
        }
        if (this.iccInfo.mbdn != contact.number) {
          this.iccInfo.mbdn = contact.number;
          contact.rilMessageType = "iccmbdn";
          RIL.sendDOMMessage(contact);
        }
      };

      this.parseDiallingNumber(options, parseCallback);
    }).bind(this));
  },

  /**
   *  Helper to parse Dialling number from TS 131.102
   *
   *  @param options
   *         The 'options' object passed from RIL.iccIO
   *  @param addCallback
   *         The function should be invoked when the ICC record is processed
   *         succesfully.
   *  @param finishCallback
   *         The function should be invoked when the final ICC record is
   *         processed.
   *
   */
  parseDiallingNumber: function parseDiallingNumber(options,
                                                    addCallback,
                                                    finishCallback) {
    let ffLen; // The length of trailing 0xff to be read.
    let length = Buf.readUint32();

    let alphaLen = options.recordSize - MSISDN_FOOTER_SIZE_BYTES;
    let alphaId = GsmPDUHelper.readAlphaIdentifier(alphaLen);

    let numLen = GsmPDUHelper.readHexOctet();
    if (numLen != 0xff) {
      if (numLen > MSISDN_MAX_NUMBER_SIZE_BYTES) {
        debug("invalid length of BCD number/SSC contents - " + numLen);
        return;
      }

      if (addCallback) {
        addCallback.call(this, {alphaId: alphaId,
                                number: GsmPDUHelper.readDiallingNumber(numLen)});
      }

      ffLen = length / 2 - alphaLen - numLen - 1; // Minus 1 for the numLen field.
    } else {
      ffLen = MSISDN_FOOTER_SIZE_BYTES - 1; // Minus 1 for the numLen field.
    }

    // Consumes the remaining 0xff
    for (let i = 0; i < ffLen; i++) {
      GsmPDUHelper.readHexOctet();
    }

    Buf.readStringDelimiter(length);

    if (options.loadAll &&
        options.p1 < options.totalRecords) {
      options.p1++;
      this.iccIO(options);
    } else {
      if (finishCallback) {
        finishCallback.call(this);
      }
    }
  },

  /**
   * Helper for processing responses of functions such as enterICC* and changeICC*.
   */
  processEnterAndChangeICCResponses: function processEnterAndChangeICCResponses(length, options) {
    options.success = options.rilRequestError == 0;
    if (!options.success) {
      options.errorMsg = RIL_ERROR_TO_GECKO_ERROR[options.rilRequestError];
    }
    options.retryCount = length ? Buf.readUint32List()[0] : -1;
    this.sendDOMMessage(options);
  },

  ////////////  Public Utility Functions ////////////

  /**
   *  Request an ICC I/O operation.
   *
   *  See TS 27.007 "restricted SIM" operation, "AT Command +CRSM".
   *  The sequence is in the same order as how libril reads this parcel,
   *  see the struct RIL_SIM_IO_v5 or RIL_SIM_IO_v6 defined in ril.h
   *
   *  @param command
   *         The I/O command, one of the ICC_COMMAND_* constants.
   *  @param fileId
   *         The file to operate on, one of the ICC_EF_* constants.
   *  @param pathId
   *         String type, check the 'pathid' parameter from TS 27.007 +CRSM.
   *  @param p1, p2, p3
   *         Arbitrary integer parameters for the command.
   *  @param data
   *         String parameter for the command.
   *  @param pin2
   *         String containing the PIN2.
   *  @param [optional] aid
   *         AID value.
   */
  iccIO: function iccIO(options) {
    let token = Buf.newParcel(REQUEST_SIM_IO, options);
    Buf.writeUint32(options.command);
    Buf.writeUint32(options.fileId);
    Buf.writeString(options.pathId);
    Buf.writeUint32(options.p1);
    Buf.writeUint32(options.p2);
    Buf.writeUint32(options.p3);
    Buf.writeString(options.data);
    Buf.writeString(options.pin2 ? options.pin2 : null);
    if (!RILQUIRKS_V5_LEGACY) {
      Buf.writeString(options.aid ? options.aid : this.aid);
    }
    Buf.sendParcel();
  },

  getLinearFixedRecords: function getLinearFixedRecords(fileId, loadAll, callback) {
    this.iccIO({
      command:   ICC_COMMAND_GET_RESPONSE,
      fileId:    fileId,
      pathId:    this.getPathIdFromFileId(fileId),
      p1:        0, // For GET_RESPONSE, p1 = 0
      p2:        0, // For GET_RESPONSE, p2 = 0
      p3:        GET_RESPONSE_EF_SIZE_BYTES,
      data:      null,
      pin2:      null,
      type:      EF_TYPE_LINEAR_FIXED,
      callback:  callback,
      loadAll:   loadAll
    });
  },

  getTransparentRecords: function getTransparentRecords(fileId, callback) {
    this.iccIO({
      command:   ICC_COMMAND_GET_RESPONSE,
      fileId:    fileId,
      pathId:    this.getPathIdFromFileId(fileId),
      p1:        0, // For GET_RESPONSE, p1 = 0
      p2:        0, // For GET_RESPONSE, p2 = 0
      p3:        GET_RESPONSE_EF_SIZE_BYTES,
      data:      null,
      pin2:      null,
      type:      EF_TYPE_TRANSPARENT,
      callback:  callback
    });
  },

  ////////////  DOM Message Handlers ////////////

  /**
   * Helper function for unlocking ICC locks.
   */
  handleUnlockCardLock: function handleUnlockCardLock(options) {
    switch (options.lockType) {
      case "pin":
        this.enterPIN(options);
        break;
      case "pin2":
        this.enterPIN2(options);
        break;
      case "puk":
        this.enterPUK(options);
        break;
      case "puk2":
        this.enterPUK2(options);
        break;
      case "nck":
        options.type = CARD_PERSOSUBSTATE_SIM_NETWORK;
        this.enterDepersonalization(options);
        break;
      default:
        options.errorMsg = "Unsupported Card Lock.";
        options.success = false;
        RIL.sendDOMMessage(options);
    }
  },

  /**
   * Helper function for changing ICC locks.
   */
  handleSetCardLock: function handleSetCardLock(options) {
    if (options.newPin !== undefined) {
      switch (options.lockType) {
        case "pin":
          this.changePIN(options);
          break;
        case "pin2":
          this.changePIN2(options);
          break;
        default:
          options.errorMsg = "Unsupported Card Lock.";
          options.success = false;
          RIL.sendDOMMessage(options);
      }
    } else { // Enable/Disable pin lock.
      if (options.lockType != "pin") {
        options.errorMsg = "Unsupported Card Lock.";
        options.success = false;
        RIL.sendDOMMessage(options);
        return;
      }
      this.setPinLock(options);
    }
  },

  /**
   * Helper function for fetching the state of ICC locks.
   */
  handleGetCardLock: function handleGetCardLock(options) {
    switch (options.lockType) {
      case "pin":
        this.getPinLock(options);
        break;
      default:
        options.errorMsg = "Unsupported Card Lock.";
        options.success = false;
        RIL.sendDOMMessage(options);
    }
  },

  /**
   * Get UICC Phonebook.
   *
   * @params contactType
   *         "ADN" or "FDN".
   */
  handleGetContacts: function handleGetContacts(options) {
    if (!this.appType) {
      options.rilMessageType = "icccontacts";
      options.errorMsg = GECKO_ERROR_REQUEST_NOT_SUPPORTED;
      RIL.sendDOMMessage(options);
    }

    let type = options.contactType;
    switch (type) {
      case "ADN":
        switch (this.appType) {
          case CARD_APPTYPE_SIM:
            options.fileId = ICC_EF_ADN;
            this.getADN(options);
            break;
          case CARD_APPTYPE_USIM:
            this.getPBR(options);
            break;
        }
        break;
      case "FDN":
        this.getFDN(options);
        break;
    }
  }
};

// ICC-specific parcel handlers

this.ICC[REQUEST_GET_SIM_STATUS] = function REQUEST_GET_SIM_STATUS(length, options) {
  if (options.rilRequestError) {
    return;
  }

  let iccStatus = {};
  iccStatus.cardState = Buf.readUint32(); // CARD_STATE_*
  iccStatus.universalPINState = Buf.readUint32(); // CARD_PINSTATE_*
  iccStatus.gsmUmtsSubscriptionAppIndex = Buf.readUint32();
  iccStatus.cdmaSubscriptionAppIndex = Buf.readUint32();
  if (!RILQUIRKS_V5_LEGACY) {
    iccStatus.imsSubscriptionAppIndex = Buf.readUint32();
  }

  let apps_length = Buf.readUint32();
  if (apps_length > CARD_MAX_APPS) {
    apps_length = CARD_MAX_APPS;
  }

  iccStatus.apps = [];
  for (let i = 0 ; i < apps_length ; i++) {
    iccStatus.apps.push({
      app_type:       Buf.readUint32(), // CARD_APPTYPE_*
      app_state:      Buf.readUint32(), // CARD_APPSTATE_*
      perso_substate: Buf.readUint32(), // CARD_PERSOSUBSTATE_*
      aid:            Buf.readString(),
      app_label:      Buf.readString(),
      pin1_replaced:  Buf.readUint32(),
      pin1:           Buf.readUint32(),
      pin2:           Buf.readUint32()
    });
    if (RILQUIRKS_SIM_APP_STATE_EXTRA_FIELDS) {
      Buf.readUint32();
      Buf.readUint32();
      Buf.readUint32();
      Buf.readUint32();
    }
  }

  if (DEBUG) debug("iccStatus: " + JSON.stringify(iccStatus));
  this.processICCStatus(iccStatus);
};

this.ICC[REQUEST_ENTER_SIM_PIN] = function REQUEST_ENTER_SIM_PIN(length, options) {
  this.processEnterAndChangeICCResponses(length, options);
};

this.ICC[REQUEST_ENTER_SIM_PUK] = function REQUEST_ENTER_SIM_PUK(length, options) {
  this.processEnterAndChangeICCResponses(length, options);
};

this.ICC[REQUEST_ENTER_SIM_PIN2] = function REQUEST_ENTER_SIM_PIN2(length, options) {
  this.processEnterAndChangeICCResponses(length, options);
};

this.ICC[REQUEST_ENTER_SIM_PUK2] = function REQUEST_ENTER_SIM_PUK(length, options) {
  this.processEnterAndChangeICCResponses(length, options);
};

this.ICC[REQUEST_CHANGE_SIM_PIN] = function REQUEST_CHANGE_SIM_PIN(length, options) {
  this.processEnterAndChangeICCResponses(length, options);
};

this.ICC[REQUEST_CHANGE_SIM_PIN2] = function REQUEST_CHANGE_SIM_PIN2(length, options) {
  this.processEnterAndChangeICCResponses(length, options);
};

this.ICC[REQUEST_ENTER_NETWORK_DEPERSONALIZATION_CODE] =
  function REQUEST_ENTER_NETWORK_DEPERSONALIZATION_CODE(length, options) {
  this.processEnterAndChangeICCResponses(length, options);
};

this.ICC[REQUEST_GET_IMSI] = function REQUEST_GET_IMSI(length, options) {
  if (options.rilRequestError) {
    return;
  }

  this.iccInfo.imsi = Buf.readString();
};

this.ICC[REQUEST_SIM_IO] = function REQUEST_SIM_IO(length, options) {
  try {
    if (!length) {
      throw "Invalid length";
    }

    // Don't need to read rilRequestError since we can know error status from
    // sw1 and sw2.
    let sw1 = Buf.readUint32();
    let sw2 = Buf.readUint32();
    if (sw1 != ICC_STATUS_NORMAL_ENDING) {
      // See GSM11.11, TS 51.011 clause 9.4, and ISO 7816-4 for the error
      // description.
      throw "sw1: 0x" + sw1.toString(16) + ", sw2: 0x" + sw2.toString(16);
    }

    this.processICCIO(options);
  } catch (e) {
    if (DEBUG) {
      debug("ICC I/O Error EF id = 0x" + options.fileId.toString(16) +
            " command = 0x" + options.command.toString(16) + ": " + e);
    }
    if (options.callback) {
      if (options.rilRequestError == ERROR_SUCCESS) {
        options.rilRequestError = ERROR_GENERIC_FAILURE;
      }
      options.callback(options);
    }
  }
};

// Allow this file to be imported via Components.utils.import().
this.EXPORTED_SYMBOLS = Object.keys(this);
