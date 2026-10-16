import { afterEach, describe, expect, test, vi } from 'vitest'
import { act as run, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiError } from '@dorado/client'

import { STALE_MESSAGE, isStale, isStepUpRequired, useOrderWrites, useStepUpGate } from '../_api'
import { scrapLot } from '../_components/tests/detailFixtures'
import { stubApi } from '../../tests/fixtures'
import { ORDER_ID, STAMP, act, orderView, session } from './screenFixtures'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

const writes = (view = orderView('purchase'), refetch = vi.fn()) =>
  renderHook(() => useOrderWrites(ORDER_ID, view, refetch), { wrapper })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('error kinds', () => {
  test('a 409 naming the stale stamp is stale; other refusals are not', () => {
    expect(isStale(new ApiError(409, 'order 2481 changed since this screen loaded it', null))).toBe(
      true
    )
    expect(isStale(new ApiError(409, 'order 2481 is already cancelled', null))).toBe(false)
    expect(isStale(new Error('changed since this screen loaded'))).toBe(false)
    expect(isStepUpRequired(new ApiError(403, 'step_up_required', null))).toBe(true)
    expect(isStepUpRequired(new ApiError(403, 'not yours', null))).toBe(false)
  })
})

describe('useOrderWrites', () => {
  test('reopen patches with the order stamp', async () => {
    const calls = stubApi({ [`PATCH /orders/${ORDER_ID}`]: orderView('purchase') })
    const hook = writes()
    await run(() => hook.result.current.run(act('reopen'), null))
    expect(calls[0].body).toEqual({ cancelled_at: null, expected_updated_at: STAMP })
  })

  test('a lot edit sends the lot stamp and the override reason', async () => {
    const calls = stubApi({ [`PATCH /orders/lots/${scrapLot.id}`]: scrapLot })
    const hook = writes()
    await run(() =>
      hook.result.current.editLot(scrapLot, { purity: 0.6 }, 'Customer agreed new purity')
    )
    expect(calls[0].body).toEqual({
      purity: 0.6,
      expected_updated_at: scrapLot.lot.updated_at,
      override_reason: 'Customer agreed new purity',
    })
  })

  test('a stale save shows the stale message and refetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: 'order 2481 changed since this screen loaded it' },
            }),
            { status: 409 }
          )
      )
    )
    const refetch = vi.fn()
    const hook = writes(orderView('purchase'), refetch)
    await run(() => hook.result.current.editOrder({ notes: 'x' }))
    expect(hook.result.current.notice).toEqual({ kind: 'stale', message: STALE_MESSAGE })
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(hook.result.current.revision).toBe(1)
  })

  test('any other refusal shows the server words and does not refetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'order 1112 has shipped' } }), {
            status: 409,
          })
      )
    )
    const refetch = vi.fn()
    const hook = writes(orderView('sale'), refetch)
    await run(() => hook.result.current.run(act('cancel'), null))
    expect(hook.result.current.notice).toEqual({ kind: 'error', message: 'order 1112 has shipped' })
    expect(refetch).not.toHaveBeenCalled()
    expect(hook.result.current.revision).toBe(0)
    run(() => hook.result.current.dismiss())
    expect(hook.result.current.notice).toBeNull()
  })

  test('send payment opens a payout, then sends it', async () => {
    const transfer = { id: '00000000-0000-4000-8000-0000000000f1' }
    const calls = stubApi({
      'POST /payments/payouts': transfer,
      [`POST /payments/payouts/${transfer.id}/send`]: transfer,
    })
    const hook = writes()
    await run(() =>
      hook.result.current.run(act('send_payment'), null, {
        bank_link_id: '00000000-0000-4000-8000-0000000000b9',
        rail: 'ACH',
      })
    )
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      'POST /payments/payouts',
      `POST /payments/payouts/${transfer.id}/send`,
    ])
    expect(calls[0].body).toEqual({
      order_id: ORDER_ID,
      rail: 'ACH',
      bank_link_id: '00000000-0000-4000-8000-0000000000b9',
    })
  })

  test('send payment reuses a transfer that is not sent yet', async () => {
    const id = '00000000-0000-4000-8000-0000000000f2'
    const calls = stubApi({ [`POST /payments/payouts/${id}/send`]: { id } })
    const hook = writes()
    await run(() => hook.result.current.run(act('send_payment'), null, { transfer_id: id }))
    expect(calls.map((c) => c.url.pathname)).toEqual([`/payments/payouts/${id}/send`])
  })

  test('a refund sends the refundable amount and the stored reason', async () => {
    const calls = stubApi({ [`POST /orders/${ORDER_ID}/refunds`]: [] })
    const view = orderView('sale', {
      payment: { received: 40, refunded: 0, refundable: 40, charge_received: true },
    })
    const hook = writes(view)
    await run(() => hook.result.current.run(act('refund'), 'Damaged in transit, refund all'))
    expect(calls[0].body).toEqual({ amount: 40, reason: 'Damaged in transit, refund all' })
  })

  test('an address change sends the chosen address and its reason', async () => {
    const calls = stubApi({ [`POST /orders/${ORDER_ID}/address`]: orderView('sale') })
    const hook = writes(orderView('sale'))
    const address_id = '00000000-0000-4000-8000-0000000000e1'
    await run(() =>
      hook.result.current.run(act('change_address'), null, {
        address_id,
        address_reason: 'Customer moved last week',
      })
    )
    expect(calls[0].body).toEqual({ address_id, reason: 'Customer moved last week' })
  })

  test('adopting an assay sends the figures', async () => {
    const calls = stubApi({ [`POST /orders/${ORDER_ID}/adopt_assay`]: [] })
    const hook = writes()
    await run(() =>
      hook.result.current.run(act('adopt_assay'), null, {
        adopt: [{ id: scrapLot.id, figures: { purity: 0.55 } }],
      })
    )
    expect(calls[0].body).toEqual({ lots: [{ id: scrapLot.id, figures: { purity: 0.55 } }] })
  })

  test('a fulfillment move sets the status; cancel schedule cancels', async () => {
    const fulfillment_id = '00000000-0000-4000-8000-0000000000c9'
    const calls = stubApi({
      'POST /fulfillments/set_status': {},
      'POST /fulfillments/cancel_schedule': {},
    })
    const hook = writes()
    await run(() => hook.result.current.run(act('Completed'), null, { fulfillment_id }))
    await run(() => hook.result.current.run(act('cancel_schedule'), null, { fulfillment_id }))
    expect(calls.map((c) => [c.url.pathname, c.body])).toEqual([
      ['/fulfillments/set_status', { fulfillment_id, status: 'Completed' }],
      ['/fulfillments/cancel_schedule', { fulfillment_id }],
    ])
  })

  test('an action this screen cannot run says so and calls nothing', async () => {
    const calls = stubApi({})
    const hook = writes()
    await run(() => hook.result.current.run(act('assign_lots'), null))
    expect(calls).toEqual([])
    expect(hook.result.current.notice?.kind).toBe('error')
  })

  test('pending names the running action', async () => {
    let release: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    )
    const hook = writes()
    let done: Promise<unknown> = Promise.resolve()
    run(() => {
      done = hook.result.current.run(act('finalize'), null)
    })
    await waitFor(() => expect(hook.result.current.pending).toBe('finalize'))
    await run(async () => {
      release(new Response('{}', { status: 200 }))
      await done
    })
    expect(hook.result.current.pending).toBeNull()
  })
})

describe('useStepUpGate', () => {
  test('needs a step-up only when the session is stale', () => {
    stubApi({})
    expect(renderHook(() => useStepUpGate(session(false)), { wrapper }).result.current.needed).toBe(
      true
    )
    expect(renderHook(() => useStepUpGate(session(true)), { wrapper }).result.current.needed).toBe(
      false
    )
  })

  test('a wrong code marks the input invalid', async () => {
    const view = {
      purpose: 'step_up',
      channel: 'email',
      destination: 'a•••@example.invalid',
      code_length: 6,
      expires_at: STAMP,
      resend_at: null,
      attempts_remaining: 4,
      locked_until: null,
    }
    stubApi({
      'POST /account/step_up': { ...view, status: 'sent' },
      'POST /account/verify_code': { ...view, status: 'sent' },
    })
    const hook = renderHook(() => useStepUpGate(session(false)), { wrapper })
    run(() => hook.result.current.request())
    await waitFor(() => expect(hook.result.current.destination).toBe('a•••@example.invalid'))
    run(() => {
      hook.result.current.onVerify('000000')
    })
    await waitFor(() => expect(hook.result.current.invalid).toBe(true))
  })

  test('verify sends the code without the masked destination; the server resolves it from the session', async () => {
    const view = {
      purpose: 'step_up',
      channel: 'email',
      destination: 'a•••@example.invalid',
      code_length: 6,
      expires_at: STAMP,
      resend_at: null,
      attempts_remaining: 4,
      locked_until: null,
    }
    const calls = stubApi({
      'POST /account/step_up': { ...view, status: 'sent' },
      'POST /account/verify_code': { ...view, status: 'verified' },
    })
    const hook = renderHook(() => useStepUpGate(session(false)), { wrapper })
    run(() => hook.result.current.request())
    await waitFor(() => expect(hook.result.current.destination).toBe('a•••@example.invalid'))
    await run(() => hook.result.current.onVerify('123456'))
    const sent = calls.find((call) => call.url.pathname.endsWith('/account/verify_code'))
    expect(sent?.body).toEqual({ channel: 'email', code: '123456' })
  })
})

describe('useOrderWrites: the screen gaps', () => {
  const DETAILS = '00000000-0000-4000-8000-0000000000e1'
  const SHIPMENT = '00000000-0000-4000-8000-0000000000e2'
  const DISPUTE = '00000000-0000-4000-8000-0000000000e3'
  const METHOD = '00000000-0000-4000-8000-0000000000e4'

  test('edit_spots puts the frozen bid with the override reason', async () => {
    const calls = stubApi({ [`PUT /orders/${ORDER_ID}/spots`]: [] })
    const hook = writes()
    await run(() =>
      hook.result.current.run(act('edit_spots', { override: 'x' }), 'Matched the dealer quote', {
        spots: [{ metal_id: 'Gold', bid: 2500 }],
      })
    )
    expect(calls[0].body).toEqual({
      set: [{ metal_id: 'Gold', bid: 2500 }],
      reason: 'Matched the dealer quote',
    })
  })

  test('edit_charges posts the shipping charge, with the override reason only when given', async () => {
    const calls = stubApi({ [`POST /shipments/${SHIPMENT}/charge`]: {} })
    const hook = writes(orderView('sale'))
    await run(() =>
      hook.result.current.run(act('edit_charges'), null, {
        shipment_id: SHIPMENT,
        shipping_charge: 30,
      })
    )
    await run(() =>
      hook.result.current.run(act('edit_charges', { override: 'x' }), 'Carrier refund passed on', {
        shipment_id: SHIPMENT,
        shipping_charge: 20,
      })
    )
    expect(calls.map((c) => c.body)).toEqual([
      { shipping_charge: 30 },
      { shipping_charge: 20, override_reason: 'Carrier refund passed on' },
    ])
  })

  test('the payout charge patches the payout details by id', async () => {
    const calls = stubApi({ [`PATCH /payments/details/${DETAILS}`]: {} })
    const hook = writes()
    await run(() => hook.result.current.setPayoutFee(DETAILS, 5))
    expect(calls[0].body).toEqual({ cost: 5 })
  })

  test('one payout method is put with no amount', async () => {
    const calls = stubApi({ [`PUT /orders/${ORDER_ID}/payout_methods`]: orderView('purchase') })
    const hook = writes()
    await run(() => hook.result.current.choosePayoutMethod(METHOD))
    expect(calls[0].body).toEqual({ methods: [{ method_id: METHOD }] })
  })

  test('refund sends the chosen amount, else the refundable amount', async () => {
    const calls = stubApi({ [`POST /orders/${ORDER_ID}/refunds`]: [] })
    const view = orderView('sale', {
      payment: { received: 25, refunded: 0, refundable: 25, charge_received: true },
    })
    const hook = writes(view)
    await run(() =>
      hook.result.current.run(act('refund'), 'Damaged coin returned', { refund_amount: 10 })
    )
    await run(() => hook.result.current.run(act('refund'), 'Damaged coin returned'))
    expect(calls.map((c) => (c.body as { amount: number }).amount)).toEqual([10, 25])
  })

  test('a dispute resolves with its resolution', async () => {
    const calls = stubApi({ [`PATCH /orders/disputes/${DISPUTE}`]: {} })
    const hook = writes()
    await run(() => hook.result.current.resolveDispute(DISPUTE, 'Kept our assay'))
    expect(calls[0].body).toEqual({ resolution: 'Kept our assay' })
  })

  test('a lot is declared on a purchase and assigned from stock on a sale', async () => {
    const calls = stubApi({ [`POST /orders/${ORDER_ID}/lots`]: scrapLot })
    const hook = writes()
    await run(() =>
      hook.result.current.addLot({ metal_id: 'gold', unit: 'g', quantity: 1, pre_melt: 10 })
    )
    await run(() => hook.result.current.addLot({ lot_id: scrapLot.lot_id }))
    expect(calls.map((c) => c.body)).toEqual([
      { metal_id: 'gold', unit: 'g', quantity: 1, pre_melt: 10 },
      { lot_id: scrapLot.lot_id },
    ])
  })

  test('removing lots unlinks each one; an override action adds the override reason', async () => {
    const calls = stubApi({ [`POST /orders/lots/${scrapLot.id}/unlink`]: [] })
    const hook = writes()
    await run(() =>
      hook.result.current.removeLots([scrapLot.id], { reason: 'Merged at intake bench' })
    )
    await run(() =>
      hook.result.current.run(act('remove_lots', { override: 'x' }), 'Customer asked to drop it', {
        lot_ids: [scrapLot.id],
        unlink_reason: 'Line dropped by customer',
      })
    )
    expect(calls.map((c) => c.body)).toEqual([
      { reason: 'Merged at intake bench' },
      { reason: 'Line dropped by customer', override_reason: 'Customer asked to drop it' },
    ])
  })
})
