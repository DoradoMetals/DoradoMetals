"use client";

// THE PAYMENT SURFACE, ONE HOOK PER ENDPOINT.
//
// What is NOT here, deliberately: any decision about which surface a customer
// is shown. `payment_surface` is a field of the sales quote (`SalesOrderQuote`,
// computed from the amount Stripe is actually told), so a component reads it
// rather than comparing a balance to a total and mounting Stripe's element on
// the answer.
//
// Fees and surcharges on a method row are DISPLAY. The server's
// calculateCardCharge is the pricing authority, and the API's own
// reference-drift test pins the CARD and ACH rows to its constants. Icons stay
// a client-side map beside each selector (Jacob's standing call from the
// handoff conversion) - nothing visual rides the wire.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Direction, PaymentIntentView, PaymentMethod, UpdatePaymentIntentBody,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// Reference data: it changes when the business adds a payment method, not
// while a customer is choosing one.
const REFERENCE_STALE_TIME = 60 * 60 * 1000;

// GET /api/payments/methods. PUBLIC, like the endpoint - the product page and
// the payout landing render these rows to signed-out visitors. No direction
// means both.
export function usePaymentMethods(direction?: Direction) {
  return useQuery<PaymentMethod[]>({
    queryKey: keys.payments.methods(direction),
    queryFn: () =>
      apiRequest<PaymentMethod[]>("GET", "/payments/methods", undefined, { direction }),
    staleTime: REFERENCE_STALE_TIME,
  });
}

// GET /api/stripe/retrieve_payment_intent - the client_secret a browser
// confirms a payment with, and nothing else.
//
// THE INTENT IS THE SESSION'S. `subject` names the customer an ADMIN is
// ordering for and is refused server-side for anybody else; a customer's own
// intent is keyed by their session and leaves it undefined.
export function usePaymentIntentSecret(
  type: string, subject?: string | null, options: { enabled?: boolean } = {}
) {
  return useQuery<string>({
    queryKey: keys.payments.intent(type, subject),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<string>("GET", "/stripe/retrieve_payment_intent", undefined, {
        type,
        user_id: subject ?? undefined,
      }),
  });
}

// POST /api/stripe/update_payment_intent - IDS AND QUANTITIES (ruling 43).
// The body is the contract's: the delivery service and the payment method are
// ids the caller already holds, the balance is the customer's own row, and the
// price comes off the server's live spots. Answers a client_secret.
export function useUpdatePaymentIntent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePaymentIntentBody) =>
      apiRequest<string>("POST", "/stripe/update_payment_intent", body),
    onSuccess: (_secret, body) => {
      client.invalidateQueries({
        queryKey: keys.payments.intent(body.type ?? "", body.user_id ?? null),
      });
    },
  });
}

// GET /api/stripe/get_sales_order_payment_intent - the composed intent behind
// one order: what was asked for, the attempt carrying the provider's
// reference, the instrument. ADMIN ONLY, and in DOLLARS like the rest of the
// wire. It has never carried a routing number and never will.
export function useOrderPaymentIntent(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<PaymentIntentView>({
    queryKey: keys.payments.orderIntent(order_id),
    enabled: (options.enabled ?? true) && !!order_id,
    queryFn: () =>
      apiRequest<PaymentIntentView>(
        "GET", "/stripe/get_sales_order_payment_intent", undefined, { order_id }
      ),
  });
}

// POST /api/stripe/cancel_payment_intent. ADMIN ONLY. The cancellation is
// persisted server-side rather than left to the webhook, so re-reading the
// order's intent afterwards shows the real state.
export function useCancelPaymentIntent(order_id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payment_intent_id: string) =>
      apiRequest<unknown>("POST", "/stripe/cancel_payment_intent", { payment_intent_id }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.payments.orderIntent(order_id) });
    },
  });
}
