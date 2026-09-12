import { createElement as h } from 'react'
import { renderDocument, Header, Footer, Instructions } from '@dorado/components/document'
import { DOCUMENT_FONT_FACES, DOCUMENT_FONT_FAMILY } from '#documents/pdfs/render/assets.ts'
import { formatIssued } from '#documents/pdfs/render/format.ts'

const LEAD = 'Your pickup takes four steps.'
const SUB =
  'Read these before the window. Our driver does the packing at your door, so the only thing you need ready is the items themselves.'

const STEPS = [
  {
    title: 'Gather your items',
    body: 'Have everything listed on your pickup manifest together in one place. Nothing needs to be wrapped, boxed or labelled — the driver brings the sealed bags.',
  },
  {
    title: 'Be reachable',
    body: 'The driver calls or texts the number on your order when they are on the way, usually 20 to 30 minutes ahead. If plans change, reply to that message or call us before the window opens.',
  },
  {
    title: 'Hand it over at the door',
    body: 'The driver photographs each item with you, seals the lot in a tamper-evident bag, and gives you a signed copy of the manifest. It takes about ten minutes.',
  },
  {
    title: "That's it",
    body: 'You will get a notification when the items reach our office, and the order screen updates as they are weighed and priced.',
  },
]

const WORTH_KNOWING = [
  {
    title: 'Changed your mind about an item?',
    body: 'Include it or leave it out. We update your order against what the driver actually collects — nothing needs to be corrected first.',
  },
  {
    title: 'Need to move the window?',
    body: 'Reschedule from your order screen or call us any time before the window opens. Same-day changes are fine.',
  },
  {
    title: 'Who is the driver?',
    body: 'Every pickup is made by a Dorado employee with ID, in a marked vehicle. We never use third-party couriers for pickups.',
  },
]

const ARRIVAL = [
  {
    title: 'Checked in',
    body: 'The sealed lot is logged against your order the moment the driver returns, seal number and all.',
  },
  {
    title: 'Monitored',
    body: 'Every bag is opened and handled on camera, from the moment it arrives to the moment it is put away.',
  },
  {
    title: 'Weighed',
    body: 'Each lot is weighed against what was declared, so any difference shows up straight away.',
  },
  {
    title: 'Confirmed',
    body: "You'll receive a notification confirming exactly what arrived, before anything else happens.",
  },
]

export function buildPickupInstructionsHtml(reference: string): string {
  return renderDocument({
    title: `Pickup Instructions ${reference}`,
    head: h(Header, { kind: 'Pickup Instructions', reference }),
    body: [
      h(Instructions, {
        lead: LEAD,
        sub: SUB,
        stepsCap: 'Before The Pickup',
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
