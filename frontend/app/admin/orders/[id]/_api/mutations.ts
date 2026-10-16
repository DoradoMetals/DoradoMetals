'use client'

import * as React from 'react'
import {
  ApiError,
  useAddFunds,
  useAddOrderNote,
  useAdoptAssay,
  useBuyLabel,
  useCancelLabel,
  useCancelOrder,
  useCancelSchedule,
  useChangeOrderAddress,
  useChargeShipment,
  useConfirmMatch,
  useCreateFulfillment,
  useCreateOrderLot,
  useFinalizeOrder,
  useOpenPayout,
  usePatchFulfillment,
  usePatchOrder,
  usePatchOrderLot,
  usePatchPaymentDetails,
  usePutOrderSpots,
  usePutPayoutMethods,
  useRecordShipmentTracking,
  useRefundOrder,
  useResolveDispute,
  useSendPayout,
  useSetFulfillmentStatus,
  useUnlinkOrderLot,
  useStepUp,
  useVerifyCode,
} from '@dorado/client'
import type {
  Action,
  AdoptAssayLot,
  FulfillmentPatchBody,
  FulfillmentStatus,
  LotUnlinkBody,
  OrderLotLine,
  OrderLotPatch,
  OrderLotView,
  OrderPatch,
  OrderSpotWrite,
  OrderView,
  PayoutMethodLine,
  Rail,
  SessionView,
  VerificationView,
} from '@dorado/contracts'

export const STALE_MESSAGE =
  'Someone changed this order after you opened it. The screen now shows the latest version. Check it, then make your change again.'

export const isStale = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 409 &&
  error.message.includes('changed since this screen loaded')

export const isStepUpRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 403 && error.message.includes('step_up_required')

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'The change did not save. Try again.'

export type OrderNotice = { kind: 'stale' | 'error'; message: string }

export type ActionInput = {
  adopt?: AdoptAssayLot[]
  combine?: boolean
  address_id?: string | null
  address_reason?: string
  transfer_id?: string | null
  bank_link_id?: string | null
  rail?: Rail | null
  shipment_id?: string | null
  fulfillment_id?: string | null
  spots?: OrderSpotWrite[]
  shipping_charge?: number
  lot_ids?: string[]
  unlink_reason?: string
  refund_amount?: number | null
  inbound_id?: string | null
}

export const OPEN_TRANSFER: readonly string[] = ['Not sent', 'Due']

export function useOrderWrites(id: string, view: OrderView | undefined, refetch: () => void) {
  const [notice, setNotice] = React.useState<OrderNotice | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)
  const [revision, setRevision] = React.useState(0)

  const patchOrder = usePatchOrder(id)
  const patchLot = usePatchOrderLot(id)
  const finalize = useFinalizeOrder(id)
  const cancel = useCancelOrder(id)
  const addFunds = useAddFunds(id)
  const putSpots = usePutOrderSpots(id)
  const putMethods = usePutPayoutMethods(id)
  const addNote = useAddOrderNote(id)
  const adopt = useAdoptAssay(id)
  const changeAddress = useChangeOrderAddress(id)
  const refund = useRefundOrder(id)
  const openPayout = useOpenPayout(id)
  const sendPayout = useSendPayout(id)
  const buyLabel = useBuyLabel(id)
  const cancelLabel = useCancelLabel(id)
  const tracking = useRecordShipmentTracking(id)
  const moveFulfillment = useSetFulfillmentStatus(id)
  const cancelSchedule = useCancelSchedule(id)
  const charge = useChargeShipment(id)
  const createLot = useCreateOrderLot(id)
  const unlink = useUnlinkOrderLot(id)
  const patchDetails = usePatchPaymentDetails(id)
  const resolveDispute = useResolveDispute(id)
  const createFulfillment = useCreateFulfillment(id)
  const patchFulfillment = usePatchFulfillment(id)
  const confirmMatch = useConfirmMatch(id)

  const expected = view?.order.updated_at ?? undefined

  const fail = (error: unknown) => {
    if (isStale(error)) {
      setNotice({ kind: 'stale', message: STALE_MESSAGE })
      setRevision((current) => current + 1)
      refetch()
      return
    }
    setNotice({ kind: 'error', message: messageOf(error) })
  }

  const track = async (name: string, work: () => Promise<unknown>) => {
    setPending(name)
    setNotice(null)
    await work().then(
      () => undefined,
      (error: unknown) => fail(error)
    )
    setPending(null)
  }

  const payout = async (reason: string | null, input: ActionInput) => {
    const transfer_id =
      input.transfer_id ??
      (
        await openPayout.mutateAsync({
          order_id: id,
          rail: input.rail ?? 'ACH',
          ...(input.bank_link_id ? { bank_link_id: input.bank_link_id } : {}),
          ...(reason ? { override_reason: reason } : {}),
        })
      ).id
    await sendPayout.mutateAsync(transfer_id)
  }

  const unlinkAll = async (lot_ids: readonly string[], body: LotUnlinkBody) => {
    for (const lot_id of lot_ids) await unlink.mutateAsync({ lot_id, ...body })
  }

  const work = (action: Action, reason: string | null, input: ActionInput) => {
    const fulfillment_id = input.fulfillment_id
    if (fulfillment_id) {
      if (action.name === 'cancel_schedule') {
        return () => cancelSchedule.mutateAsync({ fulfillment_id })
      }
      if (action.name === 'schedule') return null
      return () =>
        moveFulfillment.mutateAsync({ fulfillment_id, status: action.name as FulfillmentStatus })
    }
    switch (action.name) {
      case 'cancel':
        return () => cancel.mutateAsync(reason ? { reason } : {})
      case 'reopen':
        return () => patchOrder.mutateAsync({ cancelled_at: null, expected_updated_at: expected })
      case 'finalize':
        return () => finalize.mutateAsync(undefined)
      case 'add_funds':
        return () => addFunds.mutateAsync(undefined)
      case 'send_payment':
        return () => payout(reason, input)
      case 'refund':
        return () =>
          refund.mutateAsync({
            amount: input.refund_amount ?? view?.payment.refundable ?? 0,
            reason: reason ?? '',
          })
      case 'change_address':
        return () =>
          changeAddress.mutateAsync({
            address_id: input.address_id ?? '',
            reason: input.address_reason ?? reason ?? '',
          })
      case 'lock_spots':
      case 'unlock_spots':
        return () =>
          putSpots.mutateAsync({
            lock: action.name === 'lock_spots',
            ...(reason ? { reason } : {}),
          })
      case 'adopt_assay':
        return () =>
          adopt.mutateAsync({
            lots: input.adopt ?? [],
            ...(input.combine != null ? { combine: input.combine } : {}),
          })
      case 'edit_spots':
        return input.spots && input.spots.length > 0
          ? () => putSpots.mutateAsync({ set: input.spots, reason: reason ?? '' })
          : null
      case 'edit_charges':
        return input.shipment_id && input.shipping_charge != null
          ? () =>
              charge.mutateAsync({
                shipment_id: input.shipment_id as string,
                shipping_charge: input.shipping_charge as number,
                ...(reason ? { override_reason: reason } : {}),
              })
          : null
      case 'remove_lots':
        return input.lot_ids && input.lot_ids.length > 0
          ? () =>
              unlinkAll(input.lot_ids as string[], {
                reason: input.unlink_reason || reason || '',
                ...(action.override && reason ? { override_reason: reason } : {}),
              })
          : null
      case 'confirm_match':
        return input.inbound_id
          ? () => confirmMatch.mutateAsync({ inbound_id: input.inbound_id as string, order_id: id })
          : null
      case 'buy_label':
        return input.shipment_id ? () => buyLabel.mutateAsync(input.shipment_id as string) : null
      default:
        return null
    }
  }

  const run = (action: Action, reason: string | null, input: ActionInput = {}) => {
    const job = work(action, reason, input)
    if (!job) {
      setNotice({ kind: 'error', message: `“${action.name}” is not available on this screen yet.` })
      return Promise.resolve()
    }
    return track(action.name, job)
  }

  return {
    notice,
    revision,
    dismiss: () => setNotice(null),
    pending,
    run,
    editOrder: (patch: OrderPatch) =>
      track('edit_order', () =>
        patchOrder.mutateAsync({ ...patch, expected_updated_at: expected })
      ),
    editLot: (row: OrderLotView, patch: OrderLotPatch, override_reason: string | null = null) =>
      track('edit_lots', () =>
        patchLot.mutateAsync({
          lot_id: row.id,
          patch: {
            ...patch,
            expected_updated_at: row.lot.updated_at,
            ...(override_reason ? { override_reason } : {}),
          },
        })
      ),
    addLot: (lot: OrderLotPatch | OrderLotLine) =>
      track('add_lot', () => createLot.mutateAsync(lot)),
    removeLots: (lot_ids: readonly string[], body: LotUnlinkBody) =>
      track('remove_lots', () => unlinkAll(lot_ids, body)),
    setPayoutFee: (details_id: string, cost: number) =>
      track('edit_charges', () => patchDetails.mutateAsync({ details_id, cost })),
    choosePayoutMethod: (method_id: string) =>
      track('edit_payout_method', () => putMethods.mutateAsync({ methods: [{ method_id }] })),
    resolveDispute: (dispute_id: string, resolution: string) =>
      track('resolve_dispute', () => resolveDispute.mutateAsync({ dispute_id, resolution })),
    addNote: (body: string) => track('add_note', () => addNote.mutateAsync({ body })),
    setPayoutMethods: (methods: PayoutMethodLine[]) =>
      track('add_payout_method', () => putMethods.mutateAsync({ methods })),
    saveTracking: (shipment_id: string, tracking_number: string) =>
      track('update_tracking', () => tracking.mutateAsync({ shipment_id, tracking_number })),
    createFulfillment: (method_id: string, choices: FulfillmentPatchBody | null) =>
      track('create_fulfillment', async () => {
        const made = await createFulfillment.mutateAsync({ order_id: id, method_id })
        if (choices) {
          await patchFulfillment.mutateAsync({ fulfillment_id: made.fulfillment.id, choices })
        }
      }),
    cancelLabel: (shipment_id: string) =>
      track('cancel_label', () => cancelLabel.mutateAsync({ shipment_id })),
  }
}

export type OrderWrites = ReturnType<typeof useOrderWrites>

export function useStepUpGate(session: SessionView | undefined) {
  const send = useStepUp()
  const verify = useVerifyCode()
  const [sent, setSent] = React.useState<VerificationView | null>(null)
  const [invalid, setInvalid] = React.useState(false)
  const sendCode = send.mutate

  const request = React.useCallback(() => {
    setInvalid(false)
    sendCode(undefined, { onSuccess: (view) => setSent(view) })
  }, [sendCode])

  const onVerify = (code: string) =>
    new Promise<void>((resolve) => {
      verify.mutate(
        { channel: sent?.channel ?? (session?.email ? 'email' : 'sms'), code },
        {
          onSuccess: (view) => {
            if (view.status === 'verified') resolve()
            else setInvalid(true)
          },
          onError: () => setInvalid(true),
        }
      )
    })

  return {
    needed: session != null && !session.fresh,
    destination: sent?.destination ?? '',
    invalid,
    pending: send.isPending || verify.isPending,
    onVerify,
    request,
  }
}
