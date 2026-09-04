// THE CHECKOUT SURFACE, ONE HOOK PER ENDPOINT.
//
// Every mutation answers the row the server now holds, and writes it straight
// into the cache - so a step re-renders from the SERVER's answer rather than
// from a local copy the browser guessed at. Nothing here derives anything:
// `missing`, `ready_for_rates`, `ready_for_payment` and `ready_to_place` are
// fields of that row (domain/checkout/rules.ts), not expressions in a
// component.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  CheckoutItem,
  OrderView,
  Package,
  CheckoutItemPatch,
  CheckoutPatch,
  CheckoutPayoutForm,
  CheckoutRate,
  CheckoutView,
  Direction,
  PurchaseOrderQuote,
  PurchaseOrderQuoteBody,
  SalesOrderQuote,
  SalesOrderQuoteBody,
} from "@dorado/contracts";
import { apiRequest } from "../fetch";
import { keys } from "../keys";
import { ensureSession } from "../session";

// A caller says whether a session already EXISTS; this package knows nothing
// about auth. `enabled: false` keeps a read mounted and idle, which is what a
// surface with nobody signed in wants - a READ never mints an identity, so
// opening the home page does not create a visitor. The WRITES below do:
// `ensureSession` is awaited first, and that is the "first basket touch" of
// ruling 63.
export type ReadOptions = { enabled?: boolean };

// `user_id` is admin-only server-side and names the customer an admin is
// ordering for; naming yourself is a no-op.
export type Subject = { user_id?: string };

const scope = (direction: Direction, subject?: Subject) => ({
  direction,
  ...(subject?.user_id ? { user_id: subject.user_id } : {}),
});

// ------------------------------------------------------------------ the row

export function useCheckout(
  direction: Direction, options: ReadOptions & Subject = {}
): UseQueryResult<CheckoutView, Error> {
  return useQuery({
    queryKey: keys.checkout.row(direction),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<CheckoutView>("GET", "/checkout", undefined, scope(direction, options)),
  });
}

// One PATCH per choice, fired from the handler that made it. The row comes
// back composed, so the cache entry every step reads is replaced rather than
// refetched.
export function usePatchCheckout(
  direction: Direction, subject?: Subject
): UseMutationResult<CheckoutView, Error, CheckoutPatch> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: CheckoutPatch) => {
      await ensureSession();
      return await apiRequest<CheckoutView>(
        "PATCH", "/checkout",
        { direction, ...patch },
        subject?.user_id ? { user_id: subject.user_id } : undefined
      );
    },
    onSuccess: (row) => client.setQueryData(keys.checkout.row(direction), row),
  });
}

// The draft fulfillment's own write: the stepper picks a carrier HANDOFF and
// the server owns the fulfillment-method vocabulary behind it.
export function useSetCheckoutFulfillment(
  direction: Direction
): UseMutationResult<CheckoutView, Error, { method_id?: string; handoff_code?: string }> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (choice: { method_id?: string; handoff_code?: string }) => {
      await ensureSession();
      return await apiRequest<CheckoutView>(
        "POST", "/checkout/fulfillment", { direction, ...choice }
      );
    },
    onSuccess: (row) => client.setQueryData(keys.checkout.row(direction), row),
  });
}

// The payout step. The two bank numbers are sealed at rest server-side and
// never come back; the row answers with payment_details_id set, which is what
// takes "payout_account" out of `missing`.
export function useSaveCheckoutPayout(
  direction: Direction
): UseMutationResult<CheckoutView, Error, CheckoutPayoutForm> {
  const client = useQueryClient();
  return useMutation({
    // The one write a VISITOR is refused: bank numbers are sealed at rest
    // against a user id and a visitor's is swept (api domain/checkout/service.ts
    // `assertRealAccount`). ensureSession is still awaited - the refusal has to
    // come from the server, about the account, rather than from a 401.
    mutationFn: async (form: CheckoutPayoutForm) => {
      await ensureSession();
      return await apiRequest<CheckoutView>(
        "POST", "/checkout/payout", { direction, ...form }
      );
    },
    onSuccess: (row) => client.setQueryData(keys.checkout.row(direction), row),
  });
}

// --------------------------------------------------------------- the basket

// `fetchCheckoutItems` used to live here as a one-shot read for a sign-in
// merge. Ruling 63 removed that merge entirely - a visitor gets an anonymous
// better-auth user on the first basket touch, so there is one copy of the
// basket, the server's, and signing in moves it server-side
// (`domain/checkout/adopt.ts`). Nothing ever called this export; deleted
// rather than kept "just in case" (frontend/features/checkout/items/queries.ts
// carries the same before/after note).

export function useCheckoutItems(
  direction: Direction, options: ReadOptions & Subject = {}
): UseQueryResult<CheckoutItem[], Error> {
  return useQuery({
    queryKey: keys.checkout.items(direction),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<CheckoutItem[]>("GET", "/checkout/items", undefined, scope(direction, options)),
  });
}

// PUT REPLACES - it IS the sync. The row is invalidated with it because
// `item_count` and `missing` are answers about the basket.
export function useReplaceCheckoutItems(
  direction: Direction
): UseMutationResult<CheckoutItem[], Error, { items: CheckoutItemPatch[] } & Subject> {
  const client = useQueryClient();
  return useMutation({
    // THE FIRST BASKET TOUCH. A signed-out visitor becomes an anonymous
    // better-auth user here, before the PUT, and the basket is server rows from
    // its very first line.
    mutationFn: async ({ items, user_id }: { items: CheckoutItemPatch[] } & Subject) => {
      await ensureSession();
      return await apiRequest<CheckoutItem[]>(
        "PUT", "/checkout/items", { items }, scope(direction, { user_id })
      );
    },
    onSuccess: (rows, { user_id }) => {
      // An admin syncing a NAMED customer's basket must not overwrite the
      // caller's own cached copy with somebody else's rows.
      if (user_id) return;
      client.setQueryData(keys.checkout.items(direction), rows);
      client.invalidateQueries({ queryKey: keys.checkout.row(direction) });
    },
  });
}

export function useClearCheckoutItems(
  direction: Direction
): UseMutationResult<{ removed: number }, Error, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await ensureSession();
      return await apiRequest<{ removed: number }>(
        "DELETE", "/checkout/items", undefined, { direction }
      );
    },
    onSuccess: () => {
      client.setQueryData(keys.checkout.items(direction), []);
      client.invalidateQueries({ queryKey: keys.checkout.row(direction) });
    },
  });
}

// ---------------------------------------------------------------- the rates

// GET /checkout/rates: the address, the box, the weight and the declared value
// are read off the caller's own row server-side, and the answer arrives
// already joined to the service catalogue - one entry per offered service,
// `carrier_service_id` being the id a PATCH sends back.
//
// GATED ON THE ROW, not on a local pick: the server refuses until the address
// and the package are actually stored, which only a landed PATCH does, and
// `ready_for_rates` is the row's own answer to that.
export function useCheckoutRates(
  direction: Direction, row: CheckoutView | undefined
): UseQueryResult<CheckoutRate[], Error> {
  const address_id = direction === "purchase" ? row?.shipper_address_id : row?.recipient_address_id;
  return useQuery({
    queryKey: keys.checkout.rates(direction, address_id, row?.package_id),
    enabled: row?.ready_for_rates === true,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => apiRequest<CheckoutRate[]>("GET", "/checkout/rates", undefined, { direction }),
  });
}

// --------------------------------------------------------------- the quotes

// Every customer-visible number comes from these (D81-D84). Both reprice on
// the spot ticker's own 10s rhythm, and the previous answer is kept so a total
// does not flicker to undefined between ticks.
export function usePurchaseQuote(
  body: PurchaseOrderQuoteBody, options: ReadOptions = {}
): UseQueryResult<PurchaseOrderQuote, Error> {
  return useQuery({
    queryKey: keys.quotes.purchase(body),
    enabled: (options.enabled ?? true) && body.items.length > 0,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () => apiRequest<PurchaseOrderQuote>("POST", "/quotes/purchase_order", body),
  });
}

export function useSalesQuote(
  body: SalesOrderQuoteBody, options: ReadOptions = {}
): UseQueryResult<SalesOrderQuote, Error> {
  return useQuery({
    queryKey: keys.quotes.sales(body),
    enabled: (options.enabled ?? true) && body.items.length > 0,
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
    queryFn: () => apiRequest<SalesOrderQuote>("POST", "/quotes/sales_order", body),
  });
}

// -------------------------------------------------------------- the packages

// The boxes a checkout offers - `shipping.packages` rows. Reference data: it
// changes when the business adds a box, not while a customer is choosing one.
export function usePackages(options: ReadOptions = {}): UseQueryResult<Package[], Error> {
  return useQuery({
    queryKey: ["shipping", "packages"],
    enabled: options.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    queryFn: () => apiRequest<Package[]>("GET", "/shipping/packages"),
  });
}

// ------------------------------------------------------------------ placing

// THE CREATE IS ONE ID (D210/D214). Every choice is already a server-side
// resource by the time Confirm is pressed, so the click carries the checkout's
// own id and nothing else; the server pulls the rest. The two directions land
// on different legacy namespaces, which is a URL fact rather than a shape one.
export function usePlaceOrderFromCheckout(
  direction: Direction
): UseMutationResult<OrderView, Error, void> {
  const client = useQueryClient();
  const path = direction === "purchase"
    ? "/purchase_orders/create_from_checkout"
    : "/sales_orders/create_sales_order";
  return useMutation({
    mutationFn: async () => {
      await ensureSession();
      const row = await apiRequest<CheckoutView>("GET", "/checkout", undefined, { direction });
      // A VISITOR IS REFUSED HERE, by the server, with a domain message the UI
      // turns into the sign-in prompt (api domain/orders/place.ts).
      return await apiRequest<OrderView>("POST", path, { checkout_id: row.id });
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.checkout.row(direction) });
      client.invalidateQueries({ queryKey: keys.checkout.items(direction) });
    },
  });
}
