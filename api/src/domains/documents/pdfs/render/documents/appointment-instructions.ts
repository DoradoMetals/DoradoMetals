import { createElement as h } from 'react'
import { renderDocument, Header, Footer, Instructions } from '@dorado/components/document'
import { DOCUMENT_FONT_FACES, DOCUMENT_FONT_FAMILY } from '#documents/pdfs/render/assets.ts'
import { formatIssued } from '#documents/pdfs/render/format.ts'

const LEAD = 'Your appointment takes four steps.'
const SUB =
  'Read these before you come in. Most appointments take under thirty minutes, and you leave with a finalized price.'

const STEPS = [
  {
    title: 'Gather your items',
    body: 'Bring everything on your intake receipt. Nothing needs to be cleaned, sorted or wrapped — we handle all of that at the counter.',
  },
  {
    title: 'Bring a photo ID',
    body: 'A government-issued ID is required to sell precious metals in Texas. The name should match the one on your order.',
  },
  {
    title: 'Come to the office',
    body: 'Parking is free at the door. Check in at the front desk with your order number and the specialist named on your receipt will meet you.',
  },
  {
    title: "That's it",
    body: 'Items are weighed and tested in front of you, and your payout is finalized before you leave. Payment goes out the same day.',
  },
]

const WORTH_KNOWING = [
  {
    title: 'Changed your mind about an item?',
    body: 'Bring it or leave it home. We update your order against what you actually bring in — nothing needs to be corrected first.',
  },
  {
    title: 'Running late?',
    body: 'Call or text us and we will hold your slot. If you need a different day, reschedule from your order screen.',
  },
  {
    title: 'Bringing more than listed?',
    body: 'That is fine. We can add items at the counter, though very large lots may need a second appointment.',
  },
]

const ARRIVAL = [
  {
    title: 'Checked in',
    body: 'Your items are logged against your order at the front desk and stay in your sight the whole time.',
  },
  {
    title: 'Monitored',
    body: 'Every appointment is handled on camera, from check-in to payout.',
  },
  {
    title: 'Weighed & tested',
    body: 'Each lot is weighed and tested in front of you, and any difference from your estimate is explained on the spot.',
  },
  {
    title: 'Quote',
    body: 'You confirm our quote pending final assay before you leave.',
  },
]

export function buildAppointmentInstructionsHtml(reference: string): string {
  return renderDocument({
    title: `Appointment Instructions ${reference}`,
    head: h(Header, { kind: 'Appointment Instructions', reference }),
    body: [
      h(Instructions, {
        lead: LEAD,
        sub: SUB,
        stepsCap: 'Before You Arrive',
        steps: STEPS,
        asideCap: 'Worth Knowing',
        aside: WORTH_KNOWING,
        closingCap: 'While You Are Here',
        stages: ARRIVAL,
      }),
    ],
    foot: h(Footer, { issued: formatIssued() }),
    fontFaces: DOCUMENT_FONT_FACES,
    fontFamily: DOCUMENT_FONT_FAMILY,
  })
}
