'use client'

import * as React from 'react'
import {
  Alert,
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerFooterAlert,
  DrawerPrimary,
  DrawerHeader,
  Stepper,
  Text,
  cn,
  useMediaUp,
} from '@dorado/components'
import {
  useCreateAdminOrder,
  useCreateRefiningOrder,
  useLinkedAccounts,
  useOrderPreview,
  useRefiningOrders,
} from '@dorado/client'

import {
  emptyDrawerState,
  hasLots,
  isRefiner,
  laterAllowed,
  rowsComplete,
  toCreateRequest,
  toPreviewBody,
  type DrawerState,
  type OrderKind,
} from '../../_lib/createOrder'
import { BANK_METHODS, STEPS } from '../../_lib/createOrderView'
import { OrderStep } from './OrderStep'
import { FulfillmentStep } from './FulfillmentStep'
import { TransactionStep } from './TransactionStep'
import { ReviewStep } from './ReviewStep'

export type DrawerViewer = { id: string; name: string; role: 'owner' | 'employee' }

export type CreateOrderDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  viewer: DrawerViewer
  onCreated: (created: { kind: OrderKind; id: string }) => void
  initial?: Partial<DrawerState>
  locked?: { kind?: boolean; customer?: boolean }
  layout?: 'desktop' | 'mobile'
}

function startingState(
  initial: Partial<DrawerState> | undefined,
  viewer: DrawerViewer
): DrawerState {
  const state = { ...emptyDrawerState(initial?.kind ?? 'customer_purchase'), ...initial }
  return viewer.role === 'employee' ? { ...state, assigned_to_id: viewer.id } : state
}

export function CreateOrderDrawer({
  open,
  onOpenChange,
  viewer,
  onCreated,
  initial,
  locked = {},
  layout,
}: CreateOrderDrawerProps) {
  const wide = useMediaUp('md')
  const mobile = (layout ?? (wide ? 'desktop' : 'mobile')) === 'mobile'
  const [state, setState] = React.useState<DrawerState>(() => startingState(initial, viewer))
  const [step, setStep] = React.useState(0)
  const [creating, setCreating] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  const update = React.useCallback(
    (patch: Partial<DrawerState>) => setState((current) => ({ ...current, ...patch })),
    []
  )

  const previewBody = React.useMemo(() => toPreviewBody(state), [state])
  const preview = useOrderPreview(previewBody).data ?? null

  const openSales = useRefiningOrders(
    { refiner_id: state.refiner_id, direction: 'sell' },
    { enabled: state.kind === 'refiner_sale' && !!state.refiner_id }
  ).data
  const openSale =
    state.kind === 'refiner_sale'
      ? (openSales?.items.find(
          (order) => order.refiner_id === state.refiner_id && !order.sent_at && !order.cancelled_at
        ) ?? null)
      : null

  const linked = useLinkedAccounts(
    state.kind === 'customer_purchase' ? state.customer_id : null
  ).data

  const createOrder = useCreateAdminOrder()
  const createRefining = useCreateRefiningOrder()

  const lots = hasLots(state)

  const ready = (() => {
    if (step === 0) {
      if (isRefiner(state.kind)) return !!state.refiner_id && !openSale
      return !!state.customer_id && rowsComplete(state.lots)
    }
    if (step === 1) {
      if (state.fulfillment === 'later') return laterAllowed(state)
      return state.fulfillment !== null || !lots
    }
    if (step === 2) {
      if (isRefiner(state.kind)) return true
      if (state.kind === 'customer_sale') {
        return !lots || (!!state.payment_method_id && !!state.recipient_address_id)
      }
      if (state.payout === 'later') return true
      if (state.payout === null) return !lots
      if (!BANK_METHODS.includes(state.payout.method)) return true
      const account = linked?.find(
        (link) => link.id === (state.payout as { bank_link_id?: string }).bank_link_id
      )
      return account?.status === 'verified'
    }
    return true
  })()

  const close = () => onOpenChange(false)

  async function create() {
    setFailure(null)
    setCreating(true)
    try {
      const request = toCreateRequest(state)
      if (request.endpoint === 'orders') {
        const view = await createOrder.mutateAsync(request.body)
        onCreated({ kind: state.kind, id: view.order.id })
      } else {
        const made = await createRefining.mutateAsync(request.body)
        onCreated({ kind: state.kind, id: made.id })
      }
      onOpenChange(false)
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const last = step === STEPS.length - 1
  const partySet = isRefiner(state.kind) ? !!state.refiner_id && !openSale : !!state.customer_id
  const skippable = step === 0 ? partySet : step === 1 || step === 2 ? laterAllowed(state) : false

  function skip() {
    if (step === 0) update({ lots: [], lot_ids: [] })
    if (step === 1) update({ fulfillment: 'later' })
    if (step === 2 && state.kind === 'customer_purchase') update({ payout: 'later' })
    if (step === 2 && state.kind === 'customer_sale') {
      update({ payment_method_id: null, recipient_address_id: null })
    }
    setStep((s) => s + 1)
  }

  const primary = last ? (
    <DrawerPrimary key="primary" onClick={create} busyLabel="Creating the order">
      {creating ? 'Creating…' : 'Create order'}
    </DrawerPrimary>
  ) : (
    <Button key="primary" onClick={() => setStep((s) => s + 1)} disabled={!ready}>
      Continue
    </Button>
  )
  const skipButton = last ? null : (
    <Button key="skip" variant="secondary" onClick={skip} disabled={!skippable}>
      Skip
    </Button>
  )
  const back =
    step > 0 ? (
      <Button
        key="back"
        variant="secondary"
        onClick={() => setStep((s) => s - 1)}
        disabled={creating}
      >
        Back
      </Button>
    ) : null
  const cancel = (
    <Button key="cancel" variant="tertiary" onClick={close} disabled={creating}>
      Cancel
    </Button>
  )
  const alert = failure ? (
    <Alert intent="danger" title="Could not create the order">
      {failure}
    </Alert>
  ) : null

  return (
    <Drawer
      open={open}
      setOpen={onOpenChange}
      size={mobile ? 'full' : 'lg'}
      label="New order"
      busy={creating}
    >
      <DrawerHeader title="New order" />
      <div className="flex shrink-0 flex-col gap-2xs border-b border-border px-md py-sm">
        <Stepper steps={[...STEPS]} current={step} />
        {mobile ? (
          <Text variant="micro" className="text-muted-foreground">
            {`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
          </Text>
        ) : (
          <div className="grid grid-cols-4 text-micro text-muted-foreground">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={cn(
                  i === 0 ? 'text-left' : i === STEPS.length - 1 ? 'text-right' : 'text-center',
                  i === step && 'text-foreground'
                )}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <DrawerBody className="gap-md">
        {step === 0 && (
          <OrderStep
            state={state}
            update={update}
            viewer={viewer}
            locked={locked}
            preview={preview}
            openSale={openSale}
          />
        )}
        {step === 1 && <FulfillmentStep state={state} update={update} preview={preview} />}
        {step === 2 && <TransactionStep state={state} update={update} />}
        {step === 3 && (
          <ReviewStep
            state={state}
            update={update}
            viewer={viewer}
            preview={preview}
            onEdit={setStep}
            mobile={mobile}
          />
        )}
      </DrawerBody>
      <DrawerFooter className="relative flex-col items-stretch sm:flex-col sm:items-stretch sm:justify-start">
        {alert && <DrawerFooterAlert>{alert}</DrawerFooterAlert>}
        {mobile ? (
          <div className="flex flex-col gap-xs">
            {primary}
            {skipButton}
            {back}
            {cancel}
          </div>
        ) : (
          <div className="flex items-center gap-xs">
            <div className="mr-auto">{cancel}</div>
            {back}
            {skipButton}
            {primary}
          </div>
        )}
      </DrawerFooter>
    </Drawer>
  )
}
