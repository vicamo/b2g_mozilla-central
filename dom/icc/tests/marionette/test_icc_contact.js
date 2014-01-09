/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = "icc_header.js";

const EMULATOR_ICCID = "89014103211118510720";

let contactCounts = {};

function testReadContacts(type) {
  let request = icc.readContacts(type);
  request.onsuccess = function onsuccess() {
    let contacts = request.result;

    is(Array.isArray(contacts), true);
    contactCounts[type] = contacts.length;

    is(contacts[0].name[0], "Mozilla");
    is(contacts[0].tel[0].value, "15555218201");
    is(contacts[0].id, EMULATOR_ICCID + "1");

    is(contacts[1].name[0], "\u0053\u0061\u00df\u00ea\u9ec3");
    is(contacts[1].tel[0].value, "15555218202");
    is(contacts[1].id, EMULATOR_ICCID + "2");

    is(contacts[2].name[0], "Fire \u706b");
    is(contacts[2].tel[0].value, "15555218203");
    is(contacts[2].id, EMULATOR_ICCID + "3");

    is(contacts[3].name[0], "Huang \u9ec3");
    is(contacts[3].tel[0].value, "15555218204");
    is(contacts[3].id, EMULATOR_ICCID + "4");

    taskHelper.runNext();
  };

  request.onerror = function onerror() {
    ok(false, "Cannot get " + type + " contacts");
    taskHelper.runNext();
  };
}

function testAddContact(type, pin2) {
  let n = contactCounts[type] + 1;
  let name = "name-" + n;
  let tel = "1555521820" + n;
  let contact = new mozContact({
    name: [name],
    tel: [{value: tel}],
    email:[]
  });

  let updateRequest = icc.updateContact(type, contact, pin2);

  updateRequest.onsuccess = function onsuccess() {
    let updatedContact = updateRequest.result;
    ok(updatedContact, "updateContact should have returned a mozContact.");
    ok(updatedContact.id.startsWith(EMULATOR_ICCID),
       "The returned mozContact has wrong id.");

    // Get ICC contact for checking new contact

    let getRequest = icc.readContacts(type);

    getRequest.onsuccess = function onsuccess() {
      let contacts = getRequest.result;
      let found = 0;
      for (let contact of contacts) {
        if (contact.name[0] == name && contact.tel[0].value == tel) {
          ++found;
        }
      }
      is(found, 1, "Number of found updated contacts");

      taskHelper.runNext();
    };

    getRequest.onerror = function onerror() {
      ok(false, "Cannot get " + type + " contacts: " + getRequest.error.name);
      taskHelper.runNext();
    };
  };

  updateRequest.onerror = function onerror() {
    if (type === "fdn" && pin2 === undefined) {
      ok(updateRequest.error.name === "SimPin2",
         "expected error when pin2 is not provided");
    } else {
      ok(false, "Cannot add " + type + " contact: " + updateRequest.error.name);
    }
    taskHelper.runNext();
  };
}

/* Test read adn contacts */
taskHelper.push(function testReadAdnContacts() {
  testReadContacts("adn");
});

/* Test add adn contacts */
taskHelper.push(function testAddAdnContact() {
  testAddContact("adn");
});

/* Test read fdn contacts */
taskHelper.push(function testReadAdnContacts() {
  testReadContacts("fdn");
});

/* Test add fdn contacts */
taskHelper.push(function testReadAdnContacts() {
  testAddContact("fdn", "0000");
});

/* Test add fdn contacts without passing pin2 */
taskHelper.push(function testReadAdnContacts() {
  testAddContact("fdn");
});

// Start test
taskHelper.runNext();
