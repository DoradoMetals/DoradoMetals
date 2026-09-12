import { createElement as h } from 'react'
import { renderDocument, Header, Footer, Instructions } from '@dorado/components/document'
import { DOCUMENT_FONT_FACES, DOCUMENT_FONT_FAMILY } from '#documents/pdfs/render/assets.ts'
import { formatIssued } from '#documents/pdfs/render/format.ts'

const LEAD = 'Sending your metals takes four steps.'
const SUB =
  'Read these before you pack. The first step is the one people skip, and it is the one that protects you if a parcel goes missing.'

const STEPS = [
  {
    title: 'Print your packing list and label',
    body: 'Put the packing list inside the box and tape the prepaid label to the outside. If you would rather use your own label, send your items — packing list included — to the address on your packing list.',
  },
  {
    title: 'Pack your items',
    body: 'Photograph everything before it goes in, so you have a record if a claim is ever needed. Use a medium box at the dimensions shown; the wrong size can change the shipping cost, which comes out of your payout. Over $5,000 in value, double box it.',
  },
  {
    title: 'Hand it over',
    body: 'Drop the package at any FedEx or affiliate location. If a pickup has been scheduled for you, leave it ready by the time shown on your packing list — you do not need to go anywhere.',
  },
  {
    title: "That's it",
    body: 'We email you the moment your parcel arrives, and once FedEx scans the label you can follow it from your order screen.',
  },
]

const WORTH_KNOWING = [
  {
    title: 'Changed your mind about an item?',
    body: 'Include it or leave it out. We update your order against what actually arrives — nothing needs to be corrected first.',
  },
  {
    title: 'Keep the contents private',
    body: 'Pack so nothing can be seen, and there is no need to tell anyone what is inside, carrier staff included.',
  },
  {
    title: 'Need a different box?',
    body: 'Call before you ship if you need another size, or more than one parcel, and we will sort the label out.',
  },
]

const ARRIVAL = [
  {
    title: 'Opened',
    body: 'Your parcel is opened at our counter, secured, and each lot separated and logged against your order.',
  },
  {
    title: 'Monitored',
    body: 'Every parcel is opened and handled on camera, from the moment it arrives to the moment it is put away.',
  },
  {
    title: 'Weighed',
    body: 'Each lot is weighed against what you declared, so any difference shows up straight away.',
  },
  {
    title: 'Confirmed',
    body: "You'll receive a notification confirming exactly what arrived, before anything else happens.",
  },
]

export function buildShippingInstructionsHtml(reference: string): string {
  return renderDocument({
    title: `Shipment Instructions ${reference}`,
    head: h(Header, { kind: 'Shipment Instructions', reference }),
    body: [
      h(Instructions, {
        lead: LEAD,
        sub: SUB,
        stepsCap: 'Before You Ship',
        steps: STEPS,
        asideCap: 'Worth Knowing',
        aside: WORTH_KNOWING,
        closingCap: 'Once It Reaches Us',
        stages: ARRIVAL,
      }),
    ],
    foot: h(Footer, { issued: formatIssued() }),
    fontFaces: DOCUMENT_FONT_FACES,
    fontFamily: DOCUMENT_FONT_FAMILY,
  })
}
