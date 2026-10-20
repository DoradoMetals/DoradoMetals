import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '@/shared/tests/axe'

import {
  CONTACT_EMAIL,
  IMAGE_NEW,
  ITEM_1,
  ITEM_2,
  ITEM_3,
  KIND_SCRAP,
  LEAD_A,
  NOW,
  PURITY_14K,
  SOURCE_WEBSITE,
  UNIT_G,
  callsTo,
  choose,
  desktop,
  estimate,
  fail,
  fileInput,
  pending,
  items,
  pick,
  png,
  stubApi,
} from '../../tests/fixtures'
import { card, dwight, findCard, leadRoutes, mountLead } from './screenFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/admin/leads/${LEAD_A}`,
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  desktop(true)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function ready() {
  await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
  const estimateCard = await findCard('estimate')
  await within(estimateCard).findByText('$1,840')
  return estimateCard
}

const shown = (scope: HTMLElement, text: string) =>
  within(scope).queryByText(text) ?? within(scope).getByDisplayValue(text)

const rowsIn = (scope: HTMLElement) =>
  within(within(scope).getByRole('table')).getAllByRole('row').slice(1)

const rowOf = (scope: HTMLElement, text: string | RegExp) => {
  const row = rowsIn(scope).find((r) => within(r).queryByText(text))
  if (!row) throw new Error(`no row with ${String(text)}`)
  return row
}

async function confirmIfAsked(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const dialog = screen.queryByRole('dialog')
  if (dialog) await user.click(within(dialog).getByRole('button', { name }))
}

async function attachThrough(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement | Document
) {
  await user.upload(fileInput(scope), png())
  const dialog = screen.queryByRole('dialog')
  const go = dialog ? within(dialog).queryByRole('button', { name: /^(Upload|Attach)/ }) : null
  if (go) await user.click(go)
}

describe('the Estimate card', () => {
  test('draws one row per item with figures from the items and the pricing read', async () => {
    stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    expect(within(est).getByText('Estimate')).toBeTruthy()
    const heads = within(est)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim())
    for (const name of ['Item', 'Type', 'Weight', 'Purity', 'Rate', 'Value']) {
      expect(heads).toContain(name)
    }
    expect(rowsIn(est)).toHaveLength(3)
    const first = rowOf(est, /14K/)
    expect(within(first).getByText(/Gold/)).toBeTruthy()
    expect(within(first).getByText('Scrap')).toBeTruthy()
    expect(within(first).getByText('12.0 g')).toBeTruthy()
    expect(within(first).getByText('58.5%')).toBeTruthy()
    expect(within(first).getByText('88%')).toBeTruthy()
    expect(within(first).getByText('$1,840')).toBeTruthy()
    const silver = rowOf(est, /Sterling/)
    expect(within(silver).getByText('220.0 g')).toBeTruthy()
    expect(within(silver).getByText('$750')).toBeTruthy()
  })

  test('the estimated total is the API total, never the sum of the rows', async () => {
    stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    expect(within(est).getByText('Estimated total')).toBeTruthy()
    expect(within(est).getByText('$4,199 est.')).toBeTruthy()
    expect(within(est).queryByText('$4,200 est.')).toBeNull()
  })

  test('the total weight is never summed in the browser', async () => {
    stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    expect(within(est).queryByText('240.4 g')).toBeNull()
    expect(within(est).getByText('Total weight')).toBeTruthy()
    expect(within(est).getByText('241.0 g')).toBeTruthy()
  })

  test('an item with images shows its count', async () => {
    stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    expect(within(rowOf(est, /14K/)).getByText('2')).toBeTruthy()
  })

  test('an item the API cannot price shows a dash for its value', async () => {
    stubApi(
      leadRoutes({
        [`GET /pricing/lead-estimates/${LEAD_A}`]: {
          ...estimate,
          items: estimate.items.filter((line) => line.id !== ITEM_3),
          unpriceable: [ITEM_3],
        },
      })
    )
    mountLead()
    const est = await ready()
    expect(within(rowOf(est, /Sterling/)).getByText('—')).toBeTruthy()
  })

  test('Empty: no items shows the empty state and no total', async () => {
    stubApi(
      leadRoutes({
        [`GET /leads/${LEAD_A}/estimate/items`]: [],
        [`GET /pricing/lead-estimates/${LEAD_A}`]: { ...estimate, items: [], total: 0 },
      })
    )
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    const est = await findCard('estimate')
    expect(await within(est).findByText(/No items/)).toBeTruthy()
    expect(within(est).getByRole('button', { name: 'Add item' }).hasAttribute('disabled')).toBe(
      false
    )
  })

  test('Error: a failed items read shows an alert in the card', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}/estimate/items`]: fail(500) }))
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    expect(await within(await findCard('estimate')).findByRole('alert')).toBeTruthy()
  })
})

describe('the Estimate actions follow the selection', () => {
  const actions = (est: HTMLElement) => ({
    add: within(est).getByRole('button', { name: 'Add item' }),
    attach: within(est).getByRole('button', { name: 'Attach images' }),
    view: within(est).getByRole('button', { name: 'View images' }),
    remove: within(est).getByRole('button', { name: 'Delete items' }),
  })
  const enabled = (el: HTMLElement) => !el.hasAttribute('disabled')

  test('none selected: only Add item', async () => {
    stubApi(leadRoutes())
    mountLead()
    const a = actions(await ready())
    expect([enabled(a.add), enabled(a.attach), enabled(a.view), enabled(a.remove)]).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  test('one selected: all four', async () => {
    const user = userEvent.setup()
    stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    await user.click(within(rowOf(est, /14K/)).getByRole('checkbox'))
    const a = actions(est)
    expect([enabled(a.add), enabled(a.attach), enabled(a.view), enabled(a.remove)]).toEqual([
      true,
      true,
      true,
      true,
    ])
  })

  test('many selected: Attach images and View images need exactly one row', async () => {
    const user = userEvent.setup()
    stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    await user.click(within(rowOf(est, /14K/)).getByRole('checkbox'))
    await user.click(within(rowOf(est, /18K/)).getByRole('checkbox'))
    const a = actions(est)
    expect([enabled(a.add), enabled(a.attach), enabled(a.view), enabled(a.remove)]).toEqual([
      true,
      false,
      false,
      true,
    ])
  })

  test('Delete items removes every selected item', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    await user.click(within(rowOf(est, /14K/)).getByRole('checkbox'))
    await user.click(within(rowOf(est, /18K/)).getByRole('checkbox'))
    await user.click(within(est).getByRole('button', { name: 'Delete items' }))
    await confirmIfAsked(user, /^Delete/)
    await waitFor(() => {
      expect(callsTo(calls, 'DELETE', `/leads/${LEAD_A}/estimate/items/${ITEM_1}`)).toHaveLength(1)
      expect(callsTo(calls, 'DELETE', `/leads/${LEAD_A}/estimate/items/${ITEM_2}`)).toHaveLength(1)
    })
    expect(callsTo(calls, 'DELETE', `/leads/${LEAD_A}/estimate/items/${ITEM_3}`)).toHaveLength(0)
  })

  test('View images opens the photo viewer on the item images', async () => {
    const user = userEvent.setup()
    stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    await user.click(within(rowOf(est, /14K/)).getByRole('checkbox'))
    await user.click(within(est).getByRole('button', { name: 'View images' }))
    const viewer = await screen.findByRole('group', { name: 'Photo viewer' })
    await waitFor(() =>
      expect(viewer.querySelector('img[src="https://img.example/ring-1.jpg"]')).not.toBeNull()
    )
    expect(within(viewer).getByRole('button', { name: 'Next photo' })).toBeTruthy()
  })

  test('Attach images uploads through the media path and links the image to the item', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    await user.click(within(rowOf(est, /18K/)).getByRole('checkbox'))
    await user.click(within(est).getByRole('button', { name: 'Attach images' }))
    await attachThrough(user, document)
    await waitFor(() => {
      expect(callsTo(calls, 'POST', '/images')).toHaveLength(1)
      expect(callsTo(calls, 'PUT', '/upload/ring.png')).toHaveLength(1)
      const link = callsTo(calls, 'POST', `/leads/${LEAD_A}/estimate/items/${ITEM_2}/images`)
      expect(link.at(-1)?.body).toEqual({ image_id: IMAGE_NEW })
    })
  })
})

describe('the Add item drawer', () => {
  async function openDrawer() {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    const est = await ready()
    await user.click(within(est).getByRole('button', { name: 'Add item' }))
    const drawer = await screen.findByRole('dialog')
    return { user, calls, drawer }
  }

  test('offers type, metal, purity and unit from the lookups', async () => {
    const { drawer } = await openDrawer()
    const d = within(drawer)
    expect(d.getByRole('heading', { name: 'Add item' })).toBeTruthy()
    expect(pick(drawer, 'Scrap')).toBeTruthy()
    expect(pick(drawer, 'Bullion')).toBeTruthy()
    expect(pick(drawer, 'Gold')).toBeTruthy()
    expect(pick(drawer, 'Silver')).toBeTruthy()
    expect(await d.findByText('14K')).toBeTruthy()
    expect(d.getByText('18K')).toBeTruthy()
    for (const unit of ['Troy Oz', 'Grams', 'DWT', 'LBs']) expect(pick(drawer, unit)).toBeTruthy()
    expect(d.getByLabelText(/^Weight/)).toBeTruthy()
    expect(d.getByLabelText(/^Purity/)).toBeTruthy()
    await expectNoAxeViolations(drawer)
  })

  test('the purity chips follow the metal', async () => {
    const { user, drawer } = await openDrawer()
    await user.click(pick(drawer, 'Silver'))
    expect(await within(drawer).findByText('Sterling')).toBeTruthy()
    expect(within(drawer).queryByText('14K')).toBeNull()
  })

  test('Add to estimate posts the item with lookup ids', async () => {
    const { user, calls, drawer } = await openDrawer()
    await user.click(pick(drawer, 'Scrap'))
    await user.click(pick(drawer, 'Gold'))
    await user.click(pick(drawer, '14K'))
    await user.type(within(drawer).getByLabelText(/^Weight/), '12')
    await user.click(pick(drawer, 'Grams'))
    await user.click(within(drawer).getByRole('button', { name: 'Add to estimate' }))
    await waitFor(() => {
      const post = callsTo(calls, 'POST', `/leads/${LEAD_A}/estimate/items`).at(-1)
      expect(post?.body).toEqual({
        kind_id: KIND_SCRAP,
        metal_id: 'Gold',
        purity_id: PURITY_14K,
        weight: 12,
        unit_id: UNIT_G,
      })
    })
  })

  test('a typed purity is sent as custom_purity, a fraction', async () => {
    const { user, calls, drawer } = await openDrawer()
    await user.click(pick(drawer, 'Scrap'))
    await user.click(pick(drawer, 'Gold'))
    await user.type(within(drawer).getByLabelText(/^Purity/), '58.5')
    await user.type(within(drawer).getByLabelText(/^Weight/), '3')
    await user.click(pick(drawer, 'Grams'))
    await user.click(within(drawer).getByRole('button', { name: 'Add to estimate' }))
    await waitFor(() => {
      const post = callsTo(calls, 'POST', `/leads/${LEAD_A}/estimate/items`).at(-1)
      expect(post?.body).toMatchObject({ custom_purity: 0.585, weight: 3, metal_id: 'Gold' })
    })
  })

  test('Add to estimate waits for a weight', async () => {
    const { user, calls, drawer } = await openDrawer()
    await user.click(pick(drawer, 'Scrap'))
    await user.click(pick(drawer, 'Gold'))
    await user.click(pick(drawer, '14K'))
    await user.click(within(drawer).getByRole('button', { name: 'Add to estimate' }))
    expect(callsTo(calls, 'POST', `/leads/${LEAD_A}/estimate/items`)).toHaveLength(0)
  })
})

describe('the Details card', () => {
  test('shows the source and the notes and preferences', async () => {
    stubApi(leadRoutes())
    mountLead()
    await ready()
    const details = card('details')
    expect(within(details).getByText('Details')).toBeTruthy()
    expect(within(details).getByRole('combobox', { name: 'Source' }).textContent).toContain(
      'Trade referral'
    )
    expect(within(details).getByText('Notes & preferences')).toBeTruthy()
    expect(
      within(details).getByDisplayValue(
        'Inherited a box of estate jewellery. Wants a quote before shipping. Call after 5pm.'
      )
    ).toBeTruthy()
  })

  test('changing the source patches source_id', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await ready()
    const details = card('details')
    const edit = within(details).queryByRole('button', { name: 'Edit' })
    if (edit) await user.click(edit)
    await choose('Source', 'Website', details)
    const save = within(details).queryByRole('button', { name: 'Save' })
    if (save) await user.click(save)
    await waitFor(() => {
      const patch = callsTo(calls, 'PATCH', `/leads/${LEAD_A}`).at(-1)
      expect(patch?.body).toMatchObject({ source_id: SOURCE_WEBSITE })
    })
  })

  test('editing Notes & preferences patches the lead notes', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await ready()
    const details = card('details')
    const edit = within(details).queryByRole('button', { name: 'Edit' })
    if (edit) await user.click(edit)
    const notes = within(details).getByLabelText('Notes & preferences')
    await user.clear(notes)
    await user.type(notes, 'Prefers mornings')
    const save = within(details).queryByRole('button', { name: 'Save' })
    if (save) await user.click(save)
    else await user.tab()
    await waitFor(() => {
      const patch = callsTo(calls, 'PATCH', `/leads/${LEAD_A}`).at(-1)
      expect(patch?.body).toMatchObject({ notes: 'Prefers mornings' })
    })
  })
})

describe('the Timeline card', () => {
  test('lists the lead events with actor, detail and time', async () => {
    stubApi(leadRoutes())
    mountLead()
    await ready()
    const tl = card('timeline')
    expect(within(tl).getByText('Timeline')).toBeTruthy()
    expect(within(tl).getByText('Since Sep 9')).toBeTruthy()
    expect(await within(tl).findByText('Added estimate')).toBeTruthy()
    expect(within(tl).getByText('Jacob Johnson · gold and silver scrap · 240 g')).toBeTruthy()
    expect(within(tl).getByText('Sep 9, 8:12 PM')).toBeTruthy()
    expect(within(tl).getByText('Outgoing call · no answer')).toBeTruthy()
    expect(within(tl).getByText('Jacob Johnson')).toBeTruthy()
  })

  test('Empty: no events says so', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}/timeline`]: [] }))
    mountLead()
    await ready()
    expect(await within(card('timeline')).findByText(/Nothing yet|No activity/)).toBeTruthy()
  })
})

describe('the Customer messages card', () => {
  test('reads the thread by the lead number and draws text and image bubbles both ways', async () => {
    const calls = stubApi(leadRoutes())
    mountLead()
    await ready()
    const box = card('messages')
    expect(within(box).getByText('Customer messages')).toBeTruthy()
    expect(
      await within(box).findByText(
        'Hi Dwight, thanks for reaching out about your estate jewellery.'
      )
    ).toBeTruthy()
    expect(within(box).getByText('Thanks! Roughly when should I expect the payout?')).toBeTruthy()
    expect(within(box).getByText('Here is the ring we discussed')).toBeTruthy()
    await waitFor(() => {
      expect(box.querySelector('img[src="https://img.example/in.jpg"]')).not.toBeNull()
      expect(box.querySelector('img[src="https://img.example/out.jpg"]')).not.toBeNull()
    })
    expect(within(box).getAllByText(/Delivered/).length).toBeGreaterThan(0)
    const read = callsTo(calls, 'GET', '/sms').at(-1)!
    expect(read.url.searchParams.get('number')).toBe('+15125550307')
  })

  test('sending a text posts it with the lead id', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await ready()
    const box = card('messages')
    await within(box).findByText('Here is the ring we discussed')
    await user.type(within(box).getByRole('textbox'), 'We can meet Tuesday')
    await user.click(within(box).getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      const post = callsTo(calls, 'POST', '/sms').at(-1)
      expect(post?.body).toEqual({ lead_id: LEAD_A, body: 'We can meet Tuesday' })
    })
  })

  test('the paperclip attaches an image and the send carries its id', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await ready()
    const box = card('messages')
    await within(box).findByText('Here is the ring we discussed')
    await user.click(within(box).getByRole('button', { name: 'Attach' }))
    await attachThrough(user, document)
    await waitFor(() => expect(callsTo(calls, 'POST', '/images')).toHaveLength(1))
    await user.type(within(box).getByRole('textbox'), 'Like this one')
    await user.click(within(box).getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      const post = callsTo(calls, 'POST', '/sms').at(-1)
      expect(post?.body).toEqual({ lead_id: LEAD_A, body: 'Like this one', image_ids: [IMAGE_NEW] })
    })
  })

  test('Error: a failed thread read shows the library error', async () => {
    stubApi(leadRoutes({ 'GET /sms': fail(500) }))
    mountLead()
    await ready()
    expect(await within(card('messages')).findByText("Couldn't load messages")).toBeTruthy()
  })
})

describe('the Contact info card', () => {
  test('is read-only and shows the contact facts', async () => {
    stubApi(leadRoutes())
    mountLead()
    await ready()
    const contact = card('contact')
    expect(within(contact).getByText('Contact info')).toBeTruthy()
    expect(shown(contact, '(512) 555-0307')).toBeTruthy()
    expect(shown(contact, 'd.okafor@gmail.com')).toBeTruthy()
    expect(shown(contact, 'Text')).toBeTruthy()
    expect(shown(contact, 'Sep 10, 10:06 AM')).toBeTruthy()
    expect(shown(contact, 'Opted in Sep 9 · Verbal')).toBeTruthy()
    for (const box of within(contact).queryAllByRole('textbox')) {
      expect(box.hasAttribute('readonly') || box.hasAttribute('disabled')).toBe(true)
    }
  })

  test('shows the Location read-only as City, ST', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}`]: { ...dwight, city: 'Austin', state: 'TX' } }))
    mountLead()
    await ready()
    const contact = card('contact')
    const box = within(contact).getByLabelText('Location') as HTMLInputElement
    expect(box.value).toBe('Austin, TX')
    expect(box.hasAttribute('readonly')).toBe(true)
  })

  test('shows a state alone in the Location', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}`]: { ...dwight, state: 'TX' } }))
    mountLead()
    await ready()
    const box = within(card('contact')).getByLabelText('Location') as HTMLInputElement
    expect(box.value).toBe('TX')
  })

  test('the card has no axe violations with and without a location', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}`]: { ...dwight, city: 'Austin', state: 'TX' } }))
    const first = mountLead()
    await ready()
    await expectNoAxeViolations(card('contact'))
    first.unmount()
    stubApi(leadRoutes())
    mountLead()
    await ready()
    await expectNoAxeViolations(card('contact'))
  })

  test('shows an empty Location when none is set', async () => {
    stubApi(leadRoutes())
    mountLead()
    await ready()
    const box = within(card('contact')).getByLabelText('Location') as HTMLInputElement
    expect(box.value).toBe('')
  })

  test('the drawer edits City and State and Save patches both', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await ready()
    await user.click(within(card('contact')).getByRole('button', { name: 'Edit' }))
    const drawer = await screen.findByRole('dialog')
    await user.type(within(drawer).getByLabelText('City'), 'Austin')
    await user.type(within(drawer).getByLabelText('State'), 'tx')
    await expectNoAxeViolations(drawer)
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      const patch = callsTo(calls, 'PATCH', `/leads/${LEAD_A}`).at(-1)
      expect(patch?.body).toMatchObject({ city: 'Austin', state: 'TX' })
    })
  })

  test('clearing City and State patches them to null', async () => {
    const user = userEvent.setup()
    const calls = stubApi(
      leadRoutes({ [`GET /leads/${LEAD_A}`]: { ...dwight, city: 'Austin', state: 'TX' } })
    )
    mountLead()
    await ready()
    await user.click(within(card('contact')).getByRole('button', { name: 'Edit' }))
    const drawer = await screen.findByRole('dialog')
    await user.clear(within(drawer).getByLabelText('City'))
    await user.clear(within(drawer).getByLabelText('State'))
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      const patch = callsTo(calls, 'PATCH', `/leads/${LEAD_A}`).at(-1)
      expect(patch?.body).toEqual({ city: null, state: null })
    })
  })

  test('without consent it says so', async () => {
    stubApi(
      leadRoutes({
        [`GET /leads/${LEAD_A}`]: {
          ...dwight,
          sms_consent_at: null,
          sms_consent_method: null,
        },
      })
    )
    mountLead()
    await ready()
    const contact = card('contact')
    expect(
      within(contact).queryByText(/Not opted in/) ??
        within(contact).getByDisplayValue(/Not opted in/)
    ).toBeTruthy()
  })

  test('Edit opens the Edit contact drawer and Save patches the lead', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await ready()
    await user.click(within(card('contact')).getByRole('button', { name: 'Edit' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByRole('heading', { name: 'Edit contact' })).toBeTruthy()
    await expectNoAxeViolations(drawer)
    const email = within(drawer).getByLabelText('Email')
    await user.clear(email)
    await user.type(email, 'dwight@example.invalid')
    await choose('Preference', 'Email', drawer)
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      const patch = callsTo(calls, 'PATCH', `/leads/${LEAD_A}`).at(-1)
      expect(patch?.body).toMatchObject({
        email: 'dwight@example.invalid',
        contact_preference_id: CONTACT_EMAIL,
      })
    })
  })
})

describe('the Documents card', () => {
  test('lists the documents with a count and download', async () => {
    stubApi(leadRoutes())
    mountLead()
    await ready()
    const docs = card('documents')
    expect(within(docs).getByText('Documents')).toBeTruthy()
    expect(await within(docs).findByText('2 documents')).toBeTruthy()
    expect(within(docs).getAllByRole('button', { name: /^Download/ })).toHaveLength(2)
  })

  test('the not-available state', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}/documents`]: [] }))
    mountLead()
    await ready()
    expect(await within(card('documents')).findByText('Not yet available')).toBeTruthy()
  })

  test('Loading shows the library loading rows', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}/documents`]: pending() }))
    mountLead()
    await ready()
    expect(
      within(card('documents')).getByRole('status', { name: 'Loading documents' })
    ).toBeTruthy()
  })

  test('Send on a document sends it to the lead', async () => {
    const user = userEvent.setup()
    const pdf = '00000000-0000-4000-8000-000000000511'
    const calls = stubApi(
      leadRoutes({ [`POST /leads/${LEAD_A}/documents/${pdf}/send`]: { channel: 'sms' } })
    )
    mountLead()
    await ready()
    const docs = card('documents')
    await within(docs).findByText('2 documents')
    await user.click(within(docs).getByRole('button', { name: 'Send Rates Sheet' }))
    await waitFor(() =>
      expect(callsTo(calls, 'POST', `/leads/${LEAD_A}/documents/${pdf}/send`)).toHaveLength(1)
    )
  })

  test('Download on a document opens its signed url', async () => {
    const user = userEvent.setup()
    const pdf = '00000000-0000-4000-8000-000000000511'
    const open = vi.fn()
    vi.stubGlobal('open', open)
    stubApi(
      leadRoutes({
        [`GET /leads/${LEAD_A}/documents/${pdf}/url`]: 'https://files.example/rate-sheet.pdf',
      })
    )
    mountLead()
    await ready()
    const docs = card('documents')
    await within(docs).findByText('2 documents')
    await user.click(within(docs).getByRole('button', { name: 'Download Rates Sheet' }))
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://files.example/rate-sheet.pdf',
        '_blank',
        'noopener'
      )
    )
  })
})

describe('no money or weight is computed in the browser', () => {
  test('changing only the pricing read changes every value shown', async () => {
    stubApi(
      leadRoutes({
        [`GET /pricing/lead-estimates/${LEAD_A}`]: {
          ...estimate,
          items: estimate.items.map((line) => ({ ...line, value: line.value + 1 })),
          total: 9999,
        },
      })
    )
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    const est = await findCard('estimate')
    expect(await within(est).findByText('$1,841')).toBeTruthy()
    expect(within(est).getByText('$9,999 est.')).toBeTruthy()
    expect(items).toHaveLength(3)
  })
})
