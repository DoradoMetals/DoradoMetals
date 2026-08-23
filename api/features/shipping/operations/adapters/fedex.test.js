// The FedEx input builders.
//
// These are the last thing that runs before a real request reaches FedEx, and
// nothing was checking them. Everything they get wrong turns into a label, a
// booking or a cancellation that FedEx accepts and interprets differently from
// what the caller meant - and the pickup path has now produced four bugs, three
// of which threw and one of which did not.
//
// Pure functions and no network. What is asserted is the mapping: what the
// handler is given, and what the provider receives.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import * as fedex from "#features/shipping/operations/adapters/fedex.js";

// The shape formatAddressForFedEx produces, so a pre-formatted address can be
// told apart from one still needing conversion.
const formatted = { streetLines: ["1255 Stanhope Ct."], city: "Southlake", stateOrProvinceCode: "TX" };

describe("cancelPickupInput", () => {
  // The regression. operationsService.cancelPickup maps the pickup row onto the
  // provider's names before calling the handler, and this builder read the
  // database's - so FedEx was asked to cancel a pickup without being told which
  // one, and without a date.
  test("reads the names its caller actually sends", () => {
    const fromService = {
      confirmationCode: "APK1234567",
      pickupDate: "2026-08-22",
      location: "FRONT",
    };
    assert.deepEqual(fedex.cancelPickupInput(fromService), {
      confirmationCode: "APK1234567",
      pickupDate: "2026-08-22",
      location: "FRONT",
    });
  });

  // The database's names still work, because a pickup row could reasonably be
  // handed straight in and cancelLabelInput sets that precedent.
  test("also reads the names a pickup row carries", () => {
    const fromRow = {
      confirmation_number: "APK7654321",
      pickup_requested_at: "2026-08-22T10:30:00Z",
      location: "REAR",
    };
    assert.deepEqual(fedex.cancelPickupInput(fromRow), {
      confirmationCode: "APK7654321",
      pickupDate: "2026-08-22T10:30:00Z",
      location: "REAR",
    });
  });

  // What the bug looked like: everything undefined except location, which
  // happens to be spelled the same on both sides. A cancellation that names no
  // pickup is the kind of request that fails quietly at the far end.
  test("does not silently drop the confirmation code", () => {
    const built = fedex.cancelPickupInput({ confirmationCode: "APK1", pickupDate: "2026-08-22" });
    assert.notEqual(built.confirmationCode, undefined, "the pickup being cancelled was not identified");
    assert.notEqual(built.pickupDate, undefined);
  });
});

describe("cancelLabelInput", () => {
  test("takes either spelling of the tracking number", () => {
    assert.equal(fedex.cancelLabelInput({ trackingNumber: "794" }).tracking_number, "794");
    assert.equal(fedex.cancelLabelInput({ tracking_number: "794" }).tracking_number, "794");
  });
});

describe("createPickupInput", () => {
  test("carries the contact through as a person and a phone", () => {
    const built = fedex.createPickupInput({
      pickupContact: { personName: "Jacob Johnson", phoneNumber: "8175551234" },
      pickupAddress: formatted,
      pickupDate: "2026-08-22",
      pickupTime: "10:30:00",
      carrierCode: "FDXE",
      trackingNumber: "794123456789",
    });
    assert.deepEqual(built.pickupContact, { personName: "Jacob Johnson", phoneNumber: "8175551234" });
    assert.equal(built.pickupDate, "2026-08-22");
    assert.equal(built.pickupTime, "10:30:00");
    assert.equal(built.carrierCode, "FDXE");
  });

  // The address shape the checkout flow holds uses name/phone, not
  // personName/phoneNumber. Both are accepted, and the alternative is a pickup
  // booked against an empty contact.
  test("accepts name and phone as well as personName and phoneNumber", () => {
    const built = fedex.createPickupInput({
      pickupContact: { name: "Jacob Johnson", phone: "8175551234" },
    });
    assert.equal(built.pickupContact.personName, "Jacob Johnson");
    assert.equal(built.pickupContact.phoneNumber, "8175551234");
  });

  // FedEx will take an empty contact and book the pickup anyway, so an absent
  // one has to be visible here rather than at the depot.
  test("produces empty strings, never the string 'undefined'", () => {
    const built = fedex.createPickupInput({ pickupContact: {} });
    assert.equal(built.pickupContact.personName, "");
    assert.equal(built.pickupContact.phoneNumber, "");
  });

  test("survives being called with nothing", () => {
    const built = fedex.createPickupInput();
    assert.deepEqual(built.pickupContact, { personName: "", phoneNumber: "" });
  });
});

describe("checkPickupInput", () => {
  test("passes a Date straight through", () => {
    const readyDate = new Date("2026-08-22T15:00:00Z");
    assert.equal(fedex.checkPickupInput({ readyDate }).readyDate, readyDate);
  });

  test("converts a string to a Date", () => {
    const built = fedex.checkPickupInput({ readyDate: "2026-08-22T15:00:00Z" });
    assert.ok(built.readyDate instanceof Date);
    assert.equal(built.readyDate.toISOString(), "2026-08-22T15:00:00.000Z");
  });

  // Pinning what currently happens rather than asserting it is right. A missing
  // readyDate becomes an Invalid Date, which serialises to null and is sent to
  // FedEx as a pickup with no ready time. Worth an explicit rejection at the
  // controller, which is a behaviour change rather than a test.
  test("a missing readyDate becomes an Invalid Date rather than being refused", () => {
    const built = fedex.checkPickupInput({});
    assert.ok(built.readyDate instanceof Date);
    assert.ok(Number.isNaN(built.readyDate.getTime()), "this test is pinning known-bad behaviour");
  });
});

describe("createLabelInput", () => {
  const input = {
    shipper: { contact: { name: "Dorado Metals", phone: "8175551234" }, address: formatted },
    recipient: { contact: { personName: "Jacob Johnson", phoneNumber: "8175559876" }, address: formatted },
    serviceType: "FEDEX_EXPRESS_SAVER",
    pickupType: "USE_SCHEDULED_PICKUP",
    pkg: { weight: { value: 5, units: "LB" }, dimensions: { length: 12, width: 10, height: 4 } },
    insurance: { declaredValue: { amount: 5000, currency: "USD" } },
  };

  test("puts the declared value in both places FedEx reads it", () => {
    const built = fedex.createLabelInput(input);
    assert.deepEqual(built.totalDeclaredValue, input.insurance.declaredValue);
    assert.deepEqual(built.packageDetails.declaredValue, input.insurance.declaredValue);
  });

  // An uninsured shipment must not declare a value of null - FedEx reads that
  // differently from the field being absent, and this is a real amount of money.
  test("omits the declared value entirely when there is no insurance", () => {
    const built = fedex.createLabelInput({ ...input, insurance: undefined });
    assert.equal(built.totalDeclaredValue, null);
    assert.equal("declaredValue" in JSON.parse(JSON.stringify(built.packageDetails)), false);
  });

  test("defaults the label to a 4x6 PNG", () => {
    assert.deepEqual(fedex.createLabelInput(input).label, { imageType: "PNG", labelStockType: "PAPER_4X6" });
  });

  test("keeps an explicit label format", () => {
    const label = { imageType: "PDF", labelStockType: "PAPER_LETTER" };
    assert.deepEqual(fedex.createLabelInput({ ...input, label }).label, label);
  });

  test("carries the weight and dimensions through untouched", () => {
    const built = fedex.createLabelInput(input);
    assert.deepEqual(built.packageDetails.weight, input.pkg.weight);
    assert.deepEqual(built.packageDetails.dimensions, input.pkg.dimensions);
  });
});

describe("getRatesInput", () => {
  test("defaults to FedEx Express when no carrier codes are given", () => {
    assert.deepEqual(fedex.getRatesInput({}).carrierCodes, ["FDXE"]);
  });

  test("keeps the carrier codes it is given", () => {
    assert.deepEqual(fedex.getRatesInput({ carrierCodes: ["FDXG"] }).carrierCodes, ["FDXG"]);
  });

  // Rates are quoted per package group. Sending a count other than "1" would
  // quote for a shipment we are not making.
  test("always quotes one package group", () => {
    assert.equal(fedex.getRatesInput({}).packageDetails.groupPackageCount, "1");
  });
});

describe("address handling", () => {
  // formatAddressForFedEx is not idempotent in any guaranteed way, so an
  // already-formatted address has to be recognised rather than reformatted.
  test("an already-formatted address is passed through unchanged", () => {
    assert.equal(fedex.getRatesInput({ shipperAddress: formatted }).shipperAddress, formatted);
  });

  test("a missing address stays missing rather than becoming an empty object", () => {
    assert.equal(fedex.getRatesInput({ shipperAddress: null }).shipperAddress, null);
    assert.equal(fedex.getRatesInput({}).shipperAddress, undefined);
  });
});

describe("getLocationsInput", () => {
  test("defaults the search radius and result count", () => {
    const built = fedex.getLocationsInput({ address: formatted });
    assert.equal(built.radiusMiles, 25);
    assert.equal(built.maxResults, 10);
  });

  test("keeps explicit values, including a zero radius", () => {
    assert.equal(fedex.getLocationsInput({ radiusMiles: 5, maxResults: 3 }).maxResults, 3);
    assert.equal(fedex.getLocationsInput({ radiusMiles: 5 }).radiusMiles, 5);
  });
});
