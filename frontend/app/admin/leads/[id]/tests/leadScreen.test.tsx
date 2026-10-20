import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '@/shared/tests/axe'

import * as components from '../_components'
import {
  LEAD_A,
  NOW,
  USER_RENEE,
  callsTo,
  choose,
  desktop,
  fail,
  pending,
  stubApi,
} from '../../tests/fixtures'
import { archivedDwight, card, findCard, leadRoutes, mountLead } from './screenFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/admin/leads/${LEAD_A}`,
  useSearchParams: () => new URLSearchParams(),
}))

const header = () => screen.getByTestId('lead-header')

beforeEach(() => {
  desktop(true)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the lead route components', () => {
  test('exports the screen and its parts', () => {
    for (const name of [
      'LeadScreen',
      'LeadHeader',
      'EstimateCard',
      'AddItemDrawer',
      'DetailsCard',
      'TimelineCard',
      'MessagesCard',
      'ContactCard',
      'EditContactDrawer',
      'DocumentsCard',
      'ConvertDialog',
      'DeleteLeadDialog',
    ]) {
      expect(typeof (components as Record<string, unknown>)[name], name).toBe('function')
    }
  })
})

describe('the lead screen, Default', () => {
  test('draws the cards in frame order', async () => {
    stubApi(leadRoutes())
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    const order = Array.from(document.querySelectorAll('[data-testid^="lead-card-"]')).map((n) =>
      n.getAttribute('data-testid')!.replace('lead-card-', '')
    )
    expect(order).toEqual(['estimate', 'details', 'timeline', 'messages', 'contact', 'documents'])
  })

  test('has no axe violations', async () => {
    stubApi(leadRoutes())
    const { container } = mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    await within(await findCard('estimate')).findByText('$1,840')
    await expectNoAxeViolations(container)
  })
})

describe('the lead header', () => {
  test('shows the badge, name, number, created date and the actions', async () => {
    stubApi(leadRoutes())
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    const h = within(header())
    expect(h.getByText('LEAD')).toBeTruthy()
    expect(h.getByText('New')).toBeTruthy()
    expect(h.getByText(/LEAD-4471/)).toBeTruthy()
    expect(h.getByText('Created Sep 9')).toBeTruthy()
    expect(h.getByRole('combobox', { name: 'Assigned to' }).textContent).toContain('Unowned')
    expect(h.getByRole('button', { name: 'Convert' })).toBeTruthy()
    expect(h.getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(h.queryByRole('button', { name: 'Restore' })).toBeNull()
    const crumbs = h.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/admin')
    expect(within(crumbs).getByRole('link', { name: 'Leads' }).getAttribute('href')).toBe(
      '/admin/leads'
    )
    expect(within(crumbs).getByText('Dwight Okafor')).toBeTruthy()
  })

  test.todo(
    'shows the city beside the number once the lead read carries one (LeadView has no city)'
  )

  test('choosing an assignee patches the lead', async () => {
    const calls = stubApi(leadRoutes())
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    await choose('Assigned to', 'Renee', header())
    await waitFor(() => {
      const patch = callsTo(calls, 'PATCH', `/leads/${LEAD_A}`).at(-1)
      expect(patch?.body).toEqual({ assigned_to_id: USER_RENEE })
    })
  })

  test('Archived: the badge reads Archived and Restore replaces Delete', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes({ [`GET /leads/${LEAD_A}`]: archivedDwight }))
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    const h = within(header())
    expect(h.getByText('Archived')).toBeTruthy()
    expect(h.queryByText('New')).toBeNull()
    expect(h.queryByRole('button', { name: 'Delete' })).toBeNull()
    await user.click(h.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(callsTo(calls, 'POST', `/leads/${LEAD_A}/restore`)).toHaveLength(1))
  })
})

describe('the Delete Lead dialog', () => {
  test('uses the ruling 162 copy and archives on Delete', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    await user.click(within(header()).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: 'Delete this lead?' })).toBeTruthy()
    expect(within(dialog).getByText('It moves to the archive and can be restored.')).toBeTruthy()
    await expectNoAxeViolations(dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(callsTo(calls, 'DELETE', `/leads/${LEAD_A}`)).toHaveLength(1))
  })

  test('Cancel archives nothing', async () => {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    await user.click(within(header()).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(callsTo(calls, 'DELETE', `/leads/${LEAD_A}`)).toHaveLength(0)
  })
})

describe('the Convert dialog', () => {
  async function openConvert() {
    const user = userEvent.setup()
    const calls = stubApi(leadRoutes())
    mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    await within(await findCard('estimate')).findByText('$1,840')
    await user.click(within(header()).getByRole('button', { name: 'Convert' }))
    const dialog = await screen.findByRole('dialog')
    return { user, calls, dialog }
  }

  test('prefills the contact and offers to carry the estimate, priced by the API', async () => {
    const { dialog } = await openConvert()
    const d = within(dialog)
    expect(d.getByRole('heading', { name: 'Convert to customer?' })).toBeTruthy()
    expect(
      d.getByText('The texts, calls and notes follow the lead onto the new customer.')
    ).toBeTruthy()
    expect((d.getByLabelText('Name') as HTMLInputElement).value).toBe('Dwight Okafor')
    expect((d.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('d.okafor@gmail.com')
    expect((d.getByLabelText('Phone') as HTMLInputElement).value).toContain('555')
    const carry = d.getByRole('checkbox', { name: 'Add the estimate to their cart' })
    expect(
      carry.getAttribute('aria-checked') === 'true' || (carry as HTMLInputElement).checked
    ).toBe(true)
    expect(d.getByText('3 items · $4,199 est.')).toBeTruthy()
    await expectNoAxeViolations(dialog)
  })

  test('Convert posts carry_estimate true with the contact', async () => {
    const { user, calls, dialog } = await openConvert()
    await user.click(within(dialog).getByRole('button', { name: 'Convert' }))
    await waitFor(() => {
      const post = callsTo(calls, 'POST', `/leads/${LEAD_A}/convert`).at(-1)
      expect(post?.body).toMatchObject({
        name: 'Dwight Okafor',
        email: 'd.okafor@gmail.com',
        carry_estimate: true,
      })
    })
  })

  test('unticking the estimate posts carry_estimate false', async () => {
    const { user, calls, dialog } = await openConvert()
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Add the estimate to their cart' })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Convert' }))
    await waitFor(() => {
      const post = callsTo(calls, 'POST', `/leads/${LEAD_A}/convert`).at(-1)
      expect(post?.body).toMatchObject({ carry_estimate: false })
    })
  })

  test('Email is required', async () => {
    const { user, calls, dialog } = await openConvert()
    await user.clear(within(dialog).getByLabelText(/^Email/))
    const convert = within(dialog).getByRole('button', { name: 'Convert' })
    await user.click(convert)
    expect(callsTo(calls, 'POST', `/leads/${LEAD_A}/convert`)).toHaveLength(0)
  })
})

describe('the lead screen states', () => {
  test('Loading shows a busy screen', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}`]: pending() }))
    mountLead()
    expect((await screen.findAllByRole('status')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Dwight Okafor' })).toBeNull()
  })

  test('Error shows an alert', async () => {
    stubApi(leadRoutes({ [`GET /leads/${LEAD_A}`]: fail(404, 'no such lead') }))
    mountLead()
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  test('Mobile draws the header and every card', async () => {
    desktop(false)
    stubApi(leadRoutes())
    const { container } = mountLead()
    await screen.findByRole('heading', { name: 'Dwight Okafor', level: 1 })
    for (const name of ['estimate', 'details', 'timeline', 'messages', 'contact', 'documents']) {
      expect(card(name)).toBeTruthy()
    }
    await expectNoAxeViolations(container)
  })
})
