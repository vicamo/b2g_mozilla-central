/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/ */

// Two tests involving Array.from and a Proxy.
var log = [];
function LoggingProxy(target) {
    var h = {
        defineProperty: function (t, id) {
            log.push("define " + id);
            return undefined;
        },
        has: function (t, id) {
            log.push("has " + id);
            return id in t;
        },
        get: function (t, id) {
            log.push("get " + id);
            return t[id];
        },
        set: function (t, id, v) {
            log.push("set " + id);
            t[id] = v;
        }
    };
    return new Proxy(target || [], h);
}

// When the new object created by Array.from is a Proxy,
// Array.from calls handler.defineProperty to create new elements
// but handler.set to set the length.
LoggingProxy.from = Array.from;
LoggingProxy.from([3, 4, 5]);
assertDeepEq(log, ["define 0", "define 1", "define 2", "set length"]);

// When the argument passed to Array.from is a Proxy, Array.from
// calls handler.get on it.
log = [];
assertDeepEq(Array.from(new LoggingProxy([3, 4, 5])), [3, 4, 5]);
assertDeepEq(log, ["get @@iterator", "get @@iterator",
                   "get length", "get 0", "get length", "get 1", "get length", "get 2",
                   "get length"]);

if (typeof reportCompare === 'function')
    reportCompare(0, 0);
