// The spot ticker, rendered.
//
// SECOND FEATURE TO GET RENDER COVERAGE, same rules as media: jsdom, the real
// component tree, the real react-query hook, with only the network boundary
// replaced. Amount is shimmed to a plain span because NumberFlow is
// an animated custom element that renders nothing synchronously in jsdom -
// that is a presentation shim like next/image in the media tests, not a
// mock of anything this file is trying to prove.
//
// What is pinned: the ticker renders one entry per metal the wire returns,
// the Ask/Bid toggle actually changes which side of the market is shown, and
// the direction of dollar_change decides the trend colour. These survive the
// wire rename - the fixture is the only thing that speaks field names.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

// The wire's shape, one place. Distinct prices per metal and per side of the
// market, so an assertion on a number can only match the field it means.
// `direction` is the SERVER'S answer now - Silver and Palladium are down days
// and the other two are up, which is what the trend-colour test reads.
const wireSpots = () => [
  { id: "m-au", name: "Gold", ask: 3400.1, bid: 3390.5, dollar_change: 12.34, percent_change: 0.36, direction: "up" },
  { id: "m-ag", name: "Silver", ask: 41.2, bid: 40.9, dollar_change: -0.56, percent_change: -1.34, direction: "down" },
  { id: "m-pt", name: "Platinum", ask: 1310.7, bid: 1298.2, dollar_change: 4.05, percent_change: 0.31, direction: "up" },
  { id: "m-pd", name: "Palladium", ask: 955.3, bid: 941.8, dollar_change: -8.6, percent_change: -0.9, direction: "down" },
];

// THE NETWORK BOUNDARY, and nothing else. The spot hook lives in
// @dorado/client now, which talks to the platform's `fetch` rather than the
// axios wrapper this file used to stub - so the boundary is the hook, given
// the same rows the stub answered with.
vi.mock("@dorado/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSpotPrices: () => ({ data: wireSpots(), isSuccess: true }),
}));
// The spot feed is public - the session hook returns no user at all, which
// doubles as proof the components never need one.
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: null }),
}));
// NumberFlow animates digits through a custom element with no synchronous
// text content under jsdom. The shim renders the raw value and keeps the
// className, which is where the trend colour lands.
vi.mock("@dorado/components", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Amount: ({ value, className }: { value: number; className?: string }) =>
    React.createElement("span", { className }, String(value)),
}));

import { useSpotTypeStore } from "@/shared/store/spotStore";
import Spots from "@/features/spots/ui/Spots";
import MobileSpotTicker from "@/features/spots/ui/MobileSpots";

beforeEach(() => {
  // The type toggle persists via zustand; tests must not inherit each other's
  // choice of market side.
  useSpotTypeStore.setState({ type: "Ask" });
});

describe("the spot ticker", () => {
  test("renders every metal the wire returns", async () => {
    renderWithClient(<Spots />);
    // Desktop renders each metal once; the mobile marquee renders the list
    // three times over for the wrap - four occurrences is BOTH surfaces live.
    await waitFor(() => expect(screen.getAllByText("Gold:")).toHaveLength(4));
    for (const metal of ["Silver:", "Platinum:", "Palladium:"]) {
      expect(screen.getAllByText(metal)).toHaveLength(4);
    }
  });

  test("shows the ask by default and the bid after the toggle", async () => {
    renderWithClient(<Spots />);
    await waitFor(() => expect(screen.getAllByText("3400.1").length).toBeGreaterThan(0));
    expect(screen.queryByText("3390.5")).toBeNull();

    // The button names the side it would SWITCH TO, not the one showing.
    await userEvent.click(screen.getByRole("button", { name: /show bid/i }));

    await waitFor(() => expect(screen.getAllByText("3390.5").length).toBeGreaterThan(0));
    expect(screen.queryByText("3400.1")).toBeNull();
    expect(screen.getByRole("button", { name: /show ask/i })).toBeDefined();
  });

  test("a falling price is destructive and a rising one is success", async () => {
    renderWithClient(<Spots />);
    await waitFor(() => expect(screen.getAllByText("12.34").length).toBeGreaterThan(0));
    // The change amount carries the trend colour on its own className.
    for (const el of screen.getAllByText("12.34")) {
      expect(el.className).toContain("text-success");
    }
    for (const el of screen.getAllByText("-0.56")) {
      expect(el.className).toContain("text-destructive");
    }
  });

  test("the mobile marquee shows the side it is told to", async () => {
    renderWithClient(<MobileSpotTicker type="Bid" />);
    await waitFor(() => expect(screen.getAllByText("Gold:")).toHaveLength(3));
    // Bid values, tripled for the wrap; no ask value anywhere.
    expect(screen.getAllByText("3390.5")).toHaveLength(3);
    expect(screen.queryByText("3400.1")).toBeNull();
  });
});
