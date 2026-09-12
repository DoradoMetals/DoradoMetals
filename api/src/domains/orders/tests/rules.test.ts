import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as rules from '#orders/rules.ts'
import { Conflict, Invalid } from '#shared/errors.ts'
import type { OrderView } from '@dorado/contracts'

test('sales tax is charged, never paid', () => {
  assert.equal(rules.chargesSalesTax('sale'), true)
  assert.equal(rules.chargesSalesTax('purchase'), false)
})

test('every metal the order holds must have been quoted', () => {
  assert.doesNotThrow(() =>
    rules.assertEveryMetalQuoted(
      ['gold', 'gold', 'silver'],
      [{ metal_id: 'gold' }, { metal_id: 'silver' }]
    )
  )
  assert.doesNotThrow(() => rules.assertEveryMetalQuoted([], []))
})

test('a metal the feed has not quoted refuses the placement', () => {
  assert.throws(
    () => rules.assertEveryMetalQuoted(['platinum'], [{ metal_id: 'gold' }]),
    (err: unknown) =>
      err instanceof Invalid && /no live quote for metal platinum/.test((err as Error).message)
  )
})

test('a short line copy refuses to commit', () => {
  assert.doesNotThrow(() => rules.assertEveryLineCopied(3, 3, 'order-1'))
  assert.throws(
    () => rules.assertEveryLineCopied(2, 3, 'order-1'),
    (err: unknown) => /3 basket line\(s\) to copy, 2 written/.test((err as Error).message)
  )
})

test('settled means the money is committed, and processing counts', () => {
  assert.equal(rules.isSettled('succeeded'), true)
  assert.equal(rules.isSettled('processing'), true)
  assert.equal(rules.isSettled('requires_payment_method'), false)
  assert.equal(rules.isSettled('canceled'), false)
  assert.equal(rules.isSettled(null), false)
})

test("the charge is in cents, and Stripe's floor is asked about separately", () => {
  assert.equal(rules.chargeCents(126.485), 12649)
  assert.equal(rules.belowStripeMinimum(49), true)
  assert.equal(rules.belowStripeMinimum(50), false)
  assert.equal(rules.belowStripeMinimum(0), false)
})

test('an order settles at placement when nothing is owed, or when the intent already succeeded', () => {
  assert.equal(rules.settlesAtPlacement(0, false), true)
  assert.equal(rules.settlesAtPlacement(12649, false), false)
  assert.equal(rules.settlesAtPlacement(12649, true), true)
})

test('an attached intent is a conflict when it settled and superseded when it did not', () => {
  assert.equal(
    rules.attachmentVerdict({ order_id: 's1', direction: 'sale', payment_status: 'succeeded' }),
    'conflict'
  )
  assert.equal(
    rules.attachmentVerdict({ order_id: 's1', direction: 'sale', payment_status: 'processing' }),
    'conflict'
  )
  assert.equal(
    rules.attachmentVerdict({
      order_id: 's1',
      direction: 'sale',
      payment_status: 'requires_payment_method',
    }),
    'supersede'
  )
  assert.equal(
    rules.attachmentVerdict({
      order_id: 'p1',
      direction: 'purchase',
      payment_status: 'requires_payment_method',
    }),
    'conflict'
  )
  assert.equal(rules.attachmentVerdict({}), 'proceed')
})

test('a repair is honoured only at the price that was actually taken', () => {
  assert.equal(rules.repairAmountMatches(12649, 12649), true)
  assert.equal(rules.repairAmountMatches('12649', 12649), true)
  assert.equal(rules.repairAmountMatches(12649, 12650), false)
  assert.equal(rules.repairAmountMatches(null, 12649), false)
})

test('a declared lot names its weights and leaves the content to the database', () => {
  assert.deepEqual(
    rules.declaredLot({ metal_id: 'gold', pre_melt: 160, purity: 0.5, unit: 'dwt' }),
    {
      metal_id: 'gold',
      pre_melt: 160,
      purity: 0.5,
      unit: 'dwt',
      post_melt: undefined,
      quantity: undefined,
    }
  )
})

test('a declared lot weighed in a unit nobody quotes in is refused, not valued at zero', () => {
  for (const unit of ['kg', 'ozt', 'oz t', ' g ', ''] as const) {
    assert.throws(
      () => rules.declaredLot({ metal_id: 'gold', pre_melt: 10, purity: 0.9, unit }),
      (err: unknown) => err instanceof Invalid && /cannot be valued/.test((err as Error).message),
      `"${unit}" was accepted`
    )
  }
  assert.throws(
    () => rules.declaredLot({ metal_id: 'gold', pre_melt: 10, purity: 0.9, unit: undefined }),
    (err: unknown) => err instanceof Invalid && /no unit/.test((err as Error).message)
  )
  assert.doesNotThrow(() =>
    rules.declaredLot({ metal_id: 'gold', pre_melt: 10, purity: 0.9, unit: 'T OZ' })
  )
})

test('a declared lot with no metal is refused by name', () => {
  assert.throws(
    () => rules.declaredLot({ pre_melt: 160, purity: 0.5, unit: 'dwt' }),
    (err: unknown) =>
      err instanceof Invalid && /declared lot needs a metal/.test((err as Error).message)
  )
})

test('a complete checkout places, and a short one names every step it owes', () => {
  assert.doesNotThrow(() => rules.assertPlaceable([]))

  assert.throws(
    () => rules.assertPlaceable(['package_id', 'payment_details_id']),
    (err: unknown) =>
      err instanceof Invalid &&
      /missing package_id, payment_details_id/.test((err as Error).message)
  )
  assert.throws(
    () => rules.assertPlaceable(['lots']),
    (err: unknown) => err instanceof Invalid && /missing lots/.test((err as Error).message)
  )
})

test('a draft another order already owns is refused, whatever its category', () => {
  const free = { fulfillment: { order_id: null }, method: { category: 'DIRECT' } }
  assert.equal(rules.requireFreeFulfillmentDraft(free), free)

  assert.throws(
    () =>
      rules.requireFreeFulfillmentDraft({
        fulfillment: { order_id: 'another-order' },
        method: { category: 'SHIPMENT' },
      }),
    Conflict
  )
  assert.throws(() => rules.requireFreeFulfillmentDraft(null), Invalid)
})

test('an operation of the wrong direction is refused, naming both', () => {
  assert.doesNotThrow(() => rules.assertDirection('purchase', 'purchase', 'cancelling'))
  assert.throws(
    () => rules.assertDirection('sale', 'purchase', 'cancelling'),
    (err: unknown) =>
      err instanceof Invalid &&
      /cancelling is a purchase-direction operation and this is a sale order/.test(
        (err as Error).message
      )
  )
  assert.throws(() => rules.assertDirection(null, 'purchase', 'cancelling'), Invalid)
})

type Facts = Parameters<typeof rules.actionsFor>[0]

const aLot = (confirmed: boolean, settled = true) =>
  ({
    settled,
    lot: { content: 1, confirmed_at: confirmed ? '2024-01-01T00:00:00.000Z' : null },
  }) as Facts['lots'][number]
const parcel = (direction: string, tracking_number: string | null) =>
  ({ direction, tracking_number }) as Facts['shipments'][number]

type Actions = ReturnType<typeof rules.actionsFor>

const hasAction = (actions: Actions, name: string): boolean =>
  actions.some((a) => a.name === name)
const actionNamed = (actions: Actions, name: string) => actions.find((a) => a.name === name)

const facts = (over: Partial<Facts> = {}): Facts =>
  ({
    order: {
      direction: 'purchase',
      cancelled_at: null,
      order_sent: null,
      tracking_updated: null,
    } as Facts['order'],
    totals: { total: 1000 } as Facts['totals'],
    lots: [aLot(true)],
    address: {} as Facts['address'],
    shipments: [],
    pickup: null,
    payout: null,
    user: null,
    credited: false,
    reference: 'PO-1',
    state: 'Awaiting Payout',
    ...over,
  }) as Facts

const order = (over: Partial<Facts['order']>): Partial<Facts> => ({
  order: { ...facts().order, ...over },
})

const paidBy = (method: string | null): Partial<Facts> => ({
  payout: { method } as Facts['payout'],
})

test("an order with no lines is not confirmed, which the drawer's every() called true", () => {
  assert.equal(rules.allLotsConfirmed([]), false)
  assert.equal(
    rules.allLotsConfirmed([
      { lot: { confirmed_at: '2024-01-01T00:00:00.000Z' } } as Facts['lots'][number],
      { lot: { confirmed_at: null } } as Facts['lots'][number],
    ]),
    false
  )
  assert.equal(
    rules.allLotsConfirmed([
      { lot: { confirmed_at: '2024-01-01T00:00:00.000Z' } } as Facts['lots'][number],
    ]),
    true
  )
})

test('crediting an account is a payout fact, read from the array of offered actions', () => {
  assert.equal(hasAction(rules.actionsFor(facts(paidBy('DORADO_ACCOUNT'))), 'add_funds'), true)
  assert.equal(hasAction(rules.actionsFor(facts(paidBy('ACH'))), 'add_funds'), false)
  assert.equal(
    hasAction(rules.actionsFor(facts({ ...paidBy('DORADO_ACCOUNT'), totals: null })), 'add_funds'),
    false
  )
})

test('the direction decides which half of the action surface exists', () => {
  const bought = rules.actionsFor(facts())
  assert.equal(hasAction(bought, 'finalize'), true)
  assert.equal(hasAction(bought, 'edit_lots'), true)
  assert.equal(hasAction(bought, 'supply'), false)

  const sold = rules.actionsFor(facts(order({ direction: 'sale' })))
  assert.equal(hasAction(sold, 'supply'), true)
  assert.equal(hasAction(sold, 'finalize'), false)
  assert.equal(hasAction(sold, 'edit_lots'), false)
  assert.equal(hasAction(sold, 'cancel'), false)
})

test('a label is offered only while the inbound parcel has none', () => {
  const unlabelled = [parcel('Inbound', null)]
  const labelled = [parcel('Inbound', '794...')]
  assert.equal(hasAction(rules.actionsFor(facts({ shipments: unlabelled })), 'buy_label'), true)
  assert.equal(hasAction(rules.actionsFor(facts({ shipments: labelled })), 'buy_label'), false)
  assert.equal(hasAction(rules.actionsFor(facts()), 'buy_label'), false)
  assert.equal(
    hasAction(rules.actionsFor(facts({ shipments: [parcel('Return', null)] })), 'buy_label'),
    false
  )
})

test('cancelling needs somewhere to send the metal back to', () => {
  assert.equal(hasAction(rules.actionsFor(facts()), 'cancel'), true)
  assert.equal(hasAction(rules.actionsFor(facts({ address: null })), 'cancel'), false)
  assert.equal(hasAction(rules.actionsFor(facts(order({ direction: 'sale' }))), 'supply'), true)
  assert.equal(
    hasAction(rules.actionsFor({ ...facts(order({ direction: 'sale' })), lots: [] }), 'supply'),
    false
  )
})

test("payable and line_total are the view's SQL, not a rule", () => {
  const view = readFileSync(new URL('../../../db/orders/sql/view.sql', import.meta.url), 'utf8')
  assert.match(view, /'payable',\s*\n?\s*CASE WHEN li\.content IS NULL OR li\.premium IS NULL/)
  assert.match(view, /ELSE li\.content \* li\.premium END/)
  assert.match(view, /WHEN li\.bullion_id IS NULL THEN pr\.price/)
  assert.match(view, /ELSE pr\.price \* li\.quantity END/)
})

test('a balance that no longer covers what the quote applied is refused', () => {
  assert.doesNotThrow(() => rules.assertCreditCovers(100, 100))
  assert.doesNotThrow(() => rules.assertCreditCovers(100.01, 100))
  assert.throws(
    () => rules.assertCreditCovers(99.99, 100),
    (err: unknown) => err instanceof Conflict && /no longer covers/.test((err as Error).message)
  )
  assert.throws(() => rules.assertCreditCovers(null, 1), Conflict)
  assert.throws(() => rules.assertCreditCovers(undefined, 1), Conflict)
})

test('add_funds is offered for any DORADO_ACCOUNT payout, and warns once already credited', () => {
  const payable = { payout: { method: 'DORADO_ACCOUNT' } as Facts['payout'] }
  const notYetCredited = rules.actionsFor(facts(payable))
  assert.equal(hasAction(notYetCredited, 'add_funds'), true)
  assert.equal(actionNamed(notYetCredited, 'add_funds')?.override, null)

  const alreadyCredited = rules.actionsFor(facts({ ...payable, credited: true }))
  assert.equal(hasAction(alreadyCredited, 'add_funds'), true, 'the action disappeared (MP F4)')
  assert.match(
    actionNamed(alreadyCredited, 'add_funds')?.override ?? '',
    /already been credited/
  )

  assert.equal(
    hasAction(rules.actionsFor(facts({ payout: { method: 'WIRE' } as Facts['payout'] })), 'add_funds'),
    false
  )

  assert.throws(() => rules.assertPayableToAccount('WIRE', 1), Invalid)
  assert.throws(() => rules.assertPayableToAccount(null, 1), Invalid)
  assert.doesNotThrow(() => rules.assertPayableToAccount('DORADO_ACCOUNT', 1))
  assert.throws(() => rules.assertCreditOverride(true, null, 1), Conflict)
  assert.throws(() => rules.assertCreditOverride(true, 'too short', 1), Conflict)
  assert.doesNotThrow(() => rules.assertCreditOverride(true, 'a long enough override reason', 1))
  assert.doesNotThrow(() => rules.assertCreditOverride(false, null, 1))
})

test('the finalize gate only refuses a direction mismatch or an empty order - everything else is a confirm, not a block', () => {
  assert.deepEqual(rules.finalizeBlockedBy(facts()), [])
  assert.doesNotThrow(() => rules.assertFinalizable(facts()))

  assert.deepEqual(
    rules.finalizeBlockedBy(facts({ lots: [aLot(false)] })),
    [],
    'an unconfirmed lot is a confirm reason, not a block - it must not stop finalize'
  )
  assert.deepEqual(rules.finalizeBlockedBy(facts({ lots: [] })), ['the order holds no lots'])
  assert.deepEqual(rules.finalizeBlockedBy(facts(order({ direction: 'sale' }))), [
    'this is not a purchase order',
  ])
  assert.throws(() => rules.assertFinalizable(facts({ lots: [] })), Invalid)
  assert.doesNotThrow(() => rules.assertFinalizable(facts({ lots: [aLot(false)] })))
})

test('finalizeConfirm names the missing fine weight before the missing confirmation', () => {
  assert.equal(rules.finalizeConfirm(facts()), null)
  assert.match(rules.finalizeConfirm(facts({ lots: [aLot(false)] })) ?? '', /1 of 1 lots are not confirmed/)
  assert.match(
    rules.finalizeConfirm(
      facts({
        lots: [{ lot: { content: null, confirmed_at: null } } as Facts['lots'][number]],
      })
    ) ?? '',
    /1 of 1 lots have no fine weight/
  )
})

test('payoutConfirm names the unsettled lots, then falls back to "not finalized"', () => {
  const finalized = facts({ order: order({ spots_locked: true }).order })
  assert.equal(
    rules.payoutConfirm(finalized),
    null,
    'every fixture lot is already settled and the order is finalized'
  )
  assert.match(
    rules.payoutConfirm({ ...finalized, lots: [aLot(true, false)] }) ?? '',
    /Refiner has not settled 1 of 1 lots/
  )
  assert.match(
    rules.payoutConfirm(facts({ order: order({ spots_locked: false }).order, totals: null })) ?? '',
    /has not been finalized/
  )
})

test('shipConfirm speaks only for a sale, and only while payment is outstanding', () => {
  assert.equal(rules.shipConfirm(facts()), null, 'a purchase order is not shipConfirm business')
  assert.equal(rules.shipConfirm(facts(order({ direction: 'sale' }))), null)
  assert.match(
    rules.shipConfirm({
      ...facts(order({ direction: 'sale' })),
      state: 'Awaiting Payment',
    }) ?? '',
    /has not paid/
  )
})

test('a cancelled order can be reopened, and only a cancelled one', () => {
  const cancelled = facts(order({ cancelled_at: new Date().toISOString() }))
  assert.equal(hasAction(rules.actionsFor(cancelled), 'reopen'), true)
  assert.equal(hasAction(rules.actionsFor(facts()), 'reopen'), false)
  assert.doesNotThrow(() => rules.assertReopenable(cancelled))
  assert.throws(() => rules.assertReopenable(facts()), Conflict)
})

test('the documents a method prints, and the one that waits for finalization', () => {
  const shipment = rules.documentsFor('SHIPMENT', false, [])
  assert.deepEqual(
    shipment.map((d) => d.name),
    [
      'Invoice',
      'Shipment Manifest',
      'Return Shipment Manifest',
      'Shipping Instructions',
      'Assay Results',
    ]
  )
  assert.equal(shipment[0]!.available, false, 'an invoice was offered before finalization')
  assert.equal(rules.documentsFor('SHIPMENT', true, [])[0]!.available, true)
  assert.deepEqual(
    rules.documentsFor('PICKUP', true, []).map((d) => d.name),
    ['Invoice', 'Pickup Manifest', 'Pickup Instructions', 'Assay Results']
  )
  assert.deepEqual(
    rules.documentsFor('DIRECT', true, []).map((d) => d.name),
    ['Invoice', 'Intake Receipt', 'Appointment Instructions', 'Assay Results']
  )
  assert.deepEqual(
    rules.documentsFor('DROPOFF', true, []).map((d) => d.name),
    ['Invoice', 'Assay Results']
  )
  const finalGated = rules.documentsFor('SHIPMENT', false, [])
  assert.equal(
    finalGated.find((d) => d.kind === 'assay_results')!.available,
    false,
    'assay results were offered before the lots were confirmed'
  )
  assert.equal(
    rules.documentsFor('SHIPMENT', true, []).find((d) => d.kind === 'assay_results')!.available,
    true
  )
})
