import { test, expect, request as pwRequest } from '@playwright/test'

// WORKING a sales order in the admin drawer - the buy side's answer to
// admin-purchase-order-work.e2e.ts, and the spec that finally exercises the
// sales lifecycle end to end.
//
// THE SEED IS THE REAL ADMIN FLOW, NOT A ROWS-ONLY SCRIPT. createSalesOrder
// is session-coupled top to bottom (it re-reads the session, prices the named
// customer's funds, and is deliberately 403 for customers - sales are
// admin-created for now). So this drives the same calls the admin drawer's
// useAdminCreateSalesOrder drives: retrieve the admin-flavoured intent for the
// customer and re-price it (`{ user_id, type }` - the row supplies the rest),
// sync the customer's buy cart through the admin-scoped accessor
// (PUT /api/checkout/lots?user_id=, admin-only - api/src/domains/checkout/controller.ts),
// and then place with ONE `AdminSaleCreate` body against POST /api/orders/admin
// (orders pass 2), which runs the checkout steps server-side in one transaction. The intent is a REAL Stripe TEST-MODE object
// (Jacob: "as long as we're hitting the stripe sandbox in testing it's
// fine"); nothing is ever confirmed or captured, and the order ends Cancelled
// like every disposable e2e order.
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')

let orderId = ''
let orderNumber = 0

test.beforeAll(async ({ playwright }) => {
  // The hook builds the whole sale server-side - a dozen API calls including a
  // real Stripe TEST-MODE intent - and the default 30s hook budget was not
  // enough under parallel workers sharing one dev API.
  test.setTimeout(120_000)
  const admin = await pwRequest.newContext({ storageState: 'playwright/.auth/admin.json' })
  const customer = await pwRequest.newContext({ storageState: 'playwright/.auth/customer.json' })

  // The customer's own context answers what only they can see: their id (off
  // the users list would need admin, but the address list is theirs) and the
  // stable seeded address.
  const addresses = await customer.get(`${API}/addresses`)
  expect(addresses.ok(), `addresses failed: ${addresses.status()}`).toBeTruthy()
  // GET /addresses answers BOOK ENTRIES now - { address, user_address, locked,
  // actions } - not flat address rows. The nickname is the user_address's
  // `label`; the id an order needs is the address's own.
  type BookEntry = { address?: { id?: string }; user_address?: { label?: string } }
  const addressList: BookEntry[] = await addresses.json()
  const seedAddress =
    addressList.find((a) => a?.user_address?.label === 'e2e-order-seed') ?? addressList[0]
  const seedAddressId = seedAddress?.address?.id
  expect(seedAddressId, 'the e2e customer has no address - run seed:e2e:order once').toBeTruthy()

  // The address wire deliberately carries no user_id; the customer's own
  // session is the honest source of their id.
  const sessionRes = await customer.get(`${API}/auth/get-session`)
  expect(sessionRes.ok(), `get-session failed: ${sessionRes.status()}`).toBeTruthy()
  const customerId = (await sessionRes.json())?.user?.id
  expect(customerId, 'the session names no user').toBeTruthy()

  // GET /products answers GROUPS now - a family and its variants.
  const products = await customer.get(`${API}/products`)
  expect(products.ok(), `products failed: ${products.status()}`).toBeTruthy()
  const product = (await products.json())
    .map((g: { default?: { id?: string } }) => g?.default)
    .find((p: { id?: string } | undefined) => p?.id)
  expect(product?.id, 'no product to put on the order').toBeTruthy()

  // The admin-flavoured intent for THIS customer. The endpoint creates one if
  // none exists and answers the intent; the shape has varied, so both the
  // object form and the bare client-secret form are accepted.
  const intentRes = await admin.get(
    `${API}/stripe/retrieve_payment_intent?type=admin&user_id=${customerId}`
  )
  expect(intentRes.ok(), `retrieve_payment_intent failed: ${await intentRes.text()}`).toBeTruthy()
  const intentBody = await intentRes.json().catch(async () => await intentRes.text())
  const secret =
    typeof intentBody === 'string' ? intentBody : (intentBody?.client_secret ?? intentBody?.id)
  const paymentIntentId = String(secret).startsWith('pi_')
    ? String(secret).split('_secret')[0]
    : intentBody?.id
  expect(
    String(paymentIntentId).startsWith('pi_'),
    `could not extract an intent id from ${JSON.stringify(intentBody).slice(0, 200)}`
  ).toBeTruthy()

  // ANY offered service/method will do - the checkout row just needs valid
  // ids, the same "any live X" choice seed-e2e-order.mjs makes on the
  // purchase side. Fetched before the priming call below: the intent body is
  // ids now (carrier_service_id / payment_method_id), not the code/type
  // strings the checkout row resolves the same rows from.
  const services = await admin.get(`${API}/carrier_services/sale_options`)
  expect(services.ok(), `sale_options failed: ${await services.text()}`).toBeTruthy()
  const service = (await services.json())[0]
  expect(service?.id, 'no sale shipping service to put on the checkout').toBeTruthy()

  const methods = await admin.get(`${API}/payments/methods?direction=sale`)
  expect(methods.ok(), `payments/methods failed: ${await methods.text()}`).toBeTruthy()
  const methodRows = await methods.json()
  const method = methodRows.find((m: { type?: string }) => m?.type === 'CARD') ?? methodRows[0]
  expect(method?.id, 'no sale payment method to put on the checkout').toBeTruthy()

  // THE PRICING UPDATE IS TWO FIELDS NOW: `UpdatePaymentIntentBody` is
  // `{ user_id, type }`, and the items, service, method and address are read
  // off the named customer's own checkout row server-side.
  const update = await admin.post(`${API}/stripe/update_payment_intent`, {
    data: { type: 'admin', user_id: customerId },
  })
  expect(update.ok(), `update_payment_intent failed: ${await update.text()}`).toBeTruthy()
  // The intent this priming call answers is the one `place()` finds on its
  // own (intentsRepo.findOpenForUser) - the create body below never names it.
  void paymentIntentId

  // THE ADMIN-SCOPED ACCESSOR (D214 item 2): user_id is admin-only, checked
  // the same way createOrderFromCheckout already checks admin ownership.
  // A BASKET LINE IS A LOT (docs/waves/lots-build.md, ruling 98): the endpoint
  // is `/checkout/lots` and the body key is `lots`.
  const synced = await admin.put(`${API}/checkout/lots?direction=sale&user_id=${customerId}`, {
    data: { lots: [{ bullion_id: product.id, quantity: 1 }] },
  })
  expect(synced.ok(), `admin basket sync failed: ${await synced.text()}`).toBeTruthy()

  const fulfillmentMethods = await admin.get(`${API}/fulfillments/methods?direction=sale`)
  expect(
    fulfillmentMethods.ok(),
    `fulfillment methods failed: ${await fulfillmentMethods.text()}`
  ).toBeTruthy()
  // SHIPMENT is the CATEGORY; `type` is the flavour within it (CARRIER
  // DROPOFF / CARRIER PICKUP / DROPSHIP). Matching `type === 'SHIPMENT'`
  // matched nothing.
  const shipment = (await fulfillmentMethods.json()).find(
    (m: { category?: string }) => m?.category === 'SHIPMENT'
  )
  expect(shipment?.id, 'no SHIPMENT fulfillment method to place against').toBeTruthy()

  // ONE CALL, ONE BODY (orders pass 2): `POST /orders/admin` takes the whole
  // `AdminSaleCreate` and runs the four checkout steps server-side, inside one
  // transaction, before placing. The four requests that used to build that
  // checkout from the browser are the four this body replaces.
  const created = await admin.post(`${API}/orders/admin`, {
    data: {
      direction: 'sale',
      user_id: customerId,
      lots: [{ bullion_id: product.id, quantity: 1 }],
      fulfillment: {
        method_id: shipment.id,
        choices: {
          shipment: {
            carrier_service_id: service.id,
            recipient_address_id: seedAddressId,
          },
        },
      },
      payment_method_id: method.id,
      recipient_address_id: seedAddressId,
    },
  })
  expect(created.ok(), `admin order create failed: ${await created.text()}`).toBeTruthy()
  const order = await created.json()
  orderId = order?.id ?? order?.order?.id ?? ''
  orderNumber = order?.number ?? order?.order?.number ?? 0
  expect(orderId, `no order id in ${JSON.stringify(order).slice(0, 200)}`).toBeTruthy()

  await admin.dispose()
  await customer.dispose()
})

// UNCONDITIONAL, like the purchase twin: the in-test cancel only runs when
// every step passed, and a failing run must not leak a Pending sale.
test.afterAll(async () => {
  if (!orderId) return
  const ctx = await pwRequest.newContext({ storageState: 'playwright/.auth/admin.json' })
  await ctx.patch(`${API}/orders/${orderId}`, { data: { status: 'Cancelled' } }).catch(() => {})
  await ctx.dispose()
})

test('a seeded sale is born Pending and walks its lifecycle to Cancelled', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/admin?tab=sales-orders')
  const search = page.getByPlaceholder(/Search orders/i).first()
  await expect(search).toBeVisible({ timeout: 60_000 })
  await search.fill(String(orderNumber))

  const row = page.locator('tbody tr').first()
  await expect(row, 'the seeded sale never appeared').toContainText(String(orderNumber), {
    timeout: 20_000,
  })
  await row.click()

  const drawer = page.getByRole('dialog', { name: /Sales order/i }).first()
  await expect(drawer).toBeVisible({ timeout: 20_000 })
  // Born Pending: under create-then-charge a sale awaits its payment.
  await expect(drawer, 'a fresh sale should be Pending').toContainText(/Pending/, {
    timeout: 15_000,
  })

  // The workbench is real: totals from live spot, the customer named, the
  // Pending controls offered (Move to Preparing forward, Cancel Payment for
  // the intent).
  await expect(drawer).toContainText(/Total Due/i)
  await expect(drawer.getByRole('button', { name: /Move to Preparing/i })).toBeVisible()
  await expect(drawer.getByRole('button', { name: /Cancel Payment/i })).toBeVisible()

  // End state through the STATUS PATCH, not the drawer's Cancel Payment: that
  // button cancels the Stripe intent and then waits on order-side effects the
  // dev environment cannot deliver end to end (no webhook listener), so the
  // drawer legitimately stays Pending after it. The PATCH is the same status
  // write the admin's explicit Cancelled label uses; asserting the drawer
  // reflects it closes the loop through real UI state.
  const ctx = await pwRequest.newContext({ storageState: 'playwright/.auth/admin.json' })
  const patched = await ctx.patch(`${API}/orders/${orderId}`, {
    data: { status: 'Cancelled' },
  })
  expect(patched.ok(), `cancel PATCH failed: ${await patched.text()}`).toBeTruthy()
  await ctx.dispose()

  await page.reload()
  const searchAgain = page.getByPlaceholder(/Search orders/i).first()
  await expect(searchAgain).toBeVisible({ timeout: 60_000 })
  await searchAgain.fill(String(orderNumber))
  // WAIT FOR THE FILTER, then click. Clicking `tbody tr` straight after the
  // fill raced the re-render and landed on a row that was replaced, so no
  // drawer opened at all.
  const cancelledRow = page.locator('tbody tr').first()
  await expect(cancelledRow, 'the seeded sale never reappeared').toContainText(
    String(orderNumber),
    { timeout: 20_000 }
  )
  await cancelledRow.click()
  await expect(
    page.getByRole('dialog', { name: /Sales order/i }).first(),
    'the sale does not show Cancelled after the status write'
  ).toContainText(/Cancelled/, { timeout: 20_000 })
})
