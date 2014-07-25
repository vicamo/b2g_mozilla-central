/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const DEBUG = false;
function debug(s) { dump("-*- NetworkStatsService: " + s + "\n"); }

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/NetworkStatsService.jsm");

const NETWORKSTATSSERVICE_CONTRACTID = "@mozilla.org/netstatsservice;1";
const NETWORKSTATSSERVICE_CID = Components.ID("18725604-e9ac-488a-8aa0-2471e7f6c0a4");

function NetworkStatsServiceProxy() {
  if (DEBUG) {
    debug("started");
  }
}

NetworkStatsServiceProxy.prototype = {
  /*
   * Function called in the protocol layer (HTTP, FTP, WebSocket ...etc)
   * to pass the per-app stats to NetworkStatsService.
   */
  saveAppStats: function saveAppStats(aAppId, aNetwork, aTimeStamp,
                                      aRxBytes, aTxBytes, aIsAccumulative,
                                      aCallback) {
    if (!aNetwork) {
      if (DEBUG) {
        debug("|aNetwork| is not specified. Failed to save stats. Returning.");
      }
      return;
    }

    if (DEBUG) {
      debug("saveAppStats: " + aAppId + " " + aNetwork.type + " " + aTimeStamp +
            " " + aRxBytes + " " + aTxBytes + " " + aIsAccumulative);
    }

    if (aCallback) {
      aCallback = aCallback.notify;
    }

    NetworkStatsService.saveStats(aAppId, "", aNetwork, aTimeStamp,
                                  aRxBytes, aTxBytes, aIsAccumulative,
                                  aCallback);
  },

  classID : NETWORKSTATSSERVICE_CID,
  QueryInterface : XPCOMUtils.generateQI([Ci.nsINetworkStatsService]),
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([NetworkStatsServiceProxy]);
