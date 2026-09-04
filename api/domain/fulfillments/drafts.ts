// THE HANDOVER A CHECKOUT IS ASKING FOR (rulings 69/70, Jacob 2026-09-04:
// "Everything needs to stay in its own lane... All checkout needs to do is
// send the checkout row and ask fulfillments if the order is ready for
// placement").
//
// This was `domain/checkout/service.ts`'s `setFulfillmentMethod` and
// `POST /api/checkout/fulfillment`. Both are gone. Checkout hands over its own
// id and, at most, the carrier handoff the customer clicked; everything after
// that - which fulfillment method that means, which detail row the category
// needs, what the draft still owes - is decided here.
//
// A SEPARATE FILE FROM service.ts, and that is what keeps the two lanes from
// tangling: this one imports domain/checkout (to read the row and to hand the
// id back), service.ts does not, and domain/checkout imports service.ts. No
// cycle, and the one direction that exists is the one ruling 70 describes.
import * as addressService from "#domain/places/addresses/service.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as methodService from "#domain/fulfillments/methods/service.ts";
import * as handoffsService from "#domain/shipping/handoffs/service.ts";
import * as rules from "#domain/fulfillments/rules.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Direction, FulfillmentCreateBody, FulfillmentView } from "@dorado/contracts";

// WHICH METHOD THE CUSTOMER MEANT. Three ways in, narrowing:
//
//   method_id     an id the menu offered - checked against that menu, because
//                 OWN LABEL is a real row hidden on purpose
//   handoff_code  the carrier HANDOFF the stepper renders; the SERVER owns the
//                 fulfillment-method vocabulary behind it, so the browser
//                 never learns a carrier's
//   neither       the direction's default SHIPMENT method, which is what lets
//                 a surface with no handover step (the sale) ask for a working
//                 draft with one id
async function methodFor(
  { method_id, handoff_code }: Omit<FulfillmentCreateBody, "checkout_id">,
  direction: Direction,
  executor?: Executor
): Promise<string> {
  if (method_id) {
    await methodService.assertOffered({ method_id, direction }, executor);
    return method_id;
  }
  if (!handoff_code) {
    return (await methodService.getDefault({ direction, category: "SHIPMENT" }, executor)).id;
  }
  const handoff = (await handoffsService.getHandoffs(null, executor))
    .find((h) => h.code === handoff_code);
  rules.assertHandoff(handoff, handoff_code);
  const type = rules.methodTypeFor(handoff);
  const offered = await methodService.listAvailable(direction, executor);
  const chosen = offered.find((m) => m.type === type)?.id;
  rules.assertOfferedType(chosen, type, direction);
  return chosen;
}

// POST /api/fulfillments. Idempotent by design: a checkout that already has a
// draft has its METHOD set rather than a second draft minted, which is what
// makes clicking through the handoff options a sequence of patches on one row.
export async function createForCheckout(
  body: FulfillmentCreateBody, caller_id: string, is_admin: boolean
): Promise<FulfillmentView> {
  return await withTransaction(async (tx) => {
    const row = await checkoutService.getRowById(body.checkout_id, tx);
    rules.assertFulfillment(row, body.checkout_id);
    rules.assertOwnedDraft(row.user_id, is_admin ? row.user_id : caller_id, body.checkout_id);

    const direction = row.direction as Direction;
    const method_id = await methodFor(body, direction, tx);

    if (row.fulfillment_id) {
      return await withDefaultAddress(
        await fulfillmentService.setMethod({ id: row.fulfillment_id, method_id }, tx),
        row.user_id, tx
      );
    }
    const draft = await fulfillmentService.createDraft({ method_id, direction }, tx);
    // The COLUMN is checkout's, and so is the statement that writes it: this
    // hands over an id and nothing else.
    await checkoutService.attachFulfillment(row.id, draft.fulfillment.id, tx);
    return await withDefaultAddress(draft, row.user_id, tx);
  });
}


// A NEW DRAFT TAKES THE CUSTOMER'S DEFAULT ADDRESS, which is where their metal
// is: the parcel's origin for a SHIPMENT, the collection address for a PICKUP.
// The checkout row did this for its own `shipper_address_id` until 128 and the
// reason is unchanged - the stepper used to do it from an effect on first
// render, so a checkout opened on a second device started blank and a
// re-render could re-pick.
//
// Only while the column is null, so it never runs over a choice.
async function withDefaultAddress(
  view: FulfillmentView, user_id: string, executor?: Executor
): Promise<FulfillmentView> {
  const category = view.method.category;
  if (category === "DIRECT") return view;
  if (category === "SHIPMENT" && view.parcel?.shipper_address_id) return view;
  if (category === "PICKUP" && view.pickup?.pickup_address_id) return view;

  const book = await addressService.list(user_id, executor);
  const preferred =
    book.find((e) => e.user_address.default_shipping && e.address.is_valid) ??
    book.find((e) => e.address.is_valid);
  if (!preferred) return view;

  return await fulfillmentService.patchChoices(
    view.fulfillment.id,
    category === "SHIPMENT"
      ? { shipment: { shipper_address_id: preferred.address.id } }
      : { pickup: { pickup_address_id: preferred.address.id } },
    executor
  );
}
