/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

interface MozIccInfo;

enum IccCardState
{
  "unknown", // ICC card state is either not yet reported from modem or in an
             // unknown state.
  "ready",
  "pinRequired",
  "pukRequired",
  "permanentBlocked",

  /**
   * Personalization States
   */

  "personalizationInProgress",
  "personalizationReady",

  // SIM Personalization States.

  "networkLocked",
  "networkSubsetLocked",
  "corporateLocked",
  "serviceProviderLocked",
  "simPersonalizationLocked",
  "networkPukRequired",
  "networkSubsetPukRequired",
  "corporatePukRequired",
  "serviceProviderPukRequired",
  "simPersonalizationPukRequired",

  // RUIM Personalization States.

  "network1Locked",
  "network2Locked",
  "hrpdNetworkLocked",
  "ruimCorporateLocked",
  "ruimServiceProviderLocked",
  "ruimPersonalizationLocked",
  "network1PukRequired",
  "network2PukRequired",
  "hrpdNetworkPukRequired",
  "ruimCorporatePukRequired",
  "ruimServiceProviderPukRequired",
  "ruimPersonalizationPukRequired",

  /**
   * Additional States.
   */

  "illegal" // See Bug 916000. An owed pay card will be rejected by the network
            // and fall in this state.
};

enum IccMvnoType
{
  "imsi",
  "spn",
  "gid"
};

enum IccContactType
{
  "adn", // Abbreviated Dialling Number.
  "fdn", // Fixed Dialling Number.
  "sdn"  // Service Dialling Number.
};

enum IccCardLockType
{
  "pin",
  "pin2",
  "puk",
  "puk2",
  "nck",      // Network depersonalization -- network control key (NCK).
  "nck1",     // Network type 1 depersonalization -- network type 1 control key (NCK1).
  "nck2",     // Network type 2 depersonalization -- network type 2 control key (NCK2).
  "hnck",     // HRPD network depersonalization -- HRPD network control key (HNCK).
  "cck",      // Corporate depersonalization -- corporate control key (CCK).
  "spck",     // Service provider depersonalization -- service provider control key (SPCK).
  "rcck",     // RUIM corporate depersonalization -- RUIM corporate control key (RCCK).
  "rspck",    // RUIM service provider depersonalization -- RUIM service provider control key (RSPCK).
  "nckPuk",   // Network PUK depersonalization -- network control key (NCK).
  "nck1Puk",  // Network type 1 PUK depersonalization -- network type 1 control key (NCK1).
  "nck2Puk",  // Network type 2 PUK depersonalization -- Network type 2 control key (NCK2).
  "hnckPuk",  // HRPD network PUK depersonalization -- HRPD network control key (HNCK).
  "cckPuk",   // Corporate PUK depersonalization -- corporate control key (CCK).
  "spckPuk",  // Service provider PUK depersonalization -- service provider control key (SPCK).
  "rcckPuk",  // RUIM corporate PUK depersonalization -- RUIM corporate control key (RCCK).
  "rspckPuk", // RUIM service provider PUK depersonalization -- service provider control key (SPCK).
  "fdn"
};

dictionary IccUnlockCardLockOptions
{
  IccCardLockType lockType;

  DOMString? pin = null; // Necessary for lock types: "pin", "pin2", "nck",
                         // "nck1", "nck2", "hnck", "cck", "spck", "rcck",
                         // "rspck".

  DOMString? puk = null; // Necessary for lock types: "puk", "puk2", "nckPuk",
                         // "nck1Puk", "nck2Puk", "hnckPuk", "cckPuk",
                         // "spckPuk", "rcckPuk", "rspckPuk".

  DOMString? newPin = null; // Necessary for lock types: "puk", "puk2".

  DOMString? aid = null; // Optional. Only referenced by lock types: "pin",
                         // "pin2", "puk", "puk2".
};

dictionary IccSetCardLockOptions
{
  IccCardLockType lockType;
  DOMString? pin = null;
  DOMString? pin2 = null;
  DOMString? newPin = null;
  boolean enabled = false;
  DOMString? aid = null;
};

dictionary IccSendStkTimerExpirationOptions
{
  /**
   * Identifier of the timer that has expired.
   */
  [EnforceRange] octet timerId = 0;

  /**
   * Difference between the time when this command is issued and when the timer
   * was initially started.
   */
  [EnforceRange] unsigned long timerValue = 0;
};

dictionary IccUpdateContactContactOptions
{
  DOMString? id = null;
  sequence<DOMString>? name = null;
  sequence<ContactTelField>? tel = null;
  sequence<ContactField>? email = null;
};

dictionary IccExchangeAPDUOptions
{
  [EnforceRange] long cla = 0;
  [EnforceRange] long command = 0;
  DOMString? path = null;
  [EnforceRange] long p1 = 0;
  [EnforceRange] long p2 = 0;
  [EnforceRange] long p3 = 0;
  DOMString data;
  DOMString? data2 = null;
};

[Pref="dom.icc.enabled"]
interface MozIcc : EventTarget
{
  // Integrated Circuit Card Information.

  /**
   * Information stored in the device's ICC.
   *
   * Once the ICC becomes undetectable, iccinfochange event will be notified.
   * Also, the attribute is set to null and this MozIcc object becomes invalid.
   * Calling asynchronous functions raises exception then.
   */
  readonly attribute MozIccInfo? iccInfo;

  /**
   * The 'iccinfochange' event is notified whenever the icc info object
   * changes.
   */
  attribute EventHandler oniccinfochange;

  // Integrated Circuit Card State.

  /**
   * Indicates the state of the device's ICC.
   *
   * Once the ICC becomes undetectable, cardstatechange event will be notified.
   * Also, the attribute is set to null and this MozIcc object becomes invalid.
   * Calling asynchronous functions raises exception then.
   */
  readonly attribute IccCardState? cardState;

  /**
   * The 'cardstatechange' event is notified when the 'cardState' attribute
   * changes value.
   */
  attribute EventHandler oncardstatechange;

  // Integrated Circuit Card STK.

  /**
   * Send the response back to ICC after an attempt to execute STK proactive
   * Command.
   *
   * @param command
   *        Command received from ICC. See MozStkCommand.
   * @param response
   *        The response that will be sent to ICC.
   *        @see MozStkResponse for the detail of response.
   */
  [Throws]
  void sendStkResponse(any command, any response);

  /**
   * Send the "Menu Selection" envelope command to ICC for menu selection.
   *
   * @param itemIdentifier
   *        The identifier of the item selected by user.
   * @param helpRequested
   *        true if user requests to provide help information, false otherwise.
   */
  [Throws]
  void sendStkMenuSelection(unsigned short itemIdentifier,
                            boolean helpRequested);

  /**
   * Send the "Timer Expiration" envelope command to ICC for TIMER MANAGEMENT.
   *
   * @param timer
   *        The identifier and value for a timer.
   */
  [Throws]
  void sendStkTimerExpiration(optional IccSendStkTimerExpirationOptions timer);

  /**
   * Send "Event Download" envelope command to ICC.
   * ICC will not respond with any data for this command.
   *
   * @param event
   *        one of events below:
   *        - MozStkLocationEvent
   *        - MozStkCallEvent
   *        - MozStkLanguageSelectionEvent
   *        - MozStkGeneralEvent
   *        - MozStkBrowserTerminationEvent
   */
  [Throws]
  void sendStkEventDownload(any event);

  /**
   * The 'stkcommand' event is notified whenever STK proactive command is
   * issued from ICC.
   */
  attribute EventHandler onstkcommand;

  /**
   * 'stksessionend' event is notified whenever STK session is terminated by
   * ICC.
   */
  attribute EventHandler onstksessionend;

  // Integrated Circuit Card Lock interfaces.

  /**
   * Find out about the status of an ICC lock (e.g. the PIN lock).
   *
   * @param lockType
   *        Identifies the lock type, e.g. "pin" for the PIN lock, "fdn" for
   *        the FDN lock.
   *
   * @return a DOMRequest.
   *         The request's result will be an object containing
   *         information about the specified lock's status,
   *         e.g. {lockType: "pin", enabled: true}.
   */
  [Throws]
  DOMRequest getCardLock(IccCardLockType lockType);

  /**
   * Unlock a card lock.
   *
   * @param info
   *        An object containing the information necessary to unlock
   *        the given lock. At a minimum, this object must have a
   *        "lockType" attribute which specifies the type of lock, e.g.
   *        "pin" for the PIN lock. Other attributes are dependent on
   *        the lock type. See IccUnlockCardLockOptions.
   *
   * @return a DOMRequest.
   *         The request's result will be an object containing
   *         information about the unlock operation.
   *
   * Examples:
   *
   * (1) Unlocking failed:
   *
   *     {
   *       lockType:   "pin",
   *       success:    false,
   *       retryCount: 2
   *     }
   *
   * (2) Unlocking succeeded:
   *
   *     {
   *       lockType:  "pin",
   *       success:   true
   *     }
   */
  [Throws]
  DOMRequest unlockCardLock(optional IccUnlockCardLockOptions info);

  /**
   * Modify the state of a card lock.
   *
   * @param info
   *        An object containing information about the lock and
   *        how to modify its state. At a minimum, this object
   *        must have a "lockType" attribute which specifies the
   *        type of lock, e.g. "pin" for the PIN lock. Other
   *        attributes are dependent on the lock type.
   *
   * Examples:
   *
   * (1a) Disabling the PIN lock:
   *
   *   setCardLock({lockType: "pin",
   *                pin: "...",
   *                enabled: false});
   *
   * (1b) Disabling the FDN lock:
   *
   *   setCardLock({lockType: "fdn",
   *                pin2: "...",
   *                enabled: false});
   *
   * (2) Changing the PIN:
   *
   *   setCardLock({lockType: "pin",
   *                pin: "...",
   *                newPin: "..."});
   *
   *   setCardLock({lockType: "pin2",
   *                pin: "...",
   *                newPin: "..."});
   *
   * @return a DOMRequest.
   *         The request's result will be an object containing
   *         information about the operation.
   *
   * Examples:
   *
   * (1) Enabling/Disabling card lock failed or change card lock failed.
   *
   *     {
   *       lockType: "pin",
   *       success: false,
   *       retryCount: 2
   *     }
   *
   * (2) Enabling/Disabling card lock succeed or change card lock succeed.
   *
   *     {
   *       lockType: "pin",
   *       success: true
   *     }
   */
  [Throws]
  DOMRequest setCardLock(optional IccSetCardLockOptions info);

  /**
   * Retrieve the number of remaining tries for unlocking the card.
   *
   * @param lockType
   *        Identifies the lock type, e.g. "pin" for the PIN lock, "puk" for
   *        the PUK lock.
   *
   * @return a DOMRequest.
   *         If the lock type is "pin", or "puk", the request's result will be
   *         an object containing the number of retries for the specified
   *         lock. For any other lock type, the result is undefined.
   */
  [Throws]
  DOMRequest getCardLockRetryCount(IccCardLockType lockType);

  // Integrated Circuit Card Phonebook Interfaces.

  /**
   * Read ICC contacts.
   *
   * @return a DOMRequest.
   */
  [Throws]
  DOMRequest readContacts(IccContactType contactType);

  /**
   * Update ICC Phonebook contact.
   *
   * @param contactType
   * @param contact
   *        The contact will be updated in ICC.
   * @param [optional] pin2
   *        PIN2 is only required for 'fdn'.
   *
   * @return a DOMRequest.
   */
  [Throws]
  DOMRequest updateContact(IccContactType contactType,
                           optional IccUpdateContactContactOptions contact,
                           optional DOMString? pin2 = null);

  // Integrated Circuit Card Secure Element Interfaces.

  /**
   * A secure element is a smart card chip that can hold
   * several different applications with the necessary security.
   * The most known secure element is the Universal Integrated Circuit Card
   * (UICC).
   */

  /**
   * Send request to open a logical channel defined by its
   * application identifier (AID).
   *
   * @param aid
   *        The application identifier of the applet to be selected on this
   *        channel.
   *
   * @return a DOMRequest.
   *         The request's result will be an instance of channel (channelID)
   *         if available or null.
   */
  [Throws]
  DOMRequest iccOpenChannel(DOMString aid);

  /**
   * Interface, used to communicate with an applet through the
   * application data protocol units (APDUs) and is
   * used for all data that is exchanged between the UICC and the terminal (ME).
   *
   * @param channel
   *        The application identifier of the applet to which APDU is directed.
   * @param apdu
   *        Application protocol data unit.
   *
   * @return a DOMRequest.
   *         The request's result will be response APDU.
   */
  [Throws]
  DOMRequest iccExchangeAPDU(long channel,
                             optional IccExchangeAPDUOptions apdu);

  /**
   * Send request to close the selected logical channel identified by its
   * application identifier (AID).
   *
   * @param aid
   *        The application identifier of the applet, to be closed.
   *
   * @return a DOMRequest.
   */
  [Throws]
  DOMRequest iccCloseChannel(long channel);

  // Integrated Circuit Card Helpers.

  /**
   * Verify whether the passed data (matchData) matches with some ICC's field
   * according to the mvno type (mvnoType).
   *
   * @param mvnoType
   *        Mvno type to use to compare the match data.
   * @param matchData
   *        Data to be compared with ICC's field.
   *
   * @return a DOMRequest.
   *         The request's result will be a boolean indicating the matching
   *         result.
   */
  [Throws]
  DOMRequest matchMvno(IccMvnoType mvnoType,
                       DOMString matchData);
};
