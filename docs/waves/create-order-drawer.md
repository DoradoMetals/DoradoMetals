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
surface, a four-step indicator in the header, Back and Continue in the footer,
Create on the last step. Every step is one scrollable screen (Jacob,
2026-10-19: *"lets combine kind/party, and lots into one scrollable screen.
Additionally, the fulfillment/money/lots screens themselves should be
scrollable. We don't want to have to click through 50 steps."*). Every step is
a component state (ruling 152). Nothing is submitted before Create; the
pricing preview is a read from the pricing endpoint (the frontend computes no
money).

1. **Order.** One scrollable screen with three sections. Kind: two radio
   tiles, Customer order and Refiner order, then Purchase or Sale as radio
   chips; prefilled and locked when the context fixes it (the refiner screen
   fixes Refiner). Party: customer search (name, phone, email) with an inline
   "New customer" that opens the existing customer drawer, prefilled and
   locked from the customer screen; the assignee select defaulting to the
   auto-assign result, prefilled with the employee from the employee screen,
   owner only (an employee sees it read-only as themselves). Refiner order:
   the refiner select, the settlement type, the location. Lots: customer
   orders add lot rows "from scratch", each the checkout lot inputs: Scrap
   (metal, gross weight, purity, premium, unit) or Bullion (product search,
   quantity, premium); add, duplicate and remove a row; the row total and the
   running order estimate come from the pricing endpoint. Refiner orders:
   a Table (card rows) of on-hand lots to select, filtered by metal, with the
   selection count; refiner orders never take lots typed from scratch. Empty
   is allowed: the order is created with no lots and lots are added on the
   order screen later; the section says so.
2. **Fulfillment.** Scrollable. Purchase: how the metal arrives (ship in with
   a label, drop off, pickup) with the address and schedule fields the method
   needs. Sale: how it leaves (ship with carrier service and recipient
   address, pickup). Refiner: send method and the refiner location. Each
   method is a radio tile with its fields below it. A "Decide later" tile is
   allowed when the order has no lots; the order screen then asks for it.
3. **Transaction** (was Money; Jacob 1972495294). Scrollable. Purchase: the payout method (one by default, split
   is an explicit add, ruling 132) and the payout details select. Sale: the
   payment method and the recipient address. Refiner: nothing (settlement
   comes later, ruling 146). A card shows the locked spot, premiums and
   totals from the pricing preview; a sale locks its spots at placement
   (ruling 131). "Decide later" is allowed when the order has no lots.
4. **Review.** A read-only summary of every section with Edit links, a notes
   field, and Create. Success closes the drawer and opens the new order
   screen; failure shows the API's message in the drawer's alert slot.

Mobile: the same four steps, Full drawer, each step scrolling, footer
buttons pinned.

## What the Figma worker draws

One component set "Create Order Drawer" in the Orders file's "Orders card"
frame: Step (1 to 4) × Kind (Customer purchase, Customer sale, Refiner) where
the step differs, Desktop and Mobile, plus Loading and Error states on Review.
Lot row, Lot select table, Method tile and the pricing summary card are
granular components in the same frame. Pinned NEW: asked by Jacob 2026-10-19.

## What the code lane builds (after the design is approved)

`frontend/app/admin/orders/_components/CreateOrderDrawer/` with one
`_lib/createOrder.ts` that maps the drawer state to `AdminOrderCreate` or
`RefiningOrderCreate` and calls the existing client functions; a pricing
preview query; Playwright specs for the three kinds (ruling 130); tests first
(ruling 153). No new API unless the preview needs a read that does not exist.

## Decided (orchestrator, on Jacob's "ask the orchestrator", 2026-10-19)

- An order created with no lots may leave Fulfillment and Money as "Decide
  later"; the order screen asks for them before anything moves. With lots,
  both are chosen at creation.
- Refiner orders only select existing on-hand lots; lots typed from scratch
  belong to customer orders.

## Decided by Jacob (Orders thread 1972467644, 2026-10-19)

- A lot's premium is prefilled from the rate and an admin may override it
  (ruling 158). The code lane adds an optional `premium` to the admin lot
  shape on `AdminOrderCreate`; the pricing preview takes the override.
- A Refiner Purchase selects no lots; its bullion arrives later from the
  refiner invoice import (ruling 159). The Order step for Refiner Purchase
  has no Lots section.
- Fulfillment step: type first, then the details, reusing the order screens'
  fulfillment components. Money step: Method, then Accounts (payout to,
  payout from), then Details, with the pricing preview beside all three.
  Review: one card per step with a headline value, built for a glance.
- The drawer takes one payout method and no split ("no for the add payout
  method. We're not doing that here."); a split is added on the order screen
  (ruling 132 applies there). The pricing preview is not on the Money step;
  it is the Money card of the Review step.
- Bank accounts come from Plaid (ruling 160): Payout to lists the linked
  accounts plus "Link a new account"; Details is read-only (status, bank,
  account name, last four); with no account the step shows a Send link block
  (SMS or Email) and Continue waits for the webhook.
