# The unified Create Order drawer

Jacob, Orders comment 1972388843 (2026-10-19): *"We're gonna need a unified
create order drawer for all admin operations. Batching will run these things
by default, but if we ever want to create a new order with little to no lots
information, we're gonna need a lot of fill in. We'll need to select between
customer/refiner order, and purchase or sale. We'll need to add lots (from
scratch or select if we do refiner order) and all of their inputs. We'll need
to select the customer if done from the employee screen, and the employee if
done from the customer screen. We'll need to select fulfillment."*

One drawer, opened from the + action on any orders table (the Orders list,
the customer screen's Orders card, the employee screen's Orders card, the
refiner screen). It composes the API that exists; it invents no endpoint.

## What the API already takes

| Order | Endpoint | Body today |
| --- | --- | --- |
| Customer purchase | `POST /api/orders/admin` | `direction: purchase`, `user_id`, `lots[]` (the checkout lot shape: scrap or bullion, metal, gross and net weight or quantity, purity, premium, product), `fulfillment` (method choices), `payout` (the checkout payout form) |
| Customer sale | `POST /api/orders/admin` | `direction: sale`, `user_id`, `lots[]`, `fulfillment`, `payment_method_id`, `recipient_address_id` |
| Refiner order | `POST /api/refining/orders` | `refiner_id`, `direction`, `settlement_type`, `location_id`, `assigned_to_id`, `lot_ids[]` (existing on-hand lots) |
| Lots after creation | `POST /api/orders/:id/lots`, `POST /api/refining/orders/:id/lots` | add or assign lots later |
| Fulfillment | `POST /api/fulfillments` + `set_method`, `schedule_pickup`, `schedule_direct` | method and schedule |

Assignment (ruling 156): the owning service auto-assigns at creation; a chosen
assignee on the drawer is an explicit override an owner may set.

## The drawer

Library Drawer, size LG on desktop and Full on mobile, panel on the card
surface, a stepper in the header, Back and Continue in the footer, Create on
the last step. Every step is a component state (ruling 152). Nothing is
submitted before Create; the pricing preview is a read from the pricing
endpoint (the frontend computes no money).

1. **Kind.** Two radio tiles: Customer order, Refiner order. Then Purchase or
   Sale as radio chips. The copy under each tile says what it is in one line.
   Prefilled and locked when opened from a context that fixes it (the refiner
   screen fixes Refiner).
2. **Party.** Customer order: a customer search (name, phone, email) with an
   inline "New customer" that opens the existing customer drawer; prefilled
   and locked from the customer screen. Then the assignee: an employee select
   defaulting to the auto-assign result, prefilled with the employee from the
   employee screen, owner only (an employee sees it read-only as themselves).
   Refiner order: the refiner select, the settlement type, the location.
3. **Lots.** Customer order: a list of lot rows added "from scratch", each the
   checkout lot inputs: Scrap (metal, gross weight, purity, premium, unit) or
   Bullion (product search, quantity, premium); add, duplicate and remove a
   row; the row total and the running order estimate come from the pricing
   endpoint. Refiner order: a Table (the Library Table, card rows) of on-hand
   lots to select, filtered by metal, with the selection count. Empty is
   allowed ("little to no lots information"): the order is created with no
   lots and lots are added on the order screen later; the step says so.
4. **Fulfillment.** Purchase: how the metal arrives (ship in with a label,
   drop off, pickup) with the address and schedule fields the method needs.
   Sale: how it leaves (ship with carrier service and recipient address,
   pickup). Refiner: send method and the refiner location. Each method is a
   radio tile with its fields below it.
5. **Money.** Purchase: the payout method (one by default, split is an
   explicit add, ruling 132) and the payout details select. Sale: the payment
   method and the recipient address. Refiner: nothing (settlement comes
   later, ruling 146). A card shows the locked spot, premiums and totals from
   the pricing preview; a sale locks its spots at placement (ruling 131).
6. **Review.** A read-only summary of every step with Edit links, a notes
   field, and Create. Success closes the drawer and opens the new order
   screen; failure shows the API's message in the drawer's alert slot.

Mobile: the same steps, one per screen, Full drawer, footer buttons pinned.

## What the Figma worker draws

One component set "Create Order Drawer" in the Orders file's "Orders card"
frame: Step (1 to 6) × Kind (Customer purchase, Customer sale, Refiner) where
the step differs, Desktop and Mobile, plus Loading and Error states on Review.
Lot row, Lot select table, Method tile and the pricing summary card are
granular components in the same frame. Pinned NEW: asked by Jacob 2026-10-19.

## What the code lane builds (after the design is approved)

`frontend/app/admin/orders/_components/CreateOrderDrawer/` with one
`_lib/createOrder.ts` that maps the drawer state to `AdminOrderCreate` or
`RefiningOrderCreate` and calls the existing client functions; a pricing
preview query; Playwright specs for the three kinds (ruling 130); tests first
(ruling 153). No new API unless the preview needs a read that does not exist.

## Open for Jacob

- Does an order created with no lots skip Fulfillment and Money (set later on
  the order screen), or must those be chosen at creation?
- Refiner orders: is "select existing lots" the only path, or may a refiner
  order also take lots typed from scratch?
