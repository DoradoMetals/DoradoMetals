// Formatting helpers: order numbers, phone numbers, email validation.
//
// None of these decides money, but two of them decide what gets stored or sent
// back, and one pair disagrees with itself - see the last block.
import { describe, expect, test } from "vitest";
import {
  useFormatPurchaseOrderNumber,
  useFormatSalesOrderNumber,
} from "@/features/orders/utils/formatOrderNumbers";
import formatPhoneNumber, { normalizePhone } from "@/shared/utils/formatPhoneNumber";
import { isValidEmail } from "@/shared/utils/isValid";

describe("order numbers", () => {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber();
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber();

  test("pads to six digits behind a kind prefix", () => {
    expect(formatPurchaseOrderNumber(239)).toBe("PO - 000239");
    expect(formatSalesOrderNumber(1)).toBe("SO - 000001");
  });

  // The two kinds share a number sequence in exchange but not in the new
  // schema, where (direction, number) is unique - so the prefix is what tells
  // an order 239 apart from the other order 239.
  test("the prefix is what distinguishes the two kinds", () => {
    expect(formatPurchaseOrderNumber(239)).not.toBe(formatSalesOrderNumber(239));
  });

  test("a number past six digits is not truncated", () => {
    expect(formatPurchaseOrderNumber(1234567)).toBe("PO - 1234567");
  });

  // Zero is falsy, so it renders as an em dash rather than PO - 000000. No
  // order is numbered zero, so this is right by accident rather than design.
  test("nothing renders as an em dash", () => {
    expect(formatPurchaseOrderNumber(null)).toBe("—");
    expect(formatPurchaseOrderNumber(undefined)).toBe("—");
    expect(formatPurchaseOrderNumber(0)).toBe("—");
  });
});

describe("phone numbers", () => {
  test("formats ten digits as a US number", () => {
    expect(formatPhoneNumber("8172034786")).toBe("(817) 203-4786");
  });

  test("formats progressively as digits are typed", () => {
    expect(formatPhoneNumber("817")).toBe("(817");
    expect(formatPhoneNumber("817203")).toBe("(817) 203");
    expect(formatPhoneNumber("8172034786")).toBe("(817) 203-4786");
  });

  test("ignores punctuation already present", () => {
    expect(formatPhoneNumber("(817) 203-4786")).toBe("(817) 203-4786");
    expect(formatPhoneNumber("817.203.4786")).toBe("(817) 203-4786");
  });

  test("normalizes to ten bare digits for storage", () => {
    expect(normalizePhone("(817) 203-4786")).toBe("8172034786");
    expect(normalizePhone("+1 817 203 4786")).toBe("8172034786");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });

  // The disagreement. normalizePhone strips a leading 1 only when there are
  // eleven digits - a country code. formatPhoneNumber strips it whenever the
  // string starts with 1, however long it is, so ten digits beginning with 1
  // lose their first digit and render as nine.
  //
  // No real US number hits this: NANP area codes cannot begin with 0 or 1. It
  // is pinned because the two functions are used on the same values and only
  // one of them is right about the rule.
  test("the two disagree on a leading 1 that is not a country code", () => {
    expect(normalizePhone("1234567890")).toBe("1234567890");
    expect(formatPhoneNumber("1234567890")).toBe("(234) 567-890");
  });

  test("both handle a real number with a country code the same way", () => {
    expect(normalizePhone("18172034786")).toBe("8172034786");
    expect(formatPhoneNumber("18172034786")).toBe("(817) 203-4786");
  });
});

describe("email validation", () => {
  test("accepts ordinary addresses", () => {
    expect(isValidEmail("exchange@doradometals.com")).toBe(true);
    expect(isValidEmail("a.b+tag@sub.example.co.uk")).toBe(true);
  });

  test("rejects the shapes that are obviously not addresses", () => {
    for (const bad of ["", "nope", "no@domain", "@example.com", "a b@example.com"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });

  // Deliberately permissive: it checks a shape, not deliverability, and an
  // address that passes here can still bounce.
  test("accepts anything shaped like an address, valid or not", () => {
    expect(isValidEmail("definitely-not-real@example.invalid")).toBe(true);
  });
});
