import { test, expect } from 'vitest'
import assert from 'node:assert/strict'

import * as signInCode from '#documents/emails/templates/sign-in-code.ts'
import * as accountCreated from '#documents/emails/templates/account-created.ts'
import * as detailsChanged from '#documents/emails/templates/details-changed.ts'
import * as orderReceived from '#documents/emails/templates/order-received.ts'
import * as payoutSent from '#documents/emails/templates/payout-sent.ts'
import * as shipmentSent from '#documents/emails/templates/shipment-sent.ts'
import * as shipmentReceived from '#documents/emails/templates/shipment-received.ts'
import * as pickupBooked from '#documents/emails/templates/pickup-booked.ts'
import * as pickupComplete from '#documents/emails/templates/pickup-complete.ts'
import * as appointmentBooked from '#documents/emails/templates/appointment-booked.ts'
import * as appointmentTomorrow from '#documents/emails/templates/appointment-tomorrow.ts'
import * as documentSent from '#documents/emails/templates/document-sent.ts'
import * as promo from '#documents/emails/templates/promo.ts'
import { detailsChangedRows } from '#documents/emails/rules.ts'
import { maskEmail, maskPhone } from '#shared/text/mask.ts'
import type { MailerRow } from '@dorado/contracts'

process.env.FRONTEND_URL ??= 'https://example.test'

const to = { order_id: null, user_id: null, email: 'j.johnson@gmail.com', name: 'Jacob' }
const onOrder = { ...to, order_id: '00000000-0000-4000-8000-000000000001', order_number: 4821 }

const rows: MailerRow[] = [
  { label: 'Gold, 14K', value: '182.4 g' },
  { label: 'Silver, sterling', value: '1,204.0 g' },
  { label: 'Declared value', value: '$10,000' },
]

function isClean(html: string, what: string): void {
  assert.ok(html.length > 1000, `${what} produced no document`)
  for (const rot of ['undefined', 'NaN', '>null<', '$null', 'null,', '[object Object]']) {
    assert.ok(!html.includes(rot), `${what} printed "${rot}"`)
  }
  assert.ok(!/\[[A-Z_ ]+\]/.test(html), `${what} left a template placeholder unfilled`)
}

function wearsTheShell(html: string, what: string): void {
  assert.ok(html.includes('width="600"'), `${what} is not 600 wide`)
  assert.ok(html.includes('#09090c'), `${what} lost the dark ground`)
  assert.ok(html.includes('doradometals.com/icons/branding'), `${what} has no logo`)
  assert.ok(html.includes('3198 Royal Lane'), `${what} has no postal address`)
  assert.ok(html.includes('Unsubscribe'), `${what} has no unsubscribe`)
  assert.ok(!/display:\s*(flex|grid)/.test(html), `${what} uses a layout Outlook cannot render`)
  assert.ok(!html.includes('<link'), `${what} pulls in a stylesheet a client will strip`)
  const hairlines = html.match(/background-color:#2c2f35/g) ?? []
  assert.ok(hairlines.length >= 2, `${what} is missing the header or footer hairline`)
}

test('the sign-in code mailer prints the code as text and the design its copy', () => {
  const html = signInCode.render({ ...to, code: '418 209', expires_in_minutes: 10 })
  isClean(html, 'sign-in code')
  wearsTheShell(html, 'sign-in code')
  assert.ok(html.includes('Your sign-in code'), 'the heading is missing')
  assert.ok(html.includes('Security'), 'the eyebrow is missing')
  assert.ok(html.includes('418 209'), 'THE CODE IS MISSING - the mailer has no purpose without it')
  assert.ok(html.includes('This code expires in 10 minutes.'), 'the expiry line is missing')
  assert.ok(
    html.includes('nobody can reach your account without it'),
    'the reassurance line is missing'
  )
  assert.ok(!/<img[^>]*418/.test(html), 'the code rendered as an image and would be blocked')
})

test('the account created mailer carries its sign-in link', () => {
  const html = accountCreated.render({ ...to, url: 'https://example.test/verify-login?token=t' })
  isClean(html, 'account created')
  wearsTheShell(html, 'account created')
  assert.ok(html.includes('Welcome to Dorado Metals Exchange'), 'the heading is missing')
  assert.ok(
    html.includes('there&#x27;s no password to remember') ||
      html.includes("there's no password to remember"),
    'the lede is missing'
  )
  assert.ok(html.includes('Finish signing in'), 'the button label is missing')
  assert.ok(html.includes('verify-login?token=t'), 'the link is missing')
})

test('the details changed mailer masks both addresses and prints neither in full', () => {
  const previous = 'j.johnson@gmail.com'
  const next = 'jacob@doradometals.com'
  const html = detailsChanged.render({
    ...to,
    changed: 'Email address',
    changed_at: 'Sep 3 at 4:18 PM CT',
    rows: detailsChangedRows('Email address', previous, next),
  })
  isClean(html, 'details changed')
  wearsTheShell(html, 'details changed')
  assert.ok(html.includes('Your sign-in details changed'), 'the heading is missing')
  assert.ok(html.includes('Sep 3 at 4:18 PM CT'), 'the moment is missing')
  assert.ok(html.includes('This wasn&#x27;t me') || html.includes("This wasn't me"), 'no button')
  assert.ok(html.includes(maskEmail(previous)), 'the previous address is not shown masked')
  assert.ok(html.includes(maskEmail(next)), 'the new address is not shown masked')
  assert.ok(!html.includes(previous), 'THE RAW PREVIOUS ADDRESS REACHED THE PAGE')
  assert.ok(!html.includes(next), 'THE RAW NEW ADDRESS REACHED THE PAGE')
})

test('a phone change is masked as a phone number, not as an email', () => {
  const rows = detailsChangedRows('Phone number', '+1 214 555 0134', null)
  assert.equal(rows[1].value, '(•••) •••-0134')
  assert.equal(maskPhone('2145550134'), '(•••) •••-0134')
  assert.equal(maskEmail('j.johnson@gmail.com'), 'j•••@gmail.com')
})

test('order received is direction-aware and says the same heading either way', () => {
  const sell = orderReceived.render({ ...onOrder, direction: 'purchase', rows })
  const buy = orderReceived.render({ ...onOrder, direction: 'sale', rows })
  for (const [html, what] of [
    [sell, 'order received (purchase)'],
    [buy, 'order received (sale)'],
  ] as const) {
    isClean(html, what)
    wearsTheShell(html, what)
    assert.ok(html.includes('We&#x27;ve got your order') || html.includes("We've got your order"))
    assert.ok(html.includes('Gold, 14K'), `${what} lost a card row`)
    assert.ok(html.includes('182.4 g'), `${what} lost a card figure`)
    assert.ok(html.includes('Track this order'), `${what} lost its button`)
  }
  assert.ok(sell.includes('prepaid label and a packing list'), 'the seller lede is missing')
  assert.ok(buy.includes('preparing your order for shipment'), 'the buyer lede is missing')
  assert.ok(sell.includes('PO - 004821'), 'the purchase number is not formatted')
  assert.ok(buy.includes('SO - 004821'), 'the sale number is not formatted')
})

test('payout sent names the rail and the last four, and never more of the account', () => {
  const html = payoutSent.render({
    ...onOrder,
    method: 'ACH',
    account_last4: '6789',
    amount: '$12,480.36',
    rows: [
      { label: 'Metal value', value: '$12,730.36' },
      { label: 'Fees', value: '-$250.00' },
      { label: 'Paid', value: '$12,480.36' },
    ],
  })
  isClean(html, 'payout sent')
  wearsTheShell(html, 'payout sent')
  assert.ok(html.includes('Your payout is on its way'), 'the heading is missing')
  assert.ok(html.includes('Sent by ACH to the account ending 6789'), 'the route line is missing')
  assert.ok(html.includes('Amount sent'), 'the stat label is missing')
  assert.ok(html.includes('$12,480.36'), 'the figure is missing')
  assert.ok(html.includes('View your invoice'), 'the button is missing')
})

test('a payout to the balance says so instead of inventing a bank', () => {
  const html = payoutSent.render({
    ...onOrder,
    method: null,
    account_last4: null,
    amount: '$50.00',
    rows: [],
  })
  isClean(html, 'payout sent (balance)')
  assert.ok(html.includes('Added to your Dorado balance'), 'the balance wording is missing')
  assert.ok(!html.includes('ACH'), 'a balance credit claimed to be a bank transfer')
  assert.ok(!html.includes('account ending'), 'a balance credit named an account')
})

test('the shipment mailers carry the carrier facts and a tracking link', () => {
  const sent = shipmentSent.render({
    ...onOrder,
    direction: 'purchase',
    tracking_number: '771288904413',
    rows: [
      { label: 'Carrier', value: 'FedEx Express Saver' },
      { label: 'Tracking', value: '771288904413' },
      { label: 'Expected arrival', value: 'Thu, Sep 11' },
    ],
  })
  isClean(sent, 'shipment sent')
  wearsTheShell(sent, 'shipment sent')
  assert.ok(sent.includes('Your metals are on the move'), 'the heading is missing')
  assert.ok(sent.includes('fedex.com/fedextrack/?trknbr=771288904413'), 'no tracking link')
  assert.ok(sent.includes('Track this shipment'), 'the button label is missing')

  const arrived = shipmentReceived.render({
    ...onOrder,
    direction: 'purchase',
    tracking_number: null,
    rows: [
      { label: 'Received', value: 'Sep 11, 9:42 AM CT' },
      { label: 'Parcels', value: '1 of 1' },
      { label: 'Next step', value: 'Weighing and testing' },
    ],
  })
  isClean(arrived, 'shipment received')
  wearsTheShell(arrived, 'shipment received')
  assert.ok(arrived.includes('Your metals arrived'), 'the heading is missing')
  assert.ok(arrived.includes('checked in'), 'the lede is missing')
  assert.ok(arrived.includes('Weighing and testing'), 'the next-step row is missing')
})

test('the pickup mailers print the window and what happened', () => {
  const booked = pickupBooked.render({
    ...onOrder,
    direction: 'purchase',
    starts_at: '2026-09-09T18:00:00.000Z',
    venue: null,
    rows: [
      { label: 'Window', value: 'Tue, Sep 9 - 1:00 PM to 3:00 PM' },
      { label: 'Address', value: '412 Oak Hollow Dr, Austin, TX' },
      { label: 'Driver', value: 'Marcus Lee' },
    ],
  })
  isClean(booked, 'pickup booked')
  wearsTheShell(booked, 'pickup booked')
  assert.ok(booked.includes('Your pickup is booked'), 'the heading is missing')
  assert.ok(booked.includes('Nothing needs wrapping or boxing'), 'the lede is missing')
  assert.ok(booked.includes('412 Oak Hollow Dr, Austin, TX'), 'the address row is missing')

  const done = pickupComplete.render({
    ...onOrder,
    direction: 'purchase',
    starts_at: null,
    venue: null,
    rows: [{ label: 'Collected', value: 'Sep 9, 1:42 PM CT' }],
  })
  isClean(done, 'pickup complete')
  assert.ok(done.includes('We have your metals'), 'the heading is missing')
  assert.ok(done.includes('Sep 9, 1:42 PM CT'), 'the collected row is missing')
})

test('the appointment mailers link to a real calendar and to real directions', () => {
  const booked = appointmentBooked.render({
    ...onOrder,
    direction: 'purchase',
    starts_at: '2026-09-09T15:30:00.000Z',
    venue: 'Keller, 1255 Stanhope Ct',
    rows: [
      { label: 'When', value: 'Tue, Sep 9 - 10:30 AM' },
      { label: 'Office', value: 'Keller - 1255 Stanhope Ct' },
      { label: 'With', value: 'Dana Whitlock' },
    ],
  })
  isClean(booked, 'appointment booked')
  wearsTheShell(booked, 'appointment booked')
  assert.ok(booked.includes('You&#x27;re booked') || booked.includes("You're booked"))
  assert.ok(booked.includes('Bring your items and a photo ID'), 'the lede is missing')
  assert.ok(booked.includes('Add to calendar'), 'the button label is missing')
  assert.ok(
    booked.includes('calendar.google.com/calendar/render') && booked.includes('20260909T153000Z'),
    'the calendar link does not carry the booking'
  )

  const soon = appointmentTomorrow.render({
    ...onOrder,
    direction: 'purchase',
    starts_at: '2026-09-09T15:30:00.000Z',
    venue: 'Keller, 1255 Stanhope Ct',
    rows: [{ label: 'Bring', value: 'Your items and a photo ID' }],
  })
  isClean(soon, 'appointment tomorrow')
  assert.ok(soon.includes('See you tomorrow'), 'the heading is missing')
  assert.ok(soon.includes('parking is free at the door'), 'the lede is missing')
  assert.ok(soon.includes('Get directions'), 'the button label is missing')
  assert.ok(soon.includes('google.com/maps/search'), 'the directions link is missing')
  assert.ok(soon.includes('Stanhope'), 'the directions link points at the wrong office')
})

test('a booking with no start still renders, and its calendar button falls back', () => {
  const html = appointmentBooked.render({
    ...onOrder,
    direction: 'purchase',
    starts_at: null,
    venue: null,
    rows: [{ label: 'When', value: 'To be confirmed' }],
  })
  isClean(html, 'appointment booked (unscheduled)')
  assert.ok(!html.includes('calendar.google.com'), 'a calendar link was built from no date')
  assert.ok(html.includes('/orders'), 'the button leads nowhere')
})

test('the document mailer names the document it carries', () => {
  const packing = documentSent.render({
    ...onOrder,
    direction: 'purchase',
    document_label: 'Packing List',
    rows: [
      { label: 'Document', value: 'Packing List' },
      { label: 'Format', value: 'PDF - 31 KB' },
      { label: 'Sent', value: 'Sep 5, 2026 - 9:14 AM CT' },
    ],
  })
  isClean(packing, 'document sent')
  wearsTheShell(packing, 'document sent')
  assert.ok(packing.includes('Your packing list is ready'), 'the heading is missing')
  assert.ok(packing.includes('put it inside the box'), 'the packing-list instruction is missing')
  assert.ok(packing.includes('Open document'), 'the button label is missing')

  const invoice = documentSent.render({
    ...onOrder,
    direction: 'purchase',
    document_label: 'Invoice',
    rows: [{ label: 'Document', value: 'Invoice' }],
  })
  isClean(invoice, 'document sent (invoice)')
  assert.ok(invoice.includes('Your invoice is ready'), 'the heading is missing')
  assert.ok(!invoice.includes('put it inside the box'), 'an invoice was called a packing list')
})

test('the promo template renders and keeps its disclaimer', () => {
  const html = promo.render({
    ...to,
    eyebrow: 'Market update',
    headline: 'Gold is up since your last order',
    lede: 'You last sold with us in March.',
    stat_label: 'Gold spot, per oz',
    stat_value: '$3,412.80',
    rows: [{ label: 'Gold, 24K', value: '+8.4% since March' }],
    url: 'https://example.test/sell',
  })
  isClean(html, 'promo')
  wearsTheShell(html, 'promo')
  assert.ok(html.includes('Gold is up since your last order'), 'the headline is missing')
  assert.ok(html.includes('$3,412.80'), 'the figure is missing')
  assert.ok(html.includes('Figures are indicative'), 'THE DISCLAIMER IS MISSING')
})

test('an empty card renders no box at all rather than an empty one', () => {
  const html = orderReceived.render({ ...onOrder, direction: 'purchase', rows: [] })
  isClean(html, 'order received (no rows)')
  assert.ok(!html.includes('#101114'), 'an empty summary card was drawn')
})

test('a card value carrying HTML is escaped rather than rendered', () => {
  const html = orderReceived.render({
    ...onOrder,
    direction: 'purchase',
    rows: [{ label: '<script>x</script>', value: '"&<>' }],
  })
  assert.ok(!html.includes('<script>x</script>'), 'a row value reached the page as markup')
  assert.ok(html.includes('&lt;script&gt;'), 'the value was dropped instead of escaped')
})

test('order received renders a stable snapshot', () => {
  const html = orderReceived.render({ ...onOrder, direction: 'purchase', rows })
  expect(html).toMatchSnapshot()
})
