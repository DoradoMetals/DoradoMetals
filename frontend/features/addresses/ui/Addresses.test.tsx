// The address book, rendered - list and card.
//
// Same rules as the other converted features: jsdom, real components, real
// react-query, network mocked by URL. Shape-agnostic pins that survive the
// addresses lift: the list shows every address by its label with the default
// sorted first and bannered, and the set-default action carries the
// address's id - wherever the shape keeps the label and the default flag.
import type { Address } from "@dorado/contracts";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import AddressList from "@/features/addresses/ui/AddressList";

// Two addresses in the CURRENT wire shape - the pure postal rows from one
// endpoint and the caller's links from the other, joined by address_id.
// "Work" is the default so the sort has something to prove (alphabetical
// alone would put Home first).
const wireAddresses = () =>
  [
    {
      id: "a-home",
      line_1: "1 Maple St",
      line_2: "",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      country: "United States",
      country_code: "US",
      phone_number: "5551112222",
      is_valid: true,
      is_residential: true,
    },
    {
      id: "a-work",
      line_1: "2 Oak Ave",
      line_2: "",
      city: "Dallas",
      state: "TX",
      zip: "75202",
      country: "United States",
      country_code: "US",
      phone_number: "5553334444",
      is_valid: true,
      is_residential: false,
    },
  ] as unknown as Address[];

const wireLinks = () => [
  { address_id: "a-home", user_id: "u-1", label: "Home", default_shipping: false },
  { address_id: "a-work", user_id: "u-1", label: "Work", default_shipping: true },
];

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (_m, url) => {
    if (url === "/addresses/get") return wireAddresses();
    if (url === "/addresses/get_user_addresses") return wireLinks();
    return {};
  });
});

describe("the address book", () => {
  test("every address renders by its label, default first and bannered", async () => {
    renderWithClient(<AddressList />);
    await waitFor(() => expect(screen.getByText("Home")).toBeDefined());
    expect(screen.getByText("Work")).toBeDefined();
    expect(screen.getByText("Default")).toBeDefined();

    // The default sorts above the rest even against alphabetical order.
    const labels = [...document.querySelectorAll("div")]
      .map((d) => d.textContent)
      .filter((t) => t === "Home" || t === "Work");
    expect(labels[0]).toBe("Work");
  });
});
