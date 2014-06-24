/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

// Copied from dom/system/gonk/ril_consts.js.
const PDU_MAX_USER_DATA_7BIT = 160;

function addTest(text, segments, charsPerSegment, charsAvailableInLastSegment) {
  log("Testing '" + text + "' ...");

  let domRequest = manager.getSegmentInfoForText(text);
  return wrapDomRequestAsPromise(domRequest)
    .then(function(e) {
      let result = e.target.result;
      if (!result) {
        ok(false, "getSegmentInfoForText() result is not valid.");
        return;
      }

      is(result.segments, segments, "info.segments");
      is(result.charsPerSegment, charsPerSegment, "info.charsPerSegment");
      is(result.charsAvailableInLastSegment, charsAvailableInLastSegment,
         "info.charsAvailableInLastSegment");
    });
}

function addTestThrows(text) {
  log("Testing '" + text + "' ...");

  let deferred = Promise.defer();
  window.setTimeout(function() {
    try {
      let domRequest = manager.getSegmentInfoForText(text);
      deferred.reject();
    } catch (e) {
      deferred.resolve();
    }
  }, 0);
  return deferred.promise;
}

startTestBase(function testCaseMain() {
  return ensureMobileMessage()
    .then(() => addTestThrows(null))

    // Testing "undefined".
    .then(() => addTest(undefined, 1, PDU_MAX_USER_DATA_7BIT,
                        PDU_MAX_USER_DATA_7BIT - "undefined".length))

    // Testing numeric values.
    .then(() => addTest(0, 1, PDU_MAX_USER_DATA_7BIT,
                        PDU_MAX_USER_DATA_7BIT - "0".length))
    .then(() => addTest(1.0, 1, PDU_MAX_USER_DATA_7BIT,
                        PDU_MAX_USER_DATA_7BIT - "1".length))

    // Testing empty object.  The empty object extends to "[object Object]"
    // and both '[' and ']' are in default single shift table, so each of them
    // takes two septets.
    .then(() => addTest({}, 1, PDU_MAX_USER_DATA_7BIT,
                        PDU_MAX_USER_DATA_7BIT - (("" + {}).length + 2)))

    // Testing Date object.
    .then(function() {
      let date = new Date();
      return addTest(date, 1, PDU_MAX_USER_DATA_7BIT,
                     PDU_MAX_USER_DATA_7BIT - ("" + date).length);
    })

    .then(() => addTest("", 1, PDU_MAX_USER_DATA_7BIT,
                        PDU_MAX_USER_DATA_7BIT - "".length));
});
