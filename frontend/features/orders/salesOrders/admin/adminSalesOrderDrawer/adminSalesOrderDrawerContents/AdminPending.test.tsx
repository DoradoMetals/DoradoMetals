// The admin "pending payment" step, rendered.
//
// This is the screen where an admin watches a customer's money arrive and can
// cancel the intent if it never does. Same rules as the other converted
// features - jsdom, real component tree, network mocked by URL. Shape-agnostic
// like the carriers tests: what is pinned is that the payment's status and
// instrument render, that a dollar amount lands on screen wherever the unit
// math ends, and that the cancel carries the provider's intent reference -
// wherever the wire shape puts each of them. The fixture is the only thing
// that speaks field names.
//
// THE AMOUNT ASSERTIONS ARE THE MONEY-UNIT PIN. The legacy wire carried CENTS
// and the component divided by 100; the next wire carries DOLLARS and must
// not. Either way the screen shows 434 - so "434" passing while "43400" and
// "4.34" are absent is what proves the division died exactly once, with the
// adapter.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin", name: "Admin" } }),
}));
// NumberFlow animates digits through a custom element with no synchronous
// text content under jsdom. The shim renders the raw value, which is exactly
// what the unit pin needs to read.
vi.mock("@dorado/components", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Amount: ({ value, className }: { value: number; className?: string }) =>
    React.createElement("span", { className }, String(value)),
}));

import { apiRequest } from "@/shared/queries/axios";
import AdminPendingSalesOrder from "@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPending";
import type { OrderView } from "@dorado/contracts";

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

// THE VIEW, not the row: a drawer child renders one OrderView, and `actions`
// is what it may offer rather than what it works out for itself.
const view = () =>
  ({
    order: { id: "so-1", status: "Pending", direction: "sale" },
    totals: null,
    items: [],
    address: null,
    shipments: [],
    pickup: null,
    payout: null,
    user: null,
    actions: { cancel: false, finalize_pricing: false, add_funds: false,
      send_to_refiner: false, buy_label: false, update_tracking: false,
      edit_lines: false, statuses: [] },
  } as unknown as OrderView);

// The wire's shape, one place. A card payment mid-confirmation: not yet
// succeeded, so the cancel button is live. $434.00, none of it received.
// This spoke the legacy flat names in CENTS until the component converted;
// fixture and component moved together.
const wireIntent = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  user_id: "33333333-3333-4333-8333-333333333333",
  type: "sales_order_checkout",
  status: "requires_confirmation",
  order_id: "so-1",
  direction: "sale",
  amount_expected: 434, // DOLLARS on this wire
  amount_received: 0,
  amount_capturable: 0,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  attempt: {
    provider: "stripe",
    provider_ref: "pi_test_123",
    status: "requires_confirmation",
  },
  details: {
    provider: "stripe",
    provider_ref: "pm_test_1",
    type: "CARD",
    last_four: "4242",
    card_brand: "visa",
    bank_name: null,
    account_type: null,
  },
});

// THE PAYMENT READS MOVED TO @dorado/client, which owns its own `fetch` and
// never goes through the legacy axios wrapper - so the network is stubbed at
// `fetch` now. Same idea, one layer down: answered by URL, and anything
// unrecognised comes back empty rather than throwing.
const json = (body: unknown): Response =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

const stubApi = (intent: Record<string, unknown>) =>
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(String(input), "http://test.local");
    if (url.pathname.endsWith("/stripe/get_sales_order_payment_intent")) return json(intent);
    // The method rows the instrument label resolves through (D207) - the
    // component reads them instead of a hardcoded array now.
    if (url.pathname.endsWith("/payments/methods")) {
      return json([{ type: "CARD", label: "Card", direction: "sale" }]);
    }
    return json({});
  }));

// Every request `fetch` was given, as [url, init] pairs.
const fetchCalls = (): [string, RequestInit | undefined][] =>
  vi.mocked(globalThis.fetch as unknown as (...a: unknown[]) => unknown).mock.calls.map(
    (c) => [String(c[0]), c[1] as RequestInit | undefined]
  );

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({});
  stubApi(wireIntent());
});

describe("an admin watching a sales order's payment", () => {
  test("the payment's status and instrument render", async () => {
    renderWithClient(<AdminPendingSalesOrder view={view()} />);

    // The status pill, title-cased out of Stripe's snake_case.
    expect(await screen.findByText("Requires Confirmation")).toBeTruthy();
    expect(screen.getByText("Visa")).toBeTruthy();
    expect(screen.getByText(/4242$/)).toBeTruthy();
  });

  test("the amounts land in dollars, converted exactly once", async () => {
    renderWithClient(<AdminPendingSalesOrder view={view()} />);
    await screen.findByText("Requires Confirmation");

    // Total due and remaining balance are both $434; nothing shows the cents
    // figure raw, and nothing divided a dollar figure by 100 again.
    expect(screen.getAllByText("434").length).toBe(2);
    expect(screen.queryByText("43400")).toBeNull();
    expect(screen.queryByText("4.34")).toBeNull();
  });

  test("the cancel carries the provider's intent reference", async () => {
    renderWithClient(<AdminPendingSalesOrder view={view()} />);
    await screen.findByText("Requires Confirmation");

    await userEvent.click(screen.getByRole("button", { name: /cancel payment/i }));

    await waitFor(() => {
      const call = fetchCalls().find(([url]) => url.includes("/stripe/cancel_payment_intent"));
      expect(call).toBeTruthy();
      expect(String(call![1]?.body)).toContain("pi_test_123");
    });
  });

  test("a settled payment cannot be cancelled again", async () => {
    stubApi({ ...wireIntent(), status: "succeeded" });

    renderWithClient(<AdminPendingSalesOrder view={view()} />);
    await screen.findByText("Succeeded");

    const cancel = screen.getByRole("button", { name: /cancel payment/i });
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
  });
});
