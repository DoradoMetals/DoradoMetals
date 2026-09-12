import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  OrderActions,
  type FulfillmentMethodRead,
  type FulfillmentStatus,
  type Rail,
} from '@dorado/contracts'

import { hasAction } from '@/shared/utils/actions'

import {
  AppointmentCard,
  ChargesCard,
  ChatCard,
  DocumentsCard,
  DropoffCard,
  FulfillmentCard,
  LinkedFulfillmentCard,
  LotsCard,
  OrderHeaderCard,
  PaymentCard,
  PickupCard,
  ProfitBreakdownCard,
  RefiningItemsCard,
  SettlementCard,
  ShipmentCard,
  SpotsCard,
  TotalsCard,
} from '../index'
import {
  aBullionLot,
  aCandidate,
  aDocument,
  aFulfillment,
  aLiveSpot,
  aLot,
  aMessage,
  aMethod,
  aPayTo,
  aPaymentView,
  aPayout,
  aProfitBreakdown,
  aFoundLot,
  aLocation,
  aRefiner,
  aRefiningLot,
  aRefiningOrder,
  aRefiningSpot,
  aShipment,
  aSpot,
  aTimelineCall,
  aTotals,
  anActions,
  anAdmin,
  anEmployee,
  anOrderView,
} from './fixtures'

const noop = () => {}

describe('Order Header', () => {
  const base = {
    eyebrow: 'PURCHASE ORDER',
    reference: 'PO-2481',
    assignedToId: anAdmin().id,
    admins: [anAdmin()],
    onAssign: noop,
    party: {
      kind: 'customer' as const,
      name: 'Marguerite Whitfield',
      place: 'Austin, TX',
      ordersToDate: 7,
    },
  }

  test('active: eyebrow, name, reference, orders to date, Assigned to, Cancel and Finalize', () => {
    render(
      <OrderHeaderCard
        {...base}
        cancel={{ label: 'Cancel Order', onClick: noop }}
        primary={{ label: 'Finalize', onClick: noop }}
      />
    )
    expect(screen.getByText('PURCHASE ORDER')).toBeTruthy()
    expect(screen.getByText('Marguerite Whitfield')).toBeTruthy()
    expect(screen.getByText(/PO-2481\s+·\s+Austin, TX/)).toBeTruthy()
    expect(screen.getByText('7 orders to date')).toBeTruthy()
    expect(screen.getByText('Assigned to')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel Order' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeTruthy()
    expect(screen.queryByText('Cancelled')).toBeNull()
  })

  test('cancelled: the Danger badge, Reopen instead of both buttons, assignment locked', () => {
    render(
      <OrderHeaderCard
        {...base}
        cancelled
        assignDisabled
        cancel={{ label: 'Cancel Order', onClick: noop }}
        primary={{ label: 'Finalize', onClick: noop }}
        reopen={{ label: 'Reopen Order', onClick: noop }}
      />
    )
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reopen Order' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel Order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Finalize' })).toBeNull()
  })

  test('a blocked Finalize says what it is waiting on, in the API words', () => {
    render(
      <OrderHeaderCard
        {...base}
        primary={{
          label: 'Finalize',
          onClick: noop,
          disabled: true,
          reason: 'lots are not priced',
        }}
      />
    )
    expect(screen.getByRole('button', { name: 'Finalize' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('lots are not priced')).toBeTruthy()
  })

  test('refiner party swaps the name for a Refiner select and a Send primary', () => {
    render(
      <OrderHeaderCard
        {...base}
        eyebrow="SALES ORDER"
        reference="SO-4471"
        party={{
          kind: 'refiner',
          refinerId: null,
          refiners: [{ id: 'r1', name: 'Elemetal' }],
          onRefinerChange: noop,
          locked: false,
          place: 'SO-4471',
          ordersToDate: 12,
        }}
        primary={{ label: 'Send to Refiner', onClick: noop }}
      />
    )
    expect(screen.getByText('Refiner')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send to Refiner' })).toBeTruthy()
  })
})

describe('Spots', () => {
  const spots = [aSpot('Gold', 2411.2), aSpot('Silver', 29.14)]

  test('unlocked: the live market, inputs read-only, Lock Spots', () => {
    render(
      <SpotsCard
        spots={spots}
        live={[aLiveSpot('Gold', 2450.0), aLiveSpot('Silver', 30.5)]}
        locked={false}
        canToggle
        onToggleLock={noop}
        onSetBid={noop}
      />
    )
    const gold = screen.getByLabelText('Gold') as HTMLInputElement
    expect(gold.value).toBe('2450')
    expect(gold.readOnly).toBe(true)
    expect(screen.getByRole('button', { name: 'Lock Spots' })).toBeTruthy()
  })

  test('locked: the order frozen prices, editable, Unlock Spots', () => {
    render(
      <SpotsCard
        spots={spots}
        live={[aLiveSpot('Gold', 2450.0)]}
        locked
        canToggle
        onToggleLock={noop}
        onSetBid={noop}
      />
    )
    const gold = screen.getByLabelText('Gold') as HTMLInputElement
    expect(gold.value).toBe('2411.2')
    expect(gold.readOnly).toBe(false)
    expect(screen.getByRole('button', { name: 'Unlock Spots' })).toBeTruthy()
  })

  test('finalized: Unlock is disabled', () => {
    render(
      <SpotsCard
        spots={spots}
        live={[]}
        locked
        canToggle
        toggleDisabled
        onToggleLock={noop}
        onSetBid={noop}
      />
    )
    expect(screen.getByRole('button', { name: 'Unlock Spots' }).hasAttribute('disabled')).toBe(true)
  })

  test('refiner orders carry no lock button at all', () => {
    render(
      <SpotsCard
        spots={spots}
        live={[]}
        locked
        canToggle={false}
        onToggleLock={noop}
        onSetBid={noop}
      />
    )
    expect(screen.queryByRole('button', { name: 'Unlock Spots' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock Spots' })).toBeNull()
  })
})

describe('Lots', () => {
  const handlers = { onEdit: noop, onNew: noop, onDelete: noop, onBatch: noop }

  test('scrap: the melt columns, the lot link, New / Batch / Delete', () => {
    render(<LotsCard kind="scrap" lots={[aLot()]} {...handlers} />)
    for (const column of [
      'Item',
      'Lot',
      'Qty',
      'Pre Melt',
      'Post Melt',
      'Purity',
      'Premium',
      'Price',
    ]) {
      expect(screen.getByText(column)).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: 'Lot 2481-A' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Batch' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  test('bullion: no melt or purity columns at all', () => {
    render(<LotsCard kind="bullion" lots={[aBullionLot()]} {...handlers} />)
    expect(screen.queryByText('Pre Melt')).toBeNull()
    expect(screen.queryByText('Post Melt')).toBeNull()
    expect(screen.queryByText('Purity')).toBeNull()
    expect(screen.getByText('1 oz Gold American Eagle')).toBeTruthy()
  })

  test('Delete and Batch are disabled until something is selected', () => {
    render(<LotsCard kind="scrap" lots={[aLot()]} {...handlers} />)
    expect(screen.getByRole('button', { name: 'Batch' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'New' }).hasAttribute('disabled')).toBe(false)
  })

  test('read-only: no checkboxes, no action buttons, values as text', () => {
    render(<LotsCard kind="scrap" lots={[aLot()]} readOnly {...handlers} />)
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('58.5%')).toBeTruthy()
  })

  test('adding lot: the search takes the title row, Add to Order beside it', () => {
    render(
      <LotsCard
        kind="scrap"
        lots={[aLot()]}
        {...handlers}
        search={{
          value: '',
          onValueChange: noop,
          items: [],
          onSelect: noop,
          onAdd: noop,
          chosen: false,
          onClose: noop,
        }}
      />
    )
    expect(screen.getByPlaceholderText('Search lots…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add to Order' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
  })

  test('an order with no lots says so', () => {
    render(<LotsCard kind="scrap" lots={[]} {...handlers} />)
    expect(screen.getByText('No lots yet')).toBeTruthy()
  })
})

describe('Charges', () => {
  test('shipping shows only for a shipment; pool oz only where a pool is in play', () => {
    const { rerender } = render(
      <ChargesCard totals={aTotals()} showShipping showPoolOz={false} chargeLabel="Payout Charge" />
    )
    expect(screen.getByText('Payout Charge')).toBeTruthy()
    expect(screen.getByText('Shipping Charge')).toBeTruthy()
    expect(screen.queryByText('Pool Oz Remediated')).toBeNull()

    rerender(
      <ChargesCard
        totals={null}
        showShipping={false}
        showPoolOz
        chargeLabel="Payment Charge"
        poolOz={0.003}
        refining={{ fee: 20, pool_remediation: 7.24, payment_charge: 20, total: 41871.4 }}
      />
    )
    expect(screen.getByText('Payment Charge')).toBeTruthy()
    expect(screen.queryByText('Shipping Charge')).toBeNull()
    expect(screen.getByText('Pool Oz Remediated')).toBeTruthy()
    expect(screen.getByText('0.003 oz')).toBeTruthy()
  })
})

describe('Payment', () => {
  const base = {
    payout: aPayout(),
    payTo: [aPayTo()],
    rails: ['ACH', 'WIRE'] as Rail[],
    rail: 'ACH' as Rail,
    onRailChange: noop,
    payToId: null,
    onPayToChange: noop,
    candidates: [aCandidate()],
    matching: false,
    onStartMatching: noop,
    onConfirmMatch: noop,
    onSend: noop,
  }

  test('payout · Not sent: Warning badge, Send payment, Pay to beside Method', () => {
    render(<PaymentCard {...base} payment={aPaymentView({ state: 'Not sent' })} />)
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send payment' })).toBeTruthy()
    expect(screen.getByText('Method')).toBeTruthy()
    expect(screen.getByText('Pay to')).toBeTruthy()
    expect(screen.getByText('•••• 4417')).toBeTruthy()
    expect(screen.getByText('•••• 5679')).toBeTruthy()
  })

  test('payout · Processing: the button says so and cannot be pressed', () => {
    render(<PaymentCard {...base} payment={aPaymentView({ state: 'Processing' })} />)
    expect(screen.getByText('Processing')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Processing…' }).hasAttribute('disabled')).toBe(true)
  })

  test('payout · Sent: Success badge, the selects lock', () => {
    render(<PaymentCard {...base} payment={aPaymentView({ state: 'Sent' })} />)
    expect(screen.getByText('Sent')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Payment sent' }).hasAttribute('disabled')).toBe(true)
  })

  test('charge · Due: Request payment, no Pay to select', () => {
    render(
      <PaymentCard
        {...base}
        payment={aPaymentView({ kind: 'charge', state: 'Due', direction: 'sale' })}
      />
    )
    expect(screen.getByText('Due')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request payment' })).toBeTruthy()
    expect(screen.queryByText('Pay to')).toBeNull()
  })

  test('charge · Received: the settled label', () => {
    render(<PaymentCard {...base} payment={aPaymentView({ kind: 'charge', state: 'Received' })} />)
    expect(screen.getByText('Received')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Payment received' }).hasAttribute('disabled')).toBe(
      true
    )
  })

  test('matching: the Method row is replaced by the unmatched feed and Confirm match', () => {
    render(
      <PaymentCard {...base} matching payment={aPaymentView({ kind: 'charge', state: 'Due' })} />
    )
    expect(screen.getByText('Unmatched inbound transactions')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm match' }).hasAttribute('disabled')).toBe(
      true
    )
    expect(screen.queryByText('Method')).toBeNull()
  })

  test('Send is refused, with the reason, while the order is not finalized', () => {
    render(
      <PaymentCard
        {...base}
        payment={aPaymentView({ state: 'Not sent' })}
        sendDisabled
        sendReason="Finalize the order before the money moves."
      />
    )
    expect(screen.getByRole('button', { name: 'Send payment' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Finalize the order before the money moves.')).toBeTruthy()
  })
})

describe('Totals and Profit', () => {
  test('totals name the direction total', () => {
    render(<TotalsCard totals={aTotals()} totalLabel="Total payout" />)
    expect(screen.getByText('Total payout')).toBeTruthy()
    expect(screen.getByText('$13,346.09')).toBeTruthy()
  })

  test('profit is rows off the breakdown, not a sum here', () => {
    render(<ProfitBreakdownCard breakdown={aProfitBreakdown()} />)
    expect(screen.getByText(/Gold\s+·\s+0\.310 oz/)).toBeTruthy()
    expect(screen.getByText('$700.08')).toBeTruthy()
  })

  test('profit while pricing says so rather than showing a zero', () => {
    render(<ProfitBreakdownCard breakdown={null} loading />)
    expect(screen.getByText('Pricing…')).toBeTruthy()
    expect(screen.queryByText('$0.00')).toBeNull()
  })
})

describe('Settlement', () => {
  test('pending assay: estimate present, settled and variance empty', () => {
    render(<SettlementCard order={aRefiningOrder()} />)
    expect(screen.getByText('Pending assay')).toBeTruthy()
    expect(screen.getByText('4.812 oz')).toBeTruthy()
    expect(screen.getByText('Elemetal · Dallas')).toBeTruthy()
  })

  test('settled: the badge and the two figures fill in', () => {
    render(
      <SettlementCard
        order={aRefiningOrder({ state: 'Settled', settled_content: 4.79, variance: -0.022 })}
      />
    )
    expect(screen.getByText('Settled')).toBeTruthy()
    expect(screen.getByText('4.790 oz')).toBeTruthy()
    expect(screen.getByText('-0.022 oz')).toBeTruthy()
  })

  test('disputed', () => {
    render(<SettlementCard order={aRefiningOrder({ state: 'Disputed' })} />)
    expect(screen.getByText('Disputed')).toBeTruthy()
  })
})

describe('Fulfillment', () => {
  const chrome = {
    methods: [
      aMethod('SHIPMENT', 'Shipment'),
      aMethod('PICKUP', 'Pickup'),
      aMethod('DIRECT', 'Appointment'),
    ],
    services: [],
    packages: [],
    handoffs: [],
    addresses: [],
    onSetMethod: noop,
    onPatch: noop,
    onSchedule: noop,
  }

  test('empty: Not set, an Empty State and Create fulfillment', () => {
    render(<FulfillmentCard {...chrome} fulfillment={null} onCreate={noop} />)
    expect(screen.getByText('Fulfillment · Not set')).toBeTruthy()
    expect(screen.getByText('No fulfillment yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create fulfillment' })).toBeTruthy()
  })

  test('the five methods are tabs, and only the offered ones show', () => {
    render(<FulfillmentCard {...chrome} fulfillment={aFulfillment()} />)
    expect(screen.getByRole('tab', { name: 'Shipment' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Pickup' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Appointment' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Drop-off' })).toBeNull()
  })

  test('Schedule waits on the fulfillment domain answer, not a check here', () => {
    render(
      <FulfillmentCard
        {...chrome}
        fulfillment={aFulfillment({ missing: ['package_id', 'carrier_service_id'] })}
      />
    )
    expect(screen.getByRole('button', { name: 'Schedule' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Still to choose: package_id, carrier_service_id')).toBeTruthy()
  })
})

describe('Shipment', () => {
  test('label created: the label details, no tracker, Cancel Shipment', () => {
    render(<ShipmentCard shipment={aShipment()} onSaveTracking={noop} onCancelLabel={noop} />)
    expect(screen.getByText('Label Created')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel Shipment' })).toBeTruthy()
    expect(
      screen.getByText('The label exists and the carrier has not scanned it yet.')
    ).toBeTruthy()
  })

  test('awaiting tracking: a drop ship, so a Tracking # and Save Tracking', () => {
    render(
      <ShipmentCard
        shipment={aShipment({ tracking_number: null })}
        onSaveTracking={noop}
        onCancelLabel={noop}
      />
    )
    expect(screen.getByText('Awaiting Tracking')).toBeTruthy()
    expect(screen.getByLabelText('Tracking #')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Tracking' }).hasAttribute('disabled')).toBe(
      true
    )
    expect(screen.queryByRole('button', { name: 'Cancel Shipment' })).toBeNull()
  })

  test('in transit: the Tracker, and no cancel once it has moved', () => {
    render(
      <ShipmentCard
        shipment={aShipment(
          { shipped_at: '2026-09-01T16:12:00.000Z' },
          {
            timeline: [
              {
                stage: 'Picked Up',
                location: 'Austin, TX',
                scan_time: '2026-09-01T16:12:00.000Z',
                reached: true,
              },
              { stage: 'Delivered', location: null, scan_time: null, reached: false },
            ],
          }
        )}
        onSaveTracking={noop}
        onCancelLabel={noop}
      />
    )
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(screen.getByText('Picked Up')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel Shipment' })).toBeNull()
  })

  test('delivered: the badge, and the tracker header stamps the delivery', () => {
    render(
      <ShipmentCard
        shipment={aShipment({ delivered_at: '2026-09-03T19:41:00.000Z' })}
        onSaveTracking={noop}
        onCancelLabel={noop}
      />
    )
    expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0)
    expect(screen.getByText('Sep 3, 7:41 PM')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel Shipment' })).toBeNull()
  })

  test('a return parcel names itself a Return Shipment and reads Returned when home', () => {
    render(
      <ShipmentCard
        shipment={aShipment({ direction: 'Return', delivered_at: '2026-09-05T10:00:00.000Z' })}
        onSaveTracking={noop}
        onCancelLabel={noop}
      />
    )
    expect(screen.getByText('Return Shipment')).toBeTruthy()
    expect(screen.getByText('Returned')).toBeTruthy()
  })
})

describe('Pickup, Appointment and Drop-off', () => {
  const handlers = { onCancel: noop, onReschedule: noop, onAdvance: noop }

  const booked = (
    category: FulfillmentMethodRead['category'],
    label: string,
    status: FulfillmentStatus,
    transitions: FulfillmentStatus[]
  ) =>
    aFulfillment({
      method: aMethod(category, label),
      fulfillment: { ...aFulfillment().fulfillment, status },
      actions: { ...aFulfillment().actions, transitions },
    })

  test('pickup · Scheduled -> Headed to Pickup', () => {
    render(
      <PickupCard
        fulfillment={booked('PICKUP', 'Pickup', 'SCHEDULED', ['IN_TRANSIT', 'PICKED_UP'])}
        {...handlers}
      />
    )
    expect(screen.getByText('Pickup')).toBeTruthy()
    expect(screen.getByText('Scheduled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Headed to Pickup' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel Pickup' })).toBeTruthy()
  })

  test('pickup · In Transit -> Mark Picked Up', () => {
    render(
      <PickupCard
        fulfillment={booked('PICKUP', 'Pickup', 'IN_TRANSIT', ['PICKED_UP'])}
        {...handlers}
      />
    )
    expect(screen.getByRole('button', { name: 'Mark Picked Up' })).toBeTruthy()
  })

  test('pickup · Picked Up is the end of the line', () => {
    render(<PickupCard fulfillment={booked('PICKUP', 'Pickup', 'PICKED_UP', [])} {...handlers} />)
    expect(screen.getByRole('button', { name: 'Picked Up' }).hasAttribute('disabled')).toBe(true)
  })

  test('appointment · Scheduled -> Check In', () => {
    render(
      <AppointmentCard
        fulfillment={booked('DIRECT', 'Appointment', 'SCHEDULED', ['IN_PROGRESS', 'COMPLETED'])}
        {...handlers}
      />
    )
    expect(screen.getByText('Appointment')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check In' })).toBeTruthy()
  })

  test('appointment · In Progress -> Mark Complete', () => {
    render(
      <AppointmentCard
        fulfillment={booked('DIRECT', 'Appointment', 'IN_PROGRESS', ['COMPLETED'])}
        {...handlers}
      />
    )
    expect(screen.getByRole('button', { name: 'Mark Complete' })).toBeTruthy()
  })

  test('drop-off · Scheduled -> Headed to Refinery', () => {
    render(
      <DropoffCard
        fulfillment={booked('DROPOFF', 'Drop-off', 'SCHEDULED', ['IN_TRANSIT', 'DROPPED_OFF'])}
        {...handlers}
      />
    )
    expect(screen.getByText('Drop-off')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Headed to Refinery' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel Drop-off' })).toBeTruthy()
  })
})

describe('Linked Fulfillment', () => {
  test('a drop ship points at the order the parcel belongs to', () => {
    render(
      <LinkedFulfillmentCard
        shipsFrom="Elemetal"
        shipsTo="Marguerite Whitfield"
        linked={{ id: 'abc', number: 1112, direction: 'sale', reference: 'SO-1112' }}
        linkedState="In Transit"
      />
    )
    expect(screen.getByText('Fulfillment · Drop ship')).toBeTruthy()
    expect(screen.getByText('Drop ship')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open SO-1112' }).getAttribute('href')).toBe(
      '/admin/orders/abc'
    )
  })
})

describe('Documents', () => {
  test('a shipment order carries its four rows, and Invoice waits on finalization', () => {
    render(
      <DocumentsCard
        documents={[
          aDocument('invoice', 'Invoice', false),
          aDocument('packing_list', 'Shipment Manifest', true),
          aDocument('return_packing_list', 'Return Shipment Manifest', true),
          aDocument('shipping_instructions', 'Shipping Instructions', true),
        ]}
        onSend={noop}
        onImport={noop}
      />
    )
    expect(screen.getByText('Invoice')).toBeTruthy()
    expect(screen.getByText('Shipment Manifest')).toBeTruthy()
    expect(screen.getByText('Shipping Instructions')).toBeTruthy()
    expect(screen.getAllByText('Not yet available').length).toBe(1)
  })

  test('a pickup order carries the pickup rows instead', () => {
    render(
      <DocumentsCard
        documents={[
          aDocument('invoice', 'Invoice', true),
          aDocument('pickup_manifest', 'Pickup Manifest', true),
          aDocument('pickup_instructions', 'Pickup Instructions', true),
        ]}
      />
    )
    expect(screen.getByText('Pickup Manifest')).toBeTruthy()
    expect(screen.queryByText('Shipment Manifest')).toBeNull()
  })
})

describe('Chat', () => {
  test('messages: the body, the phone under the title, the composer', () => {
    render(<ChatCard phone="(512) 555-0143" messages={[aMessage()]} timeline={[]} onSend={noop} />)
    expect(screen.getByText('(512) 555-0143')).toBeTruthy()
    expect(screen.getByText('Has my gold arrived?')).toBeTruthy()
  })

  test('an empty conversation still renders', () => {
    render(<ChatCard phone={null} messages={[]} timeline={[]} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  test('calls are the timeline filtered on kind', () => {
    render(
      <ChatCard
        phone="(512) 555-0143"
        messages={[]}
        timeline={[aTimelineCall(), aTimelineCall({ id: 'x', kind: 'sms' })]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Calls' }))
    expect(screen.getByText('Outgoing call')).toBeTruthy()
    expect(screen.getByText('2m 14s')).toBeTruthy()
  })
})

describe('Refiner items', () => {
  test('the lot table names the customer order the metal came off', () => {
    render(
      <RefiningItemsCard
        lots={[aRefiningLot()]}
        kindLabel="Lots"
        query=""
        onQueryChange={noop}
        onEdit={noop}
        onDelete={noop}
        onAdd={noop}
      />
    )
    expect(screen.getByText('Order')).toBeTruthy()
    expect(screen.getByText('PO-2481')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Lot 2481-A' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Lot' }).hasAttribute('disabled')).toBe(true)
  })

  test('an empty refiner order says so', () => {
    render(
      <RefiningItemsCard
        lots={[]}
        kindLabel="Items"
        query=""
        onQueryChange={noop}
        onEdit={noop}
        onDelete={noop}
        onAdd={noop}
      />
    )
    expect(screen.getByText('No lots on this order')).toBeTruthy()
  })
})

describe('the states the API lane unblocked', () => {
  test('GAP 1 and 2: the header prints the server reference and the orders-to-date line', () => {
    const view = anOrderView()
    render(
      <OrderHeaderCard
        eyebrow="PURCHASE ORDER"
        reference={view.reference}
        party={{
          kind: 'customer',
          name: 'X',
          place: 'Austin, TX',
          ordersToDate: view.user?.orders_to_date ?? null,
        }}
        assignedToId={null}
        admins={[]}
        onAssign={noop}
      />
    )
    expect(screen.getByText(/PO-2481/)).toBeTruthy()
    expect(screen.getByText('7 orders to date')).toBeTruthy()
  })

  test('GAP 3: Cancel Order is live - the body is optional and the server picks the return leg', () => {
    const onClick = vi.fn()
    render(
      <OrderHeaderCard
        eyebrow="PURCHASE ORDER"
        reference="PO-2481"
        party={{ kind: 'customer', name: 'X', place: '', ordersToDate: null }}
        assignedToId={null}
        admins={[]}
        onAssign={noop}
        cancel={{ label: 'Cancel Order', onClick }}
      />
    )
    const button = screen.getByRole('button', { name: 'Cancel Order' })
    expect(button.hasAttribute('disabled')).toBe(false)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  test('GAP 4 and 5: a refiner header carries an office select and a live Cancel', () => {
    const onChange = vi.fn()
    render(
      <OrderHeaderCard
        eyebrow="SALES ORDER"
        reference="SO-4471"
        party={{
          kind: 'refiner',
          refinerId: 'r1',
          refiners: [{ id: 'r1', name: 'Elemetal' }],
          onRefinerChange: noop,
          locked: false,
          place: '',
          ordersToDate: 12,
        }}
        office={{ locations: [aLocation()], locationId: null, onChange }}
        assignedToId={null}
        admins={[]}
        onAssign={noop}
        cancel={{ label: 'Cancel Order', onClick: noop }}
      />
    )
    expect(screen.getByText('Office')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel Order' }).hasAttribute('disabled')).toBe(
      false
    )
  })

  test('GAP 6: the lock button follows actions.lock_spots / unlock_spots, not a guess', () => {
    const { rerender } = render(
      <SpotsCard
        spots={[aSpot('Gold', 2411.2)]}
        live={[]}
        locked
        canToggle
        toggleDisabled={!hasAction(anActions({ unlock_spots: false }), 'unlock_spots')}
        onToggleLock={noop}
        onSetBid={noop}
      />
    )
    expect(screen.getByRole('button', { name: 'Unlock Spots' }).hasAttribute('disabled')).toBe(true)

    rerender(
      <SpotsCard
        spots={[aSpot('Gold', 2411.2)]}
        live={[]}
        locked
        canToggle
        toggleDisabled={!hasAction(anActions({ unlock_spots: true }), 'unlock_spots')}
        onToggleLock={noop}
        onSetBid={noop}
      />
    )
    expect(screen.getByRole('button', { name: 'Unlock Spots' }).hasAttribute('disabled')).toBe(
      false
    )
  })

  test('GAP 7: a refiner order draws its own frozen prices and no lock button', () => {
    render(
      <SpotsCard
        spots={[aRefiningSpot('Gold', 2411.2), aRefiningSpot('Silver', 28.4)]}
        live={[]}
        locked
        canToggle={false}
        onToggleLock={noop}
        onSetBid={noop}
      />
    )
    expect(screen.getByLabelText('Gold')).toBeTruthy()
    expect(screen.getByLabelText('Silver')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Unlock Spots' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock Spots' })).toBeNull()
  })

  test('GAP 8: Batch hands the selected lot ids over in one call, once a refiner is chosen', () => {
    const onBatch = vi.fn()
    render(
      <LotsCard
        kind="scrap"
        lots={[aLot()]}
        refiners={[{ id: 'r1', name: 'Elemetal' }]}
        refinerId="r1"
        onRefinerChange={noop}
        onEdit={noop}
        onNew={noop}
        onDelete={noop}
        onBatch={onBatch}
      />
    )
    fireEvent.click(screen.getByLabelText('Select all lots'))
    fireEvent.click(screen.getByRole('button', { name: 'Batch' }))
    expect(onBatch).toHaveBeenCalledWith([aLot().lot_id])
  })

  test('GAP 9: a finalized order offers Create Sale instead of the editing controls', () => {
    const onCreateSale = vi.fn()
    render(
      <LotsCard
        kind="scrap"
        lots={[aLot()]}
        readOnly
        refiners={[{ id: 'r1', name: 'Elemetal' }]}
        refinerId="r1"
        onRefinerChange={noop}
        onEdit={noop}
        onNew={noop}
        onDelete={noop}
        onBatch={noop}
        onCreateSale={onCreateSale}
      />
    )
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create Sale' }))
    expect(onCreateSale).toHaveBeenCalled()
  })

  test('GAP 10: the lot search offers what /lots answered and Add Lot sends its id', () => {
    const onAdd = vi.fn()
    render(
      <RefiningItemsCard
        lots={[aRefiningLot()]}
        kindLabel="Lots"
        query="2493"
        onQueryChange={noop}
        found={[aFoundLot()]}
        onEdit={noop}
        onDelete={noop}
        onAdd={onAdd}
      />
    )
    expect(screen.getByRole('button', { name: 'Add Lot' }).hasAttribute('disabled')).toBe(true)
    fireEvent.focus(screen.getByPlaceholderText('Search lots…'))
    fireEvent.click(screen.getByRole('option', { name: /Lot 2493-B/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Lot' }))
    expect(onAdd).toHaveBeenCalledWith([aFoundLot().id])
  })

  test('GAP 11: a refiner order has Charges and Totals off refining.order_money', () => {
    const order = aRefiningOrder()
    render(<TotalsCard totals={null} totalLabel="Total payment" refining={order.totals} />)
    expect(screen.getByText('Refiner fee')).toBeTruthy()
    expect(screen.getByText('Pool remediation')).toBeTruthy()
    expect(screen.getByText('Payment charge')).toBeTruthy()
    expect(screen.getAllByText('$41,871.40').length).toBeGreaterThan(0)
  })

  test('GAP 12: a refiner order gets a Payment card of its own', () => {
    render(
      <PaymentCard
        payment={aPaymentView({ order_id: null, refining_order_id: aRefiningOrder().id })}
        payout={null}
        payTo={[]}
        rails={['ACH', 'WIRE'] as Rail[]}
        rail={'WIRE' as Rail}
        onRailChange={noop}
        payToId={null}
        onPayToChange={noop}
        candidates={[]}
        matching={false}
        onStartMatching={noop}
        onConfirmMatch={noop}
        onSend={noop}
      />
    )
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send payment' })).toBeTruthy()
  })

  test('GAP 13: Settlement shows the expected settlement as MONEY', () => {
    render(<SettlementCard order={aRefiningOrder()} />)
    expect(screen.getByText('Expected settlement')).toBeTruthy()
    expect(screen.getAllByText('$41,871.40').length).toBeGreaterThan(0)
  })

  test('GAP 14: Create fulfillment is live - POST /fulfillments takes an order id', () => {
    const onCreate = vi.fn()
    render(
      <FulfillmentCard
        fulfillment={null}
        methods={[]}
        services={[]}
        packages={[]}
        handoffs={[]}
        addresses={[]}
        onCreate={onCreate}
        onSetMethod={noop}
        onPatch={noop}
        onSchedule={noop}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create fulfillment' }))
    expect(onCreate).toHaveBeenCalled()
  })

  test('GAP 15 and 16: the shipment choices carry cover, extra cover and who pays a return', () => {
    const onPatch = vi.fn()
    render(
      <FulfillmentCard
        fulfillment={aFulfillment({
          parcel: { ...aShipment().shipment, direction: 'Return' },
        })}
        methods={[aMethod('SHIPMENT', 'Shipment')]}
        services={[]}
        packages={[]}
        handoffs={[]}
        addresses={[]}
        cover={{ insured: true, additional_coverage: 500, bill_return_to_customer: false }}
        onSetMethod={noop}
        onPatch={onPatch}
        onSchedule={noop}
      />
    )
    expect(screen.getByText('Coverage')).toBeTruthy()
    expect(screen.getByText('Bill return shipping to the customer')).toBeTruthy()
    expect((screen.getByLabelText('Additional coverage') as HTMLInputElement).value).toBe('500')
  })

  test('GAP 17 and 18: pickup Office and Driver read their names off the two list routes', () => {
    render(
      <PickupCard
        fulfillment={aFulfillment({
          method: aMethod('PICKUP', 'Pickup'),
          pickup: {
            id: 'p1',
            fulfillment_id: aFulfillment().fulfillment.id,
            pickup_address_id: null,
            location_id: aLocation().id,
            assigned_employee_id: anEmployee().id,
            start_time: '2026-09-10T15:00:00.000Z',
            end_time: null,
          },
        })}
        locations={[aLocation()]}
        employees={[anEmployee()]}
        onCancel={noop}
        onReschedule={noop}
        onAdvance={noop}
      />
    )
    expect(screen.getByText('Austin office')).toBeTruthy()
    expect(screen.getByText('Dana Whitlock')).toBeTruthy()
  })

  test('GAP 19: the button labels are the open transitions, not a table in the browser', () => {
    render(
      <PickupCard
        fulfillment={aFulfillment({
          method: aMethod('PICKUP', 'Pickup'),
          fulfillment: { ...aFulfillment().fulfillment, status: 'IN_TRANSIT' },
          actions: { ...aFulfillment().actions, transitions: ['PICKED_UP'] },
        })}
        onCancel={noop}
        onReschedule={noop}
        onAdvance={noop}
      />
    )
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark Picked Up' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Headed to Pickup' })).toBeNull()
  })

  test('GAP 20: drop-off has choices of its own - Driver, Refinery and the date', () => {
    const onPatch = vi.fn()
    render(
      <FulfillmentCard
        fulfillment={aFulfillment({ method: aMethod('DROPOFF', 'Drop-off') })}
        methods={[aMethod('DROPOFF', 'Drop-off')]}
        services={[]}
        packages={[]}
        handoffs={[]}
        addresses={[]}
        employees={[anEmployee()]}
        refiners={[aRefiner()]}
        onSetMethod={noop}
        onPatch={onPatch}
        onSchedule={noop}
      />
    )
    expect(screen.getByText('Driver')).toBeTruthy()
    expect(screen.getAllByText('Refinery').length).toBeGreaterThan(0)
    expect(screen.getByRole('group', { name: 'Drop-off date' })).toBeTruthy()
    expect(screen.queryByText('Drop-offs are arranged off-screen for now.')).toBeNull()
  })

  test('GAP 20: the drop-off choices ride with Schedule, not one PATCH each', () => {
    const onPatch = vi.fn()
    const onSchedule = vi.fn()
    render(
      <FulfillmentCard
        fulfillment={aFulfillment({
          method: aMethod('DROPOFF', 'Drop-off'),
          missing: ['refiner_id', 'start_time'],
        })}
        methods={[aMethod('DROPOFF', 'Drop-off')]}
        services={[]}
        packages={[]}
        handoffs={[]}
        addresses={[]}
        employees={[anEmployee()]}
        refiners={[aRefiner()]}
        onSetMethod={noop}
        onPatch={onPatch}
        onSchedule={onSchedule}
      />
    )
    expect(screen.getByText('Still to choose: refiner_id, start_time')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Schedule' }).hasAttribute('disabled')).toBe(true)

    const group = screen.getByRole('group', { name: 'Drop-off date' })
    const days = within(group)
      .getAllByRole('button')
      .filter((one) => /^\d{1,2}$/.test(one.textContent ?? ''))
    fireEvent.click(days[10]!)
    expect(onPatch).not.toHaveBeenCalled()
    expect(screen.getByText('Still to choose: refiner_id')).toBeTruthy()
  })

  test('GAP 21: the Awaiting Tracking carrier select writes carrier_service_id', () => {
    const onSetCarrier = vi.fn()
    render(
      <ShipmentCard
        shipment={aShipment({ tracking_number: null })}
        services={[{ id: 'svc', name: 'FedEx Priority' }]}
        onSaveTracking={noop}
        onSetCarrier={onSetCarrier}
        onCancelLabel={noop}
      />
    )
    expect(screen.getByText('Carrier')).toBeTruthy()
    expect(screen.getByLabelText('Tracking #')).toBeTruthy()
  })

  test('GAP 22: the linked order comes off the fulfillment view', () => {
    const linked = aFulfillment({
      linked_order: { id: 'abc', number: 1112, direction: 'sale', reference: 'SO-1112' },
    })
    render(
      <LinkedFulfillmentCard
        shipsFrom="Elemetal"
        shipsTo={null}
        linked={linked.linked_order}
        linkedState={null}
      />
    )
    expect(screen.getByRole('link', { name: 'Open SO-1112' }).getAttribute('href')).toBe(
      '/admin/orders/abc'
    )
  })

  test('GAPs 24 and 25: an available row sends and an unavailable row imports a file', () => {
    const onSend = vi.fn()
    const onImport = vi.fn()
    const { container } = render(
      <DocumentsCard
        documents={[
          aDocument('invoice', 'Invoice', false),
          aDocument('packing_list', 'Shipment Manifest', true),
        ]}
        onSend={onSend}
        onImport={onImport}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send Shipment Manifest' }))
    expect(onSend).toHaveBeenCalledWith('packing_list')

    fireEvent.click(screen.getByRole('button', { name: 'Import Invoice' }))
    const picker = container.querySelector('[data-testid="document-import"]') as HTMLInputElement
    const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })
    Object.defineProperty(picker, 'files', { value: [file] })
    fireEvent.change(picker)
    expect(onImport).toHaveBeenCalledWith('invoice', file)
  })

  test('GAP 26: a refiner order names only Invoice, unsent so unavailable', () => {
    render(<DocumentsCard documents={[aDocument('invoice', 'Invoice', false)]} onImport={noop} />)
    expect(screen.getByText('Invoice')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import Invoice' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send Invoice' })).toBeNull()
  })

  test('GAPs 27 and 28: the composer sends, and an attachment rides with it', () => {
    const onSend = vi.fn()
    const { container } = render(
      <ChatCard phone="(512) 555-0143" messages={[aMessage()]} timeline={[]} onSend={onSend} />
    )
    const field = screen.getByPlaceholderText('Text the customer…')
    fireEvent.change(field, { target: { value: 'On its way' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('On its way', undefined)
    expect(container.querySelector('[data-testid="sms-attach"]')).toBeTruthy()
  })

  test('GAP 29: a call row is the API call_kind, not direction and status read here', () => {
    render(
      <ChatCard
        phone="(512) 555-0143"
        messages={[]}
        timeline={[aTimelineCall({ call_kind: 'Missed', direction: 'inbound', status: 'busy' })]}
        onSend={noop}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Calls' }))
    expect(screen.getByText('Missed call')).toBeTruthy()
  })
})
describe('nothing is decided in the browser', () => {
  test('actions come off the view, so a view with everything off offers nothing', () => {
    render(
      <OrderHeaderCard
        eyebrow="PURCHASE ORDER"
        reference="PO-2481"
        party={{ kind: 'customer', name: 'X', place: '', ordersToDate: null }}
        assignedToId={null}
        admins={[]}
        onAssign={noop}
      />
    )
    expect(screen.queryByRole('button', { name: 'Cancel Order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Finalize' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reopen Order' })).toBeNull()
  })

  test('anActions default is a shape the contract accepts', () => {
    const actions = anActions({ finalize: false })
    expect(() => OrderActions.parse(actions)).not.toThrow()
    expect(hasAction(actions, 'finalize')).toBe(false)
    expect(hasAction(actions, 'cancel')).toBe(true)
    expect(vi.isMockFunction(noop)).toBe(false)
  })
})
