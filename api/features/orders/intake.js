// Taking apart the block the frontend sends when somebody places an order.
//
// THE PROBLEM THIS EXISTS TO SOLVE. The frontend posts one object -
// PurchaseOrderCheckout in frontend/features/orders/purchaseOrders/types.ts -
// containing an address, a package, a handoff choice, a carrier service, an
// insurance declaration, a payout and a list of items. The API fans that out
// into a purchase order, its items, its metals, a payout row, a shipment and
// sometimes a carrier pickup, in one function, in one transaction.
//
// The new schema does not have those shapes. It has a checkout session that
// records what was chosen, an order that records what was agreed, and a
// fulfillment that records how it changes hands. So the same block has to
// become a checkout FIRST and an order from there, which is a translation
// between two creation flows rather than a field map - and that is why orders
// gets a hand-written adapter instead of shared/wire/rename.ts.
//
// THIS FILE IS PURE ON PURPOSE. It resolves nothing, reads nothing and writes
// nothing: it turns the block into a description of what was asked for, in the
// new schema's vocabulary, with names where the new schema wants ids. Resolving
// those names is a database question and lives with the repo; deciding what the
// customer asked for is not, and can be tested exhaustively without one.
//
// Nothing calls this yet. The legacy creation path in
// features/purchase-orders/service.js is untouched and still serves traffic;
// this is the half that has to exist before the two can be compared.

// The handoff options the frontend actually offers, mapped to the fulfillment
// methods 047 seeded. Both are SHIPMENT - a customer choosing between dropping
// a parcel off and having one collected is choosing between two ways of posting
// it, not between posting it and coming in.
//
// The same mapping 052_backfill_fulfillments.sql uses for the historical rows,
// verified there against all 70 production shipments. Keeping them the same is
// what makes a rebuilt order and a migrated one comparable.
const HANDOFF = {
  "Store Dropoff": { type: "CARRIER DROPOFF", category: "SHIPMENT" },
  "Carrier Pickup": { type: "CARRIER PICKUP", category: "SHIPMENT" },
  // Not offered by the frontend today, and named here because the methods table
  // has them and an admin can put an order on one. Leaving them out would mean
  // this throws on a perfectly legal order the moment the UI grows a button.
  DropShip: { type: "DROPSHIP", category: "SHIPMENT" },
  "Own Label": { type: "OWN LABEL", category: "SHIPMENT" },
  Pickup: { type: "PICKUP", category: "PICKUP" },
  Appointment: { type: "APPOINTMENT", category: "DIRECT" },
  "Walk In": { type: "WALK IN", category: "DIRECT" },
};

// A scrap line and a bullion line are one table in the new schema, so both
// become the same shape and the discriminator is which id is set. exchange
// keeps its weights on exchange.scrap and the new schema keeps them on the
// item, which is why they are lifted here rather than left behind a join.
//
// The premium default is 0.75 and it is not arbitrary: it is what
// insertItems has always written when a line arrives without one
// (features/purchase-orders/repo.exchange.js). Changing it here would silently
// reprice every order placed through the new path.
function item(line) {
  if (!line || typeof line !== "object") return null;
  const { type, data } = line;
  if (!data) return null;

  if (type === "product") {
    return {
      kind: "product",
      bullion_id: data.id,
      metal: data.metal_type ?? data.metal ?? null,
      quantity: data.quantity ?? 1,
      premium: data.bid_premium ?? 0.75,
      // A product's weights are the product's, not the order's. They are
      // recorded on the item so an order still reads correctly after somebody
      // edits the product - which is the flow orders.items already declares in
      // scripts/lib/feature-map.mjs, and the one that hid the .9999 rounding.
      content: data.content ?? null,
      pre_melt: data.gross ?? null,
      purity: data.purity ?? null,
      unit: data.unit ?? null,
    };
  }

  if (type === "scrap") {
    return {
      kind: "scrap",
      metal: data.metal ?? null,
      quantity: data.quantity ?? 1,
      premium: data.bid_premium ?? 0.75,
      content: data.content ?? null,
      pre_melt: data.pre_melt ?? null,
      post_melt: data.post_melt ?? null,
      purity: data.purity ?? null,
      unit: data.gross_unit ?? data.unit ?? null,
      name: data.name ?? null,
    };
  }

  return null;
}

// The whole decomposition.
//
// `direction` is "purchase" when the customer is selling to the business and
// "sale" when they are buying, which is the orders.direction enum and the axis
// the fulfillment methods are listed on. It is a parameter rather than
// something inferred from the block, because the block does not say - the two
// checkout flows post to different endpoints and that is the only thing that
// distinguishes them.
export function decompose(block, { direction, userId } = {}) {
  if (!block || typeof block !== "object") {
    throw new Error("nothing to decompose");
  }
  if (direction !== "purchase" && direction !== "sale") {
    throw new Error(`direction must be "purchase" or "sale", got ${direction}`);
  }

  const handoffName = block.pickup?.name ?? null;
  const method = HANDOFF[handoffName];
  if (handoffName && !method) {
    // Refused rather than defaulted. A handoff nobody recognises means the
    // frontend has grown an option the API has not, and quietly filing it as a
    // dropoff would produce an order that says the customer chose something
    // they did not.
    throw new Error(
      `unknown handoff "${handoffName}" - add it to HANDOFF with the ` +
        `fulfillment method it means`
    );
  }

  const items = (block.items ?? []).map(item).filter(Boolean);
  if (!items.length) throw new Error("an order needs at least one item");

  const fulfillment = {
    // Null when the block did not say, which is legal: chooseDefault picks the
    // direction's default method rather than this inventing one.
    method_type: method?.type ?? null,
    category: method?.category ?? null,
  };

  if (fulfillment.category === "SHIPMENT") {
    fulfillment.shipment = {
      // The customer's address is the shipper on a purchase - they are the one
      // posting metal - and the recipient on a sale. Getting this backwards
      // prints a label that sends the parcel to the person who already has it.
      shipper_address: direction === "purchase" ? block.address : null,
      recipient_address: direction === "sale" ? block.address : null,
      // Named rather than resolved: shipping.services is keyed on
      // (carrier_id, name), and which carrier depends on the code.
      service_type: block.service?.serviceType ?? null,
      service_description: block.service?.serviceDescription ?? null,
      carrier_code: block.service?.code ?? null,
      net_charge: block.service?.netCharge ?? null,
      package_label: block.package?.label ?? null,
      weight: block.package?.weight ?? null,
      dimensions: block.package?.dimensions ?? null,
      insured: block.insurance?.insured ?? false,
      declared_value: block.insurance?.declaredValue?.amount ?? null,
    };

    // A courier coming to collect a parcel. Distinct from fulfillments.pickups,
    // which is us driving out to a customer - the two share a word and nothing
    // else, and conflating them is how a shipment ends up on a schedule of
    // places an employee is due.
    if (fulfillment.method_type === "CARRIER PICKUP") {
      fulfillment.carrier_pickup = {
        date: block.pickup?.date ?? block.pickup?.selectedDate ?? null,
        time: block.pickup?.time ?? null,
      };
    }
  }

  if (fulfillment.category === "PICKUP") {
    fulfillment.pickup = {
      pickup_address: block.address ?? null,
      start_time: block.pickup?.date ?? null,
    };
  }

  if (fulfillment.category === "DIRECT") {
    fulfillment.direct = {
      location_type: "DORADO_OFFICE",
      is_appointment: fulfillment.method_type === "APPOINTMENT",
      start_time: block.pickup?.date ?? null,
    };
  }

  return {
    direction,
    user_id: userId ?? null,
    address: block.address ?? null,
    items,
    fulfillment,
    // The payout is carried through untouched and deliberately not reshaped
    // here. It holds a routing number and an account number, and the decision
    // about where those live - and whether they are encrypted - is open in
    // FOLLOWUPS.md. Moving them in the same commit that reshapes an order would
    // bury that decision inside a refactor.
    payout: direction === "purchase" ? (block.payout ?? null) : null,
  };
}

export const handoffMethods = HANDOFF;
