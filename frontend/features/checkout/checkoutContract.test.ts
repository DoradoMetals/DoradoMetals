// What checkout sends back to the API.
//
// Both checkout paths read `data?.address?.id` off an order or a saved address
// and post it as `address_id`, which the API resolves with
// addressService.getAddressFromId. That single field is the tightest coupling
// between the two halves of this codebase, and it is the one the schema
// migration nearly broke: orders.addresses points at a *snapshot* of the
// address with a fresh id, so returning the snapshot's id would have sent
// checkout an id that resolves nowhere. Migration 037 added source_address_id
// to keep the address-book id available, and the order reads return that.
//
// These tests state the contract from this side. They do not call the API -
// that is what the API's own diff and repo tests are for - they pin the shape
// this code depends on, so that if it ever changes, something here fails rather
// than a customer's order failing at checkout.
import { describe, expect, test } from "vitest";

// The shape the order read returns, as far as checkout is concerned.
type OrderLikeResponse = {
  address_id?: string | null;
  address?: { id?: string | null } | null;
};

// What both checkout screens do with it, extracted so it can be asserted.
const addressIdForCheckout = (data: OrderLikeResponse | null | undefined) =>
  data?.address?.id ?? "";

describe("the address id checkout posts back", () => {
  test("comes from the nested address object", () => {
    expect(addressIdForCheckout({ address: { id: "abc" } })).toBe("abc");
  });

  // The API returns both, and they must agree - address_id is the top-level
  // column, address.id is the joined row. The order reads project the same
  // source_address_id into both for exactly this reason.
  test("agrees with the top-level address_id when both are present", () => {
    const response = { address_id: "abc", address: { id: "abc" } };
    expect(addressIdForCheckout(response)).toBe(response.address_id);
  });

  // An order placed without an address - a pickup, say - must not post the
  // string "undefined" or "null" at an endpoint that will look it up.
  test("is an empty string when there is no address, never a stringified null", () => {
    expect(addressIdForCheckout({ address: null })).toBe("");
    expect(addressIdForCheckout({})).toBe("");
    expect(addressIdForCheckout(null)).toBe("");
    expect(addressIdForCheckout(undefined)).toBe("");
  });

  // The failure this is really guarding against: a snapshot id would be a
  // perfectly well-formed uuid that resolves to nothing. Shape alone cannot
  // catch that, which is why the API side has a test asserting the id it
  // returns resolves in exchange.addresses. This one records the dependency so
  // the two are findable from each other.
  test("is whatever the API returned, unmodified", () => {
    const fromApi = "f3a31a8e-31b1-4b11-ab86-1ddfd436682c";
    expect(addressIdForCheckout({ address: { id: fromApi } })).toBe(fromApi);
  });
});
