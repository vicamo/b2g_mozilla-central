/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ObservableObject = require("devtools/shared/observable-object");
const promise = require("devtools/toolkit/deprecated-sync-thenables");
const {getVoicecallsFront} = require("devtools/server/actors/ril");
const {Connection} = require("devtools/client/connection-manager");

const {Cu} = require("chrome");
const dbgClient = Cu.import("resource://gre/modules/devtools/dbg-client.jsm");
const _knownVoicecallsStores = new WeakMap();

let VoicecallsStore;

module.exports = VoicecallsStore = function(connection) {
  // If we already know about this connection,
  // let's re-use the existing store.
  if (_knownVoicecallsStores.has(connection)) {
    return _knownVoicecallsStores.get(connection);
  }

  _knownVoicecallsStores.set(connection, this);

  ObservableObject.call(this, {});

  this._resetStore();

  this.destroy = this.destroy.bind(this);
  this._onStatusChanged = this._onStatusChanged.bind(this);
  this._onVoicecallStateChanged = this._onVoicecallStateChanged.bind(this);
  this._onVoicecallError = this._onVoicecallError.bind(this);

  this._connection = connection;
  this._connection.once(Connection.Events.DESTROYED, this.destroy);
  this._connection.on(Connection.Events.STATUS_CHANGED, this._onStatusChanged);
  this._onStatusChanged();
  return this;
}

VoicecallsStore.prototype = {
  destroy: function() {
    if (this._connection) {
      // While this.destroy is bound using .once() above, that event may not
      // have occurred when the VoicecallsStore client calls destroy, so we
      // manually remove it here.
      this._connection.off(Connection.Events.DESTROYED, this.destroy);
      this._connection.off(Connection.Events.STATUS_CHANGED, this._onStatusChanged);
      _knownVoicecallsStores.delete(this._connection);
      this._connection = null;
    }
  },

  _resetStore: function() {
    this.object.all = []; // list of voicecall objects
  },

  _onStatusChanged: function() {
    if (this._connection.status === Connection.Status.CONNECTED) {
      this._listTabs();
    } else {
      this._resetStore();

      if (this._voicecallsFront) {
        this._voicecallsFront.off("voicecall-state-changed",
                                 this._onVoicecallStateChanged);
        this._voicecallsFront.off("voicecall-error", this._onVoicecallError);

	this._voicecallsFront = null;
      }
    }
  },

  _listTabs: function() {
    this._connection.client.listTabs((resp) => {
      this._voicecallsFront = getVoicecallsFront(this._connection.client, resp);
      this._feedStore();
    });
  },

  _feedStore: function() {
    return this._voicecallsFront.getAll()
    .then(calls => {
      this.object.all = calls.map(this._mapVoicecall);

      this._voicecallsFront.on("voicecall-state-changed",
                               this._onVoicecallStateChanged);
      this._voicecallsFront.on("voicecall-error", this._onVoicecallError);
    });
  },

  _mapVoicecall: function(aCall) {
    aCall['ui-id'] = aCall.clientId + '-' + aCall.callIndex;
    return aCall;
  },

  _onVoicecallStateChanged: function(aCall) {
    if (aCall.state === "disconnected") {
      this._onVoicecallError(aCall.clientId, aCall.callIndex, null);
      return;
    }

    let mappedCall = this._mapVoicecall(aCall);

    let found = false;
    this.object.all.forEach(function(aCall, aIndex) {
      if (aCall.clientId === mappedCall.clientId &&
          aCall.callIndex === mappedCall.callIndex) {
       found = true;
       this.object.all[aIndex] = mappedCall;
      }
    }, this);

    if (!found) {
      this.object.all.push(mappedCall);
    }
  },

  _onVoicecallError: function(aClientId, aCallIndex, aFailCause) {
    let all = this.object.all;
    this.object.all = all.filter((aCall) => {
      return aCall.clientId !== aClientId || aCall.callIndex !== aCallIndex;
    });
  },
};
