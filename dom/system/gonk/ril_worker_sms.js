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

this.SMS = {
  /**
   * Hash map for received multipart sms fragments. Messages are hashed with
   * its sender address and concatenation reference number. Three additional
   * attributes `segmentMaxSeq`, `receivedSegments`, `segments` are inserted.
   */
  receivedSmsSegmentsMap: {},

  /**
   * Outgoing messages waiting for SMS-STATUS-REPORT.
   */
  pendingSentSmsMap: {},

  /**
   * @param message A decoded SMS-DELIVER message.
   */
  writeSmsToSIM: function writeSmsToSIM(message) {
    Buf.newParcel(REQUEST_WRITE_SMS_TO_SIM);

    // Write EFsms Status
    Buf.writeUint32(EFSMS_STATUS_FREE);

    Buf.seekIncoming(-1 * (Buf.currentParcelSize - Buf.readAvailable
                           - 2 * UINT32_SIZE)); // Skip response_type & request_type.
    let messageStringLength = Buf.readUint32(); // In semi-octets
    let smscLength = GsmPDUHelper.readHexOctet(); // In octets, inclusive of TOA
    let pduLength = (messageStringLength / 2) - (smscLength + 1); // In octets

    // 1. Write PDU first.
    if (smscLength > 0) {
      Buf.seekIncoming(smscLength * PDU_HEX_OCTET_SIZE);
    }
    // Write EFsms PDU string length
    Buf.writeUint32(2 * pduLength); // In semi-octets
    if (pduLength) {
      Buf.copyIncomingToOutgoing(PDU_HEX_OCTET_SIZE * pduLength);
    }
    // Write 2 string delimitors for the total string length must be even.
    Buf.writeStringDelimiter(0);

    // 2. Write SMSC
    // Write EFsms SMSC string length
    Buf.writeUint32(2 * (smscLength + 1)); // Plus smscLength itself, in semi-octets
    // Write smscLength
    GsmPDUHelper.writeHexOctet(smscLength);
    // Write TOA & SMSC Address
    if (smscLength) {
      Buf.seekIncoming(-1 * (Buf.currentParcelSize - Buf.readAvailable
                             - 2 * UINT32_SIZE // Skip response_type, request_type.
                             - 2 * PDU_HEX_OCTET_SIZE)); // Skip messageStringLength & smscLength.
      Buf.copyIncomingToOutgoing(PDU_HEX_OCTET_SIZE * smscLength);
    }
    // Write 2 string delimitors for the total string length must be even.
    Buf.writeStringDelimiter(0);

    Buf.sendParcel();
  },

  /**
   * @param message A decoded SMS-DELIVER message.
   *
   * @see 3GPP TS 31.111 section 7.1.1
   */
  dataDownloadViaSMSPP: function dataDownloadViaSMSPP(message) {
    let options = {
      pid: message.pid,
      dcs: message.dcs,
      encoding: message.encoding,
    };
    Buf.newParcel(REQUEST_STK_SEND_ENVELOPE_WITH_STATUS, options);

    Buf.seekIncoming(-1 * (Buf.currentParcelSize - Buf.readAvailable
                           - 2 * UINT32_SIZE)); // Skip response_type & request_type.
    let messageStringLength = Buf.readUint32(); // In semi-octets
    let smscLength = GsmPDUHelper.readHexOctet(); // In octets, inclusive of TOA
    let tpduLength = (messageStringLength / 2) - (smscLength + 1); // In octets

    // Device identities: 4 bytes
    // Address: 0 or (2 + smscLength)
    // SMS TPDU: (2 or 3) + tpduLength
    let berLen = 4 +
                 (smscLength ? (2 + smscLength) : 0) +
                 (tpduLength <= 127 ? 2 : 3) + tpduLength; // In octets

    let parcelLength = (berLen <= 127 ? 2 : 3) + berLen; // In octets
    Buf.writeUint32(parcelLength * 2); // In semi-octets

    // Write a BER-TLV
    GsmPDUHelper.writeHexOctet(BER_SMS_PP_DOWNLOAD_TAG);
    if (berLen > 127) {
      GsmPDUHelper.writeHexOctet(0x81);
    }
    GsmPDUHelper.writeHexOctet(berLen);

    // Device Identifies-TLV
    GsmPDUHelper.writeHexOctet(COMPREHENSIONTLV_TAG_DEVICE_ID |
                               COMPREHENSIONTLV_FLAG_CR);
    GsmPDUHelper.writeHexOctet(0x02);
    GsmPDUHelper.writeHexOctet(STK_DEVICE_ID_NETWORK);
    GsmPDUHelper.writeHexOctet(STK_DEVICE_ID_SIM);

    // Address-TLV
    if (smscLength) {
      GsmPDUHelper.writeHexOctet(COMPREHENSIONTLV_TAG_ADDRESS);
      GsmPDUHelper.writeHexOctet(smscLength);
      Buf.copyIncomingToOutgoing(PDU_HEX_OCTET_SIZE * smscLength);
    }

    // SMS TPDU-TLV
    GsmPDUHelper.writeHexOctet(COMPREHENSIONTLV_TAG_SMS_TPDU |
                               COMPREHENSIONTLV_FLAG_CR);
    if (tpduLength > 127) {
      GsmPDUHelper.writeHexOctet(0x81);
    }
    GsmPDUHelper.writeHexOctet(tpduLength);
    Buf.copyIncomingToOutgoing(PDU_HEX_OCTET_SIZE * tpduLength);

    // Write 2 string delimitors for the total string length must be even.
    Buf.writeStringDelimiter(0);

    Buf.sendParcel();
  },

  /**
   * Read 1 + UDHL octets and construct user data header.
   *
   * @param msg
   *        message object for output.
   *
   * @see 3GPP TS 23.040 9.2.3.24
   */
  readUserDataHeader: function readUserDataHeader(msg) {
    /**
     * A header object with properties contained in received message.
     * The properties set include:
     *
     * length: totoal length of the header, default 0.
     * langIndex: used locking shift table index, default
     * PDU_NL_IDENTIFIER_DEFAULT.
     * langShiftIndex: used locking shift table index, default
     * PDU_NL_IDENTIFIER_DEFAULT.
     *
     */
    let header = {
      length: 0,
      langIndex: PDU_NL_IDENTIFIER_DEFAULT,
      langShiftIndex: PDU_NL_IDENTIFIER_DEFAULT
    };

    header.length = GsmPDUHelper.readHexOctet();
    if (DEBUG) debug("Read UDH length: " + header.length);

    let dataAvailable = header.length;
    while (dataAvailable >= 2) {
      let id = GsmPDUHelper.readHexOctet();
      let length = GsmPDUHelper.readHexOctet();
      if (DEBUG) debug("Read UDH id: " + id + ", length: " + length);

      dataAvailable -= 2;

      switch (id) {
        case PDU_IEI_CONCATENATED_SHORT_MESSAGES_8BIT: {
          let ref = GsmPDUHelper.readHexOctet();
          let max = GsmPDUHelper.readHexOctet();
          let seq = GsmPDUHelper.readHexOctet();
          dataAvailable -= 3;
          if (max && seq && (seq <= max)) {
            header.segmentRef = ref;
            header.segmentMaxSeq = max;
            header.segmentSeq = seq;
          }
          break;
        }
        case PDU_IEI_APPLICATION_PORT_ADDRESSING_SCHEME_8BIT: {
          let dstp = GsmPDUHelper.readHexOctet();
          let orip = GsmPDUHelper.readHexOctet();
          dataAvailable -= 2;
          if ((dstp < PDU_APA_RESERVED_8BIT_PORTS)
              || (orip < PDU_APA_RESERVED_8BIT_PORTS)) {
            // 3GPP TS 23.040 clause 9.2.3.24.3: "A receiving entity shall
            // ignore any information element where the value of the
            // Information-Element-Data is Reserved or not supported"
            break;
          }
          header.destinationPort = dstp;
          header.originatorPort = orip;
          break;
        }
        case PDU_IEI_APPLICATION_PORT_ADDRESSING_SCHEME_16BIT: {
          let dstp = (GsmPDUHelper.readHexOctet() << 8) | GsmPDUHelper.readHexOctet();
          let orip = (GsmPDUHelper.readHexOctet() << 8) | GsmPDUHelper.readHexOctet();
          dataAvailable -= 4;
          // 3GPP TS 23.040 clause 9.2.3.24.4: "A receiving entity shall
          // ignore any information element where the value of the
          // Information-Element-Data is Reserved or not supported"
          if ((dstp < PDU_APA_VALID_16BIT_PORTS)
              && (orip < PDU_APA_VALID_16BIT_PORTS)) {
            header.destinationPort = dstp;
            header.originatorPort = orip;
          }
          break;
        }
        case PDU_IEI_CONCATENATED_SHORT_MESSAGES_16BIT: {
          let ref = (GsmPDUHelper.readHexOctet() << 8) | GsmPDUHelper.readHexOctet();
          let max = GsmPDUHelper.readHexOctet();
          let seq = GsmPDUHelper.readHexOctet();
          dataAvailable -= 4;
          if (max && seq && (seq <= max)) {
            header.segmentRef = ref;
            header.segmentMaxSeq = max;
            header.segmentSeq = seq;
          }
          break;
        }
        case PDU_IEI_NATIONAL_LANGUAGE_SINGLE_SHIFT:
          let langShiftIndex = GsmPDUHelper.readHexOctet();
          --dataAvailable;
          if (langShiftIndex < PDU_NL_SINGLE_SHIFT_TABLES.length) {
            header.langShiftIndex = langShiftIndex;
          }
          break;
        case PDU_IEI_NATIONAL_LANGUAGE_LOCKING_SHIFT:
          let langIndex = GsmPDUHelper.readHexOctet();
          --dataAvailable;
          if (langIndex < PDU_NL_LOCKING_SHIFT_TABLES.length) {
            header.langIndex = langIndex;
          }
          break;
        case PDU_IEI_SPECIAL_SMS_MESSAGE_INDICATION:
          let msgInd = GsmPDUHelper.readHexOctet() & 0xFF;
          let msgCount = GsmPDUHelper.readHexOctet();
          dataAvailable -= 2;


          /*
           * TS 23.040 V6.8.1 Sec 9.2.3.24.2
           * bits 1 0   : basic message indication type
           * bits 4 3 2 : extended message indication type
           * bits 6 5   : Profile id
           * bit  7     : storage type
           */
          let storeType = msgInd & PDU_MWI_STORE_TYPE_BIT;
          let mwi = msg.mwi;
          if (!mwi) {
            mwi = msg.mwi = {};
          }

          if (storeType == PDU_MWI_STORE_TYPE_STORE) {
            // Store message because TP_UDH indicates so, note this may override
            // the setting in DCS, but that is expected
            mwi.discard = false;
          } else if (mwi.discard === undefined) {
            // storeType == PDU_MWI_STORE_TYPE_DISCARD
            // only override mwi.discard here if it hasn't already been set
            mwi.discard = true;
          }

          mwi.msgCount = msgCount & 0xFF;
          mwi.active = mwi.msgCount > 0;

          if (DEBUG) debug("MWI in TP_UDH received: " + JSON.stringify(mwi));

          break;
        default:
          if (DEBUG) {
            debug("readUserDataHeader: unsupported IEI(" + id
                  + "), " + length + " bytes.");
          }

          // Read out unsupported data
          if (length) {
            let octets;
            if (DEBUG) octets = new Uint8Array(length);

            for (let i = 0; i < length; i++) {
              let octet = GsmPDUHelper.readHexOctet();
              if (DEBUG) octets[i] = octet;
            }
            dataAvailable -= length;

            if (DEBUG) debug("readUserDataHeader: " + Array.slice(octets));
          }
          break;
      }
    }

    if (dataAvailable != 0) {
      throw new Error("Illegal user data header found!");
    }

    msg.header = header;
  },

  /**
   * Write out user data header.
   *
   * @param options
   *        Options containing information for user data header write-out. The
   *        `userDataHeaderLength` property must be correctly pre-calculated.
   */
  writeUserDataHeader: function writeUserDataHeader(options) {
    GsmPDUHelper.writeHexOctet(options.userDataHeaderLength);

    if (options.segmentMaxSeq > 1) {
      if (options.segmentRef16Bit) {
        GsmPDUHelper.writeHexOctet(PDU_IEI_CONCATENATED_SHORT_MESSAGES_16BIT);
        GsmPDUHelper.writeHexOctet(4);
        GsmPDUHelper.writeHexOctet((options.segmentRef >> 8) & 0xFF);
      } else {
        GsmPDUHelper.writeHexOctet(PDU_IEI_CONCATENATED_SHORT_MESSAGES_8BIT);
        GsmPDUHelper.writeHexOctet(3);
      }
      GsmPDUHelper.writeHexOctet(options.segmentRef & 0xFF);
      GsmPDUHelper.writeHexOctet(options.segmentMaxSeq & 0xFF);
      GsmPDUHelper.writeHexOctet(options.segmentSeq & 0xFF);
    }

    if (options.langIndex != PDU_NL_IDENTIFIER_DEFAULT) {
      GsmPDUHelper.writeHexOctet(PDU_IEI_NATIONAL_LANGUAGE_LOCKING_SHIFT);
      GsmPDUHelper.writeHexOctet(1);
      GsmPDUHelper.writeHexOctet(options.langIndex);
    }

    if (options.langShiftIndex != PDU_NL_IDENTIFIER_DEFAULT) {
      GsmPDUHelper.writeHexOctet(PDU_IEI_NATIONAL_LANGUAGE_SINGLE_SHIFT);
      GsmPDUHelper.writeHexOctet(1);
      GsmPDUHelper.writeHexOctet(options.langShiftIndex);
    }
  },

  /**
   * Read SM-TL Address.
   *
   * @param len
   *        Length of useful semi-octets within the Address-Value field. For
   *        example, the lenth of "12345" should be 5, and 4 for "1234".
   *
   * @see 3GPP TS 23.040 9.1.2.5
   */
  readAddress: function readAddress(len) {
    // Address Length
    if (!len || (len < 0)) {
      if (DEBUG) debug("PDU error: invalid sender address length: " + len);
      return null;
    }
    if (len % 2 == 1) {
      len += 1;
    }
    if (DEBUG) debug("PDU: Going to read address: " + len);

    // Type-of-Address
    let toa = GsmPDUHelper.readHexOctet();
    let addr = "";

    if ((toa & 0xF0) == PDU_TOA_ALPHANUMERIC) {
      addr = GsmPDUHelper.readSeptetsToString(Math.floor(len * 4 / 7), 0,
          PDU_NL_IDENTIFIER_DEFAULT , PDU_NL_IDENTIFIER_DEFAULT );
      return addr;
    }
    addr = GsmPDUHelper.readSwappedNibbleBcdString(len / 2);
    if (addr.length <= 0) {
      if (DEBUG) debug("PDU error: no number provided");
      return null;
    }
    if ((toa & 0xF0) == (PDU_TOA_INTERNATIONAL)) {
      addr = '+' + addr;
    }

    return addr;
  },

  /**
   * Read TP-Protocol-Indicator(TP-PID).
   *
   * @param msg
   *        message object for output.
   *
   * @see 3GPP TS 23.040 9.2.3.9
   */
  readProtocolIndicator: function readProtocolIndicator(msg) {
    // `The MS shall interpret reserved, obsolete, or unsupported values as the
    // value 00000000 but shall store them exactly as received.`
    msg.pid = GsmPDUHelper.readHexOctet();

    msg.epid = msg.pid;
    switch (msg.epid & 0xC0) {
      case 0x40:
        // Bit 7..0 = 01xxxxxx
        switch (msg.epid) {
          case PDU_PID_SHORT_MESSAGE_TYPE_0:
          case PDU_PID_ANSI_136_R_DATA:
          case PDU_PID_USIM_DATA_DOWNLOAD:
            return;
          case PDU_PID_RETURN_CALL_MESSAGE:
            // Level 1 of message waiting indication:
            // Only a return call message is provided
            let mwi = msg.mwi = {};

            // TODO: When should we de-activate the level 1 indicator?
            mwi.active = true;
            mwi.discard = false;
            mwi.msgCount = GECKO_VOICEMAIL_MESSAGE_COUNT_UNKNOWN;
            if (DEBUG) debug("TP-PID got return call message: " + msg.sender);
            return;
        }
        break;
    }

    msg.epid = PDU_PID_DEFAULT;
  },

  /**
   * Read TP-Data-Coding-Scheme(TP-DCS)
   *
   * @param msg
   *        message object for output.
   *
   * @see 3GPP TS 23.040 9.2.3.10, 3GPP TS 23.038 4.
   */
  readDataCodingScheme: function readDataCodingScheme(msg) {
    let dcs = GsmPDUHelper.readHexOctet();
    if (DEBUG) debug("PDU: read dcs: " + dcs);

    // No message class by default.
    let messageClass = PDU_DCS_MSG_CLASS_NORMAL;
    // 7 bit is the default fallback encoding.
    let encoding = PDU_DCS_MSG_CODING_7BITS_ALPHABET;
    switch (dcs & PDU_DCS_CODING_GROUP_BITS) {
      case 0x40: // bits 7..4 = 01xx
      case 0x50:
      case 0x60:
      case 0x70:
        // Bit 5..0 are coded exactly the same as Group 00xx
      case 0x00: // bits 7..4 = 00xx
      case 0x10:
      case 0x20:
      case 0x30:
        if (dcs & 0x10) {
          messageClass = dcs & PDU_DCS_MSG_CLASS_BITS;
        }
        switch (dcs & 0x0C) {
          case 0x4:
            encoding = PDU_DCS_MSG_CODING_8BITS_ALPHABET;
            break;
          case 0x8:
            encoding = PDU_DCS_MSG_CODING_16BITS_ALPHABET;
            break;
        }
        break;

      case 0xE0: // bits 7..4 = 1110
        encoding = PDU_DCS_MSG_CODING_16BITS_ALPHABET;
        // Bit 3..0 are coded exactly the same as Message Waiting Indication
        // Group 1101.
      case 0xC0: // bits 7..4 = 1100
      case 0xD0: // bits 7..4 = 1101
        // Indiciates voicemail indicator set or clear
        let active = (dcs & PDU_DCS_MWI_ACTIVE_BITS) == PDU_DCS_MWI_ACTIVE_VALUE;

        // If TP-UDH is present, these values will be overwritten
        switch (dcs & PDU_DCS_MWI_TYPE_BITS) {
          case PDU_DCS_MWI_TYPE_VOICEMAIL:
            let mwi = msg.mwi;
            if (!mwi) {
              mwi = msg.mwi = {};
            }

            mwi.active = active;
            mwi.discard = (dcs & PDU_DCS_CODING_GROUP_BITS) == 0xC0;
            mwi.msgCount = active ? GECKO_VOICEMAIL_MESSAGE_COUNT_UNKNOWN : 0;

            if (DEBUG) {
              debug("MWI in DCS received for voicemail: " + JSON.stringify(mwi));
            }
            break;
          case PDU_DCS_MWI_TYPE_FAX:
            if (DEBUG) debug("MWI in DCS received for fax");
            break;
          case PDU_DCS_MWI_TYPE_EMAIL:
            if (DEBUG) debug("MWI in DCS received for email");
            break;
          default:
            if (DEBUG) debug("MWI in DCS received for \"other\"");
            break;
        }
        break;

      case 0xF0: // bits 7..4 = 1111
        if (dcs & 0x04) {
          encoding = PDU_DCS_MSG_CODING_8BITS_ALPHABET;
        }
        messageClass = dcs & PDU_DCS_MSG_CLASS_BITS;
        break;

      default:
        // Falling back to default encoding.
        break;
    }

    msg.dcs = dcs;
    msg.encoding = encoding;
    msg.messageClass = GECKO_SMS_MESSAGE_CLASSES[messageClass];

    if (DEBUG) debug("PDU: message encoding is " + encoding + " bit.");
  },

  /**
   * Read GSM TP-Service-Centre-Time-Stamp(TP-SCTS).
   *
   * @see 3GPP TS 23.040 9.2.3.11
   */
  readTimestamp: function readTimestamp() {
    let year   = GsmPDUHelper.readSwappedNibbleBcdNum(1) + PDU_TIMESTAMP_YEAR_OFFSET;
    let month  = GsmPDUHelper.readSwappedNibbleBcdNum(1) - 1;
    let day    = GsmPDUHelper.readSwappedNibbleBcdNum(1);
    let hour   = GsmPDUHelper.readSwappedNibbleBcdNum(1);
    let minute = GsmPDUHelper.readSwappedNibbleBcdNum(1);
    let second = GsmPDUHelper.readSwappedNibbleBcdNum(1);
    let timestamp = Date.UTC(year, month, day, hour, minute, second);

    // If the most significant bit of the least significant nibble is 1,
    // the timezone offset is negative (fourth bit from the right => 0x08):
    //   localtime = UTC + tzOffset
    // therefore
    //   UTC = localtime - tzOffset
    let tzOctet = GsmPDUHelper.readHexOctet();
    let tzOffset = GsmPDUHelper.octetToBCD(tzOctet & ~0x08) * 15 * 60 * 1000;
    tzOffset = (tzOctet & 0x08) ? -tzOffset : tzOffset;
    timestamp -= tzOffset;

    return timestamp;
  },

  /**
   * User data can be 7 bit (default alphabet) data, 8 bit data, or 16 bit
   * (UCS2) data.
   *
   * @param msg
   *        message object for output.
   * @param length
   *        length of user data to read in octets.
   */
  readUserData: function readUserData(msg, length) {
    if (DEBUG) {
      debug("Reading " + length + " bytes of user data.");
    }

    let paddingBits = 0;
    if (msg.udhi) {
      this.readUserDataHeader(msg);

      if (msg.encoding == PDU_DCS_MSG_CODING_7BITS_ALPHABET) {
        let headerBits = (msg.header.length + 1) * 8;
        let headerSeptets = Math.ceil(headerBits / 7);

        length -= headerSeptets;
        paddingBits = headerSeptets * 7 - headerBits;
      } else {
        length -= (msg.header.length + 1);
      }
    }

    if (DEBUG) debug("After header, " + length + " septets left of user data");

    msg.body = null;
    msg.data = null;
    switch (msg.encoding) {
      case PDU_DCS_MSG_CODING_7BITS_ALPHABET:
        // 7 bit encoding allows 140 octets, which means 160 characters
        // ((140x8) / 7 = 160 chars)
        if (length > PDU_MAX_USER_DATA_7BIT) {
          if (DEBUG) debug("PDU error: user data is too long: " + length);
          break;
        }

        let langIndex = msg.udhi ? msg.header.langIndex : PDU_NL_IDENTIFIER_DEFAULT;
        let langShiftIndex = msg.udhi ? msg.header.langShiftIndex : PDU_NL_IDENTIFIER_DEFAULT;
        msg.body = GsmPDUHelper.readSeptetsToString(length, paddingBits, langIndex,
                                            langShiftIndex);
        break;
      case PDU_DCS_MSG_CODING_8BITS_ALPHABET:
        msg.data = GsmPDUHelper.readHexOctetArray(length);
        break;
      case PDU_DCS_MSG_CODING_16BITS_ALPHABET:
        msg.body = GsmPDUHelper.readUCS2String(length);
        break;
    }
  },

  /**
   * Read extra parameters if TP-PI is set.
   *
   * @param msg
   *        message object for output.
   */
  readExtraParams: function readExtraParams(msg) {
    // Because each PDU octet is converted to two UCS2 char2, we should always
    // get even messageStringLength in SMS#processReceivedSms(). So, we'll
    // always need two delimitors at the end.
    if (Buf.readAvailable <= 4) {
      return;
    }

    // TP-Parameter-Indicator
    let pi;
    do {
      // `The most significant bit in octet 1 and any other TP-PI octets which
      // may be added later is reserved as an extension bit which when set to a
      // 1 shall indicate that another TP-PI octet follows immediately
      // afterwards.` ~ 3GPP TS 23.040 9.2.3.27
      pi = GsmPDUHelper.readHexOctet();
    } while (pi & PDU_PI_EXTENSION);

    // `If the TP-UDL bit is set to "1" but the TP-DCS bit is set to "0" then
    // the receiving entity shall for TP-DCS assume a value of 0x00, i.e. the
    // 7bit default alphabet.` ~ 3GPP 23.040 9.2.3.27
    msg.dcs = 0;
    msg.encoding = PDU_DCS_MSG_CODING_7BITS_ALPHABET;

    // TP-Protocol-Identifier
    if (pi & PDU_PI_PROTOCOL_IDENTIFIER) {
      this.readProtocolIndicator(msg);
    }
    // TP-Data-Coding-Scheme
    if (pi & PDU_PI_DATA_CODING_SCHEME) {
      this.readDataCodingScheme(msg);
    }
    // TP-User-Data-Length
    if (pi & PDU_PI_USER_DATA_LENGTH) {
      let userDataLength = GsmPDUHelper.readHexOctet();
      this.readUserData(msg, userDataLength);
    }
  },

  /**
   * Read and decode a PDU-encoded message from the stream.
   *
   * TODO: add some basic sanity checks like:
   * - do we have the minimum number of chars available
   */
  readMessage: function readMessage() {
    // An empty message object. This gets filled below and then returned.
    let msg = {
      // D:DELIVER, DR:DELIVER-REPORT, S:SUBMIT, SR:SUBMIT-REPORT,
      // ST:STATUS-REPORT, C:COMMAND
      // M:Mandatory, O:Optional, X:Unavailable
      //                  D  DR S  SR ST C
      SMSC:      null, // M  M  M  M  M  M
      mti:       null, // M  M  M  M  M  M
      udhi:      null, // M  M  O  M  M  M
      sender:    null, // M  X  X  X  X  X
      recipient: null, // X  X  M  X  M  M
      pid:       null, // M  O  M  O  O  M
      epid:      null, // M  O  M  O  O  M
      dcs:       null, // M  O  M  O  O  X
      mwi:       null, // O  O  O  O  O  O
      replace:  false, // O  O  O  O  O  O
      header:    null, // M  M  O  M  M  M
      body:      null, // M  O  M  O  O  O
      data:      null, // M  O  M  O  O  O
      timestamp: null, // M  X  X  X  X  X
      status:    null, // X  X  X  X  M  X
      scts:      null, // X  X  X  M  M  X
      dt:        null, // X  X  X  X  M  X
    };

    // SMSC info
    let smscLength = GsmPDUHelper.readHexOctet();
    if (smscLength > 0) {
      let smscTypeOfAddress = GsmPDUHelper.readHexOctet();
      // Subtract the type-of-address octet we just read from the length.
      msg.SMSC = GsmPDUHelper.readSwappedNibbleBcdString(smscLength - 1);
      if ((smscTypeOfAddress >> 4) == (PDU_TOA_INTERNATIONAL >> 4)) {
        msg.SMSC = '+' + msg.SMSC;
      }
    }

    // First octet of this SMS-DELIVER or SMS-SUBMIT message
    let firstOctet = GsmPDUHelper.readHexOctet();
    // Message Type Indicator
    msg.mti = firstOctet & 0x03;
    // User data header indicator
    msg.udhi = firstOctet & PDU_UDHI;

    switch (msg.mti) {
      case PDU_MTI_SMS_RESERVED:
        // `If an MS receives a TPDU with a "Reserved" value in the TP-MTI it
        // shall process the message as if it were an "SMS-DELIVER" but store
        // the message exactly as received.` ~ 3GPP TS 23.040 9.2.3.1
      case PDU_MTI_SMS_DELIVER:
        return this.readDeliverMessage(msg);
      case PDU_MTI_SMS_STATUS_REPORT:
        return this.readStatusReportMessage(msg);
      default:
        return null;
    }
  },

  /**
   * Read and decode a SMS-DELIVER PDU.
   *
   * @param msg
   *        message object for output.
   */
  readDeliverMessage: function readDeliverMessage(msg) {
    // - Sender Address info -
    let senderAddressLength = GsmPDUHelper.readHexOctet();
    msg.sender = this.readAddress(senderAddressLength);
    // - TP-Protocolo-Identifier -
    this.readProtocolIndicator(msg);
    // - TP-Data-Coding-Scheme -
    this.readDataCodingScheme(msg);
    // - TP-Service-Center-Time-Stamp -
    msg.timestamp = this.readTimestamp();
    // - TP-User-Data-Length -
    let userDataLength = GsmPDUHelper.readHexOctet();

    // - TP-User-Data -
    if (userDataLength > 0) {
      this.readUserData(msg, userDataLength);
    }

    return msg;
  },

  /**
   * Read and decode a SMS-STATUS-REPORT PDU.
   *
   * @param msg
   *        message object for output.
   */
  readStatusReportMessage: function readStatusReportMessage(msg) {
    // TP-Message-Reference
    msg.messageRef = GsmPDUHelper.readHexOctet();
    // TP-Recipient-Address
    let recipientAddressLength = GsmPDUHelper.readHexOctet();
    msg.recipient = this.readAddress(recipientAddressLength);
    // TP-Service-Centre-Time-Stamp
    msg.scts = this.readTimestamp();
    // TP-Discharge-Time
    msg.dt = this.readTimestamp();
    // TP-Status
    msg.status = GsmPDUHelper.readHexOctet();

    this.readExtraParams(msg);

    return msg;
  },

  /**
   * Serialize a SMS-SUBMIT PDU message and write it to the output stream.
   *
   * This method expects that a data coding scheme has been chosen already
   * and that the length of the user data payload in that encoding is known,
   * too. Both go hand in hand together anyway.
   *
   * @param address
   *        String containing the address (number) of the SMS receiver
   * @param userData
   *        String containing the message to be sent as user data
   * @param dcs
   *        Data coding scheme. One of the PDU_DCS_MSG_CODING_*BITS_ALPHABET
   *        constants.
   * @param userDataHeaderLength
   *        Length of embedded user data header, in bytes. The whole header
   *        size will be userDataHeaderLength + 1; 0 for no header.
   * @param encodedBodyLength
   *        Length of the user data when encoded with the given DCS. For UCS2,
   *        in bytes; for 7-bit, in septets.
   * @param langIndex
   *        Table index used for normal 7-bit encoded character lookup.
   * @param langShiftIndex
   *        Table index used for escaped 7-bit encoded character lookup.
   * @param requestStatusReport
   *        Request status report.
   */
  writeMessage: function writeMessage(options) {
    if (DEBUG) {
      debug("writeMessage: " + JSON.stringify(options));
    }
    let address = options.number;
    let body = options.body;
    let dcs = options.dcs;
    let userDataHeaderLength = options.userDataHeaderLength;
    let encodedBodyLength = options.encodedBodyLength;
    let langIndex = options.langIndex;
    let langShiftIndex = options.langShiftIndex;
    let strict7BitEncoding = options.strict7BitEncoding;

    // SMS-SUBMIT Format:
    //
    // PDU Type - 1 octet
    // Message Reference - 1 octet
    // DA - Destination Address - 2 to 12 octets
    // PID - Protocol Identifier - 1 octet
    // DCS - Data Coding Scheme - 1 octet
    // VP - Validity Period - 0, 1 or 7 octets
    // UDL - User Data Length - 1 octet
    // UD - User Data - 140 octets

    let addressFormat = PDU_TOA_ISDN; // 81
    if (address[0] == '+') {
      addressFormat = PDU_TOA_INTERNATIONAL | PDU_TOA_ISDN; // 91
      address = address.substring(1);
    }
    //TODO validity is unsupported for now
    let validity = 0;

    let headerOctets = (userDataHeaderLength ? userDataHeaderLength + 1 : 0);
    let paddingBits;
    let userDataLengthInSeptets;
    let userDataLengthInOctets;
    if (dcs == PDU_DCS_MSG_CODING_7BITS_ALPHABET) {
      let headerSeptets = Math.ceil(headerOctets * 8 / 7);
      userDataLengthInSeptets = headerSeptets + encodedBodyLength;
      userDataLengthInOctets = Math.ceil(userDataLengthInSeptets * 7 / 8);
      paddingBits = headerSeptets * 7 - headerOctets * 8;
    } else {
      userDataLengthInOctets = headerOctets + encodedBodyLength;
      paddingBits = 0;
    }

    let pduOctetLength = 4 + // PDU Type, Message Ref, address length + format
                         Math.ceil(address.length / 2) +
                         3 + // PID, DCS, UDL
                         userDataLengthInOctets;
    if (validity) {
      //TODO: add more to pduOctetLength
    }

    // Start the string. Since octets are represented in hex, we will need
    // twice as many characters as octets.
    Buf.writeUint32(pduOctetLength * 2);

    // - PDU-TYPE-

    // +--------+----------+---------+---------+--------+---------+
    // | RP (1) | UDHI (1) | SRR (1) | VPF (2) | RD (1) | MTI (2) |
    // +--------+----------+---------+---------+--------+---------+
    // RP:    0   Reply path parameter is not set
    //        1   Reply path parameter is set
    // UDHI:  0   The UD Field contains only the short message
    //        1   The beginning of the UD field contains a header in addition
    //            of the short message
    // SRR:   0   A status report is not requested
    //        1   A status report is requested
    // VPF:   bit4  bit3
    //        0     0     VP field is not present
    //        0     1     Reserved
    //        1     0     VP field present an integer represented (relative)
    //        1     1     VP field present a semi-octet represented (absolute)
    // RD:        Instruct the SMSC to accept(0) or reject(1) an SMS-SUBMIT
    //            for a short message still held in the SMSC which has the same
    //            MR and DA as a previously submitted short message from the
    //            same OA
    // MTI:   bit1  bit0    Message Type
    //        0     0       SMS-DELIVER (SMSC ==> MS)
    //        0     1       SMS-SUBMIT (MS ==> SMSC)

    // PDU type. MTI is set to SMS-SUBMIT
    let firstOctet = PDU_MTI_SMS_SUBMIT;

    // Status-Report-Request
    if (options.requestStatusReport) {
      firstOctet |= PDU_SRI_SRR;
    }

    // Validity period
    if (validity) {
      //TODO: not supported yet, OR with one of PDU_VPF_*
    }
    // User data header indicator
    if (headerOctets) {
      firstOctet |= PDU_UDHI;
    }
    GsmPDUHelper.writeHexOctet(firstOctet);

    // Message reference 00
    GsmPDUHelper.writeHexOctet(0x00);

    // - Destination Address -
    GsmPDUHelper.writeHexOctet(address.length);
    GsmPDUHelper.writeHexOctet(addressFormat);
    GsmPDUHelper.writeSwappedNibbleBCD(address);

    // - Protocol Identifier -
    GsmPDUHelper.writeHexOctet(0x00);

    // - Data coding scheme -
    // For now it assumes bits 7..4 = 1111 except for the 16 bits use case
    GsmPDUHelper.writeHexOctet(dcs);

    // - Validity Period -
    if (validity) {
      GsmPDUHelper.writeHexOctet(validity);
    }

    // - User Data -
    if (dcs == PDU_DCS_MSG_CODING_7BITS_ALPHABET) {
      GsmPDUHelper.writeHexOctet(userDataLengthInSeptets);
    } else {
      GsmPDUHelper.writeHexOctet(userDataLengthInOctets);
    }

    if (headerOctets) {
      GsmPDUHelper.writeUserDataHeader(options);
    }

    switch (dcs) {
      case PDU_DCS_MSG_CODING_7BITS_ALPHABET:
        GsmPDUHelper.writeStringAsSeptets(body, paddingBits, langIndex, langShiftIndex,
                                  strict7BitEncoding);
        break;
      case PDU_DCS_MSG_CODING_8BITS_ALPHABET:
        // Unsupported.
        break;
      case PDU_DCS_MSG_CODING_16BITS_ALPHABET:
        GsmPDUHelper.writeUCS2String(body);
        break;
    }

    // End of the string. The string length is always even by definition, so
    // we write two \0 delimiters.
    Buf.writeUint16(0);
    Buf.writeUint16(0);
  },

  /**
   * Helper for processing received SMS parcel data.
   *
   * @param length
   *        Length of SMS string in the incoming parcel.
   *
   * @return Message parsed or null for invalid message.
   */
  processReceivedSms: function processReceivedSms(length) {
    if (!length) {
      if (DEBUG) debug("Received empty SMS!");
      return null;
    }

    // An SMS is a string, but we won't read it as such, so let's read the
    // string length and then defer to PDU parsing helper.
    let messageStringLength = Buf.readUint32();
    if (DEBUG) debug("Got new SMS, length " + messageStringLength);
    let message = GsmPDUHelper.readMessage();
    if (DEBUG) debug("Got new SMS: " + JSON.stringify(message));

    // Read string delimiters. See Buf.readString().
    Buf.readStringDelimiter(length);

    return message;
  },

  /**
   * Helper for processing SMS-DELIVER PDUs.
   *
   * @param length
   *        Length of SMS string in the incoming parcel.
   *
   * @return A failure cause defined in 3GPP 23.040 clause 9.2.3.22.
   */
  processSmsDeliver: function processSmsDeliver(length) {
    let message = this.processReceivedSms(length);
    if (!message) {
      return PDU_FCS_UNSPECIFIED;
    }

    if (message.epid == PDU_PID_SHORT_MESSAGE_TYPE_0) {
      // `A short message type 0 indicates that the ME must acknowledge receipt
      // of the short message but shall discard its contents.` ~ 3GPP TS 23.040
      // 9.2.3.9
      return PDU_FCS_OK;
    }

    if (message.messageClass == GECKO_SMS_MESSAGE_CLASSES[PDU_DCS_MSG_CLASS_2]) {
      switch (message.epid) {
        case PDU_PID_ANSI_136_R_DATA:
        case PDU_PID_USIM_DATA_DOWNLOAD:
          if (ICC.isICCServiceAvailable("DATA_DOWNLOAD_SMS_PP")) {
            // `If the service "data download via SMS Point-to-Point" is
            // allocated and activated in the (U)SIM Service Table, ... then the
            // ME shall pass the message transparently to the UICC using the
            // ENVELOPE (SMS-PP DOWNLOAD).` ~ 3GPP TS 31.111 7.1.1.1
            this.dataDownloadViaSMSPP(message);

            // `the ME shall not display the message, or alert the user of a
            // short message waiting.` ~ 3GPP TS 31.111 7.1.1.1
            return PDU_FCS_RESERVED;
          }

          // If the service "data download via SMS-PP" is not available in the
          // (U)SIM Service Table, ..., then the ME shall store the message in
          // EFsms in accordance with TS 31.102` ~ 3GPP TS 31.111 7.1.1.1
        default:
          this.writeSmsToSIM(message);
          break;
      }
    }

    // TODO: Bug 739143: B2G SMS: Support SMS Storage Full event
    if ((message.messageClass != GECKO_SMS_MESSAGE_CLASSES[PDU_DCS_MSG_CLASS_0]) && !true) {
      // `When a mobile terminated message is class 0..., the MS shall display
      // the message immediately and send a ACK to the SC ..., irrespective of
      // whether there is memory available in the (U)SIM or ME.` ~ 3GPP 23.038
      // clause 4.

      if (message.messageClass == GECKO_SMS_MESSAGE_CLASSES[PDU_DCS_MSG_CLASS_2]) {
        // `If all the short message storage at the MS is already in use, the
        // MS shall return "memory capacity exceeded".` ~ 3GPP 23.038 clause 4.
        return PDU_FCS_MEMORY_CAPACITY_EXCEEDED;
      }

      return PDU_FCS_UNSPECIFIED;
    }

    if (message.header && (message.header.segmentMaxSeq > 1)) {
      message = this.processReceivedSmsSegment(message);
    } else {
      if (message.encoding == PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
        message.fullData = message.data;
        delete message.data;
      } else {
        message.fullBody = message.body;
        delete message.body;
      }
    }

    if (message) {
      message.rilMessageType = "sms-received";
      RIL.sendDOMMessage(message);
    }

    if (message && message.messageClass == GECKO_SMS_MESSAGE_CLASSES[PDU_DCS_MSG_CLASS_2]) {
      // `MS shall ensure that the message has been to the SMS data field in
      // the (U)SIM before sending an ACK to the SC.`  ~ 3GPP 23.038 clause 4
      return PDU_FCS_RESERVED;
    }

    return PDU_FCS_OK;
  },

  /**
   * Helper for processing SMS-STATUS-REPORT PDUs.
   *
   * @param length
   *        Length of SMS string in the incoming parcel.
   *
   * @return A failure cause defined in 3GPP 23.040 clause 9.2.3.22.
   */
  processSmsStatusReport: function processSmsStatusReport(length) {
    let message = this.processReceivedSms(length);
    if (!message) {
      if (DEBUG) debug("invalid SMS-STATUS-REPORT");
      return PDU_FCS_UNSPECIFIED;
    }

    let options = this.pendingSentSmsMap[message.messageRef];
    if (!options) {
      if (DEBUG) debug("no pending SMS-SUBMIT message");
      return PDU_FCS_OK;
    }

    let status = message.status;

    // 3GPP TS 23.040 9.2.3.15 `The MS shall interpret any reserved values as
    // "Service Rejected"(01100011) but shall store them exactly as received.`
    if ((status >= 0x80)
        || ((status >= PDU_ST_0_RESERVED_BEGIN)
            && (status < PDU_ST_0_SC_SPECIFIC_BEGIN))
        || ((status >= PDU_ST_1_RESERVED_BEGIN)
            && (status < PDU_ST_1_SC_SPECIFIC_BEGIN))
        || ((status >= PDU_ST_2_RESERVED_BEGIN)
            && (status < PDU_ST_2_SC_SPECIFIC_BEGIN))
        || ((status >= PDU_ST_3_RESERVED_BEGIN)
            && (status < PDU_ST_3_SC_SPECIFIC_BEGIN))
        ) {
      status = PDU_ST_3_SERVICE_REJECTED;
    }

    // Pending. Waiting for next status report.
    if ((status >>> 5) == 0x01) {
      if (DEBUG) debug("SMS-STATUS-REPORT: delivery still pending");
      return PDU_FCS_OK;
    }

    delete this.pendingSentSmsMap[message.messageRef];

    if ((options.segmentMaxSeq > 1)
        && (options.segmentSeq < options.segmentMaxSeq)) {
      // Not the last segment.
      return PDU_FCS_OK;
    }

    let deliveryStatus = ((status >>> 5) == 0x00)
                       ? GECKO_SMS_DELIVERY_STATUS_SUCCESS
                       : GECKO_SMS_DELIVERY_STATUS_ERROR;
    RIL.sendDOMMessage({
      rilMessageType: "sms-delivery",
      envelopeId: options.envelopeId,
      deliveryStatus: deliveryStatus
    });

    return PDU_FCS_OK;
  },

  /**
   * Helper for processing received multipart SMS.
   *
   * @return null for handled segments, and an object containing full message
   *         body/data once all segments are received.
   */
  processReceivedSmsSegment: function processReceivedSmsSegment(original) {
    let hash = original.sender + ":" + original.header.segmentRef;
    let seq = original.header.segmentSeq;

    let options = this.receivedSmsSegmentsMap[hash];
    if (!options) {
      options = original;
      this.receivedSmsSegmentsMap[hash] = options;

      options.segmentMaxSeq = original.header.segmentMaxSeq;
      options.receivedSegments = 0;
      options.segments = [];
    } else if (options.segments[seq]) {
      // Duplicated segment?
      if (DEBUG) {
        debug("Got duplicated segment no." + seq + " of a multipart SMS: "
              + JSON.stringify(original));
      }
      return null;
    }

    if (options.encoding == PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
      options.segments[seq] = original.data;
      delete original.data;
    } else {
      options.segments[seq] = original.body;
      delete original.body;
    }
    options.receivedSegments++;
    if (options.receivedSegments < options.segmentMaxSeq) {
      if (DEBUG) {
        debug("Got segment no." + seq + " of a multipart SMS: "
              + JSON.stringify(options));
      }
      return null;
    }

    // Remove from map
    delete this.receivedSmsSegmentsMap[hash];

    // Rebuild full body
    if (options.encoding == PDU_DCS_MSG_CODING_8BITS_ALPHABET) {
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

    if (DEBUG) {
      debug("Got full multipart SMS: " + JSON.stringify(options));
    }

    return options;
  },

  /**
   * Helper for processing sent multipart SMS.
   */
  processSentSmsSegment: function processSentSmsSegment(options) {
    // Setup attributes for sending next segment
    let next = options.segmentSeq;
    options.body = options.segments[next].body;
    options.encodedBodyLength = options.segments[next].encodedBodyLength;
    options.segmentSeq = next + 1;

    this.handleSendSMS(options);
  },

  ////////////  Public Utility Functions ////////////

  /**
   * Acknowledge the receipt and handling of an SMS.
   *
   * @param success
   *        Boolean indicating whether the message was successfuly handled.
   * @param cause
   *        SMS_* constant indicating the reason for unsuccessful handling.
   */
  acknowledgeSMS: function acknowledgeSMS(success, cause) {
    let token = Buf.newParcel(REQUEST_SMS_ACKNOWLEDGE);
    Buf.writeUint32(2);
    Buf.writeUint32(success ? 1 : 0);
    Buf.writeUint32(cause);
    Buf.sendParcel();
  },

  /**
   * @param success A boolean value indicating the result of previous
   *                SMS-DELIVER message handling.
   * @param responsePduLen ICC IO response PDU length in octets.
   * @param options An object that contains four attributes: `pid`, `dcs`,
   *                `encoding` and `responsePduLen`.
   *
   * @see 3GPP TS 23.040 section 9.2.2.1a
   */
  acknowledgeIncomingGsmSmsWithPDU: function acknowledgeIncomingGsmSmsWithPDU(success, responsePduLen, options) {
    Buf.newParcel(REQUEST_ACKNOWLEDGE_INCOMING_GSM_SMS_WITH_PDU);

    // Two strings.
    Buf.writeUint32(2);

    // String 1: Success
    Buf.writeString(success ? "1" : "0");

    // String 2: RP-ACK/RP-ERROR PDU
    Buf.writeUint32(2 * (responsePduLen + (success ? 5 : 6))); // In semi-octet
    // 1. TP-MTI & TP-UDHI
    GsmPDUHelper.writeHexOctet(PDU_MTI_SMS_DELIVER);
    if (!success) {
      // 2. TP-FCS
      GsmPDUHelper.writeHexOctet(PDU_FCS_USIM_DATA_DOWNLOAD_ERROR);
    }
    // 3. TP-PI
    GsmPDUHelper.writeHexOctet(PDU_PI_USER_DATA_LENGTH |
                               PDU_PI_DATA_CODING_SCHEME |
                               PDU_PI_PROTOCOL_IDENTIFIER);
    // 4. TP-PID
    GsmPDUHelper.writeHexOctet(options.pid);
    // 5. TP-DCS
    GsmPDUHelper.writeHexOctet(options.dcs);
    // 6. TP-UDL
    if (options.encoding == PDU_DCS_MSG_CODING_7BITS_ALPHABET) {
      GsmPDUHelper.writeHexOctet(Math.floor(responsePduLen * 8 / 7));
    } else {
      GsmPDUHelper.writeHexOctet(responsePduLen);
    }
    // TP-UD
    Buf.copyIncomingToOutgoing(PDU_HEX_OCTET_SIZE * responsePduLen);
    // Write 2 string delimitors for the total string length must be even.
    Buf.writeStringDelimiter(0);

    Buf.sendParcel();
  },

  ////////////  DOM Message Handlers ////////////

  /**
   * Send an SMS.
   *
   * The `options` parameter object should contain the following attributes:
   *
   * @param number
   *        String containing the recipient number.
   * @param body
   *        String containing the message text.
   * @param requestId
   *        String identifying the sms request used by the SmsRequestManager.
   * @param processId
   *        String containing the processId for the SmsRequestManager.
   */
  handleSendSMS: function handleSendSMS(options) {
    //TODO: verify values on 'options'

    if (!options.retryCount) {
      options.retryCount = 0;
    }

    if (options.segmentMaxSeq > 1) {
      if (!options.segmentSeq) {
        // Fist segment to send
        options.segmentSeq = 1;
        options.body = options.segments[0].body;
        options.encodedBodyLength = options.segments[0].encodedBodyLength;
      }
    } else {
      options.body = options.fullBody;
      options.encodedBodyLength = options.encodedFullBodyLength;
    }

    Buf.newParcel(REQUEST_SEND_SMS, options);
    Buf.writeUint32(2);
    Buf.writeString(options.SMSC);
    GsmPDUHelper.writeMessage(options);
    Buf.sendParcel();
  }
};

// SMS-specific parcel handlers

this.SMS[REQUEST_SEND_SMS] = function REQUEST_SEND_SMS(length, options) {
  if (options.rilRequestError) {
    if (DEBUG) debug("REQUEST_SEND_SMS: rilRequestError = " + options.rilRequestError);
    switch (options.rilRequestError) {
      case ERROR_SMS_SEND_FAIL_RETRY:
        if (options.retryCount < SMS_RETRY_MAX) {
          options.retryCount++;
          // TODO: bug 736702 TP-MR, retry interval, retry timeout
          this.handleSendSMS(options);
          break;
        }

        // Fallback to default error handling if it meets max retry count.
      default:
        this.sendDOMMessage({
          rilMessageType: "sms-send-failed",
          envelopeId: options.envelopeId,
          error: options.rilRequestError,
        });
        break;
    }
    return;
  }

  options.messageRef = Buf.readUint32();
  options.ackPDU = Buf.readString();
  options.errorCode = Buf.readUint32();

  if (options.requestStatusReport) {
    if (DEBUG) debug("waiting SMS-STATUS-REPORT for messageRef " + options.messageRef);
    this._pendingSentSmsMap[options.messageRef] = options;
  }

  if ((options.segmentMaxSeq > 1)
      && (options.segmentSeq < options.segmentMaxSeq)) {
    // Not last segment
    this._processSentSmsSegment(options);
  } else {
    // Last segment sent with success. Report it.
    this.sendDOMMessage({
      rilMessageType: "sms-sent",
      envelopeId: options.envelopeId,
    });
  }
};

this.SMS[REQUEST_WRITE_SMS_TO_SIM] = function REQUEST_WRITE_SMS_TO_SIM(length, options) {
  if (options.rilRequestError) {
    // `The MS shall return a "protocol error, unspecified" error message if
    // the short message cannot be stored in the (U)SIM, and there is other
    // message storage available at the MS` ~ 3GPP TS 23.038 section 4. Here
    // we assume we always have indexed db as another storage.
    this.acknowledgeSMS(false, PDU_FCS_PROTOCOL_ERROR);
  } else {
    this.acknowledgeSMS(true, PDU_FCS_OK);
  }
};

this.SMS[UNSOLICITED_RESPONSE_NEW_SMS] = function UNSOLICITED_RESPONSE_NEW_SMS(length) {
  let result = this.processSmsDeliver(length);
  if (result != PDU_FCS_RESERVED) {
    // Not reserved FCS values, send ACK now.
    this.acknowledgeSMS(result == PDU_FCS_OK, result);
  }
};

this.SMS[UNSOLICITED_RESPONSE_NEW_SMS_STATUS_REPORT] = function UNSOLICITED_RESPONSE_NEW_SMS_STATUS_REPORT(length) {
  let result = this.processSmsStatusReport(length);
  this.acknowledgeSMS(result == PDU_FCS_OK, result);
};

// Allow this file to be imported via Components.utils.import().
this.EXPORTED_SYMBOLS = Object.keys(this);
