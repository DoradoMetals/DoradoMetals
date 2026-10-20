import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { expectNoAxeViolations } from '@/shared/tests/axe'

import * as components from '../_components'
import { LeadsScreen } from '../_components'
import {
  DAY,
  LEAD_A,
  LEAD_B,
  NOW,
  USER_RENEE,
  activity,
  archivedLeads,
  callsTo,
  choose,
  desktop,
  employees,
  fail,
  lead,
  leads,
  pageOf,
  pending,
  sources,
  stubApi,
  summary,
  totals,
  type Routes,
} from './fixtures'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/admin/leads',
  useSearchParams: () => new URLSearchParams(),
}))

function routes(over: Routes = {}): Routes {
  return {
    'GET /leads': (url: URL) =>
      pageOf(url.searchParams.get('archived') === 'true' ? archivedLeads : leads, url),
    'GET /leads/summary': summary,
    'GET /leads/sources': sources,
    'GET /employees': employees,
    'GET /pricing/lead-estimates': totals,
    'GET /activity': activity,
    [`DELETE /leads/${LEAD_A}`]: { message: 'Lead archived' },
    [`DELETE /leads/${LEAD_B}`]: { message: 'Lead archived' },
    [`POST /leads/${archivedLeads[0].id}/restore`]: { ...archivedLeads[0], archived_at: null },
    ...over,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LeadsScreen />
    </QueryClientProvider>
  )
}

const table = () => screen.getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const rowOf = (name: string) => {
  const row = bodyRows().find((r) => within(r).queryByText(name))
  if (!row) throw new Error(`no row for ${name}`)
  return row
}
const namesInOrder = () =>
  bodyRows().map((r) => within(r).getAllByRole('cell')[1]?.textContent?.trim() ?? '')
const leadCalls = (calls: ReturnType<typeof stubApi>) =>
  calls.filter((c) => c.method === 'GET' && c.url.pathname.replace(/^\/api/, '') === '/leads')
const lastList = (calls: ReturnType<typeof stubApi>) => leadCalls(calls).at(-1)!

beforeEach(() => {
  desktop(true)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  push.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the leads route components', () => {
  test('exports the screen and its parts', () => {
    for (const name of [
      'LeadsScreen',
      'LeadFilterBar',
      'LeadTable',
      'LeadStatTiles',
      'LeadActivityFeed',
    ]) {
      expect(typeof (components as Record<string, unknown>)[name], name).toBe('function')
    }
  })
})

describe('the leads list, Default', () => {
  test('draws the header with the totals line from the summary, not from the rows', async () => {
    stubApi(routes())
    mount()
    expect(await screen.findByRole('heading', { name: 'Leads', level: 1 })).toBeTruthy()
    expect(
      await screen.findByText('48 leads · 6 unowned · median 4h to first contact')
    ).toBeTruthy()
    expect(screen.getByPlaceholderText('Name, phone or email')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New lead' })).toBeTruthy()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/admin')
  })

  test('draws the table columns and one row per lead from GET /leads', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    expect(screen.getByText('All leads')).toBeTruthy()
    const heads = within(table())
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim())
    for (const name of ['Name', 'Source', 'Status', 'Assigned to', 'Estimated value', 'Created']) {
      expect(heads).toContain(name)
    }
    expect(bodyRows()).toHaveLength(4)
    const dwight = rowOf('Dwight Okafor')
    expect(within(dwight).getByText('Website')).toBeTruthy()
    expect(within(dwight).getByText('New')).toBeTruthy()
    expect(within(dwight).getByText('Unassigned')).toBeTruthy()
    expect(within(dwight).getByText('3 days ago')).toBeTruthy()
    const celestine = rowOf('Celestine Marr')
    expect(within(celestine).getByText('Phone call')).toBeTruthy()
    expect(within(celestine).getByText('Contacted')).toBeTruthy()
    expect(within(celestine).getByText('Jacob')).toBeTruthy()
    expect(within(rowOf('Bartholomew Ng')).getByText('2 weeks ago')).toBeTruthy()
    expect(within(rowOf('Inez Calloway')).getByText('Converted')).toBeTruthy()
  })

  test('the estimated value comes from the pricing read, and a lead it does not price shows a dash', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await waitFor(() => expect(within(rowOf('Dwight Okafor')).getByText('$1,240')).toBeTruthy())
    expect(within(rowOf('Celestine Marr')).getByText('$3,860')).toBeTruthy()
    expect(within(rowOf('Inez Calloway')).getByText('$820')).toBeTruthy()
    expect(within(rowOf('Bartholomew Ng')).getByText('—')).toBeTruthy()
    const priced = callsTo(calls, 'GET', '/pricing/lead-estimates')
    expect(priced.length).toBeGreaterThan(0)
    expect(priced.at(-1)!.url.searchParams.getAll('lead_ids').sort()).toEqual(
      leads.map((l) => l.id).sort()
    )
  })

  test('shows the matching count and the footer range', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    expect(screen.getByText('4 matching')).toBeTruthy()
    expect(document.querySelector('[data-part="count"]')?.textContent).toMatch(
      /Showing\s*1–4\s*of\s*4/
    )
  })

  test('the status chips are All, New, Contacted, Converted and Archived, All first', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    for (const name of [/^All/, /^New/, /^Contacted/, /^Converted/, /^Archived/]) {
      expect(screen.getByRole('radio', { name })).toBeTruthy()
    }
    expect(screen.getByRole('radio', { name: /^All/ }).getAttribute('aria-checked')).toBe('true')
  })

  test('the status chips carry their counts from GET /leads/summary', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    expect(await screen.findByRole('radio', { name: 'All 48' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'New 12' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Contacted 20' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Converted 16' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Archived 3' })).toBeTruthy()
  })

  test('opens a lead from its row', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    const link = within(rowOf('Dwight Okafor')).getByRole('link', { name: 'Dwight Okafor' })
    expect(link.getAttribute('href')).toBe(`/admin/leads/${LEAD_A}`)
  })

  test('has no axe violations', async () => {
    stubApi(routes())
    const { container } = mount()
    await screen.findByText('Dwight Okafor')
    await screen.findByText('48 leads · 6 unowned · median 4h to first contact')
    await expectNoAxeViolations(container)
  })
})

describe('the leads list filters', () => {
  test('a status chip becomes the stage param', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    expect(lastList(calls).url.searchParams.has('stage')).toBe(false)
    expect(lastList(calls).url.searchParams.has('archived')).toBe(false)
    await user.click(screen.getByRole('radio', { name: /^Contacted/ }))
    await waitFor(() => expect(lastList(calls).url.searchParams.get('stage')).toBe('Contacted'))
  })

  test('the Archived chip asks for archived=true and no stage', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.click(screen.getByRole('radio', { name: /^Archived/ }))
    await waitFor(() => expect(lastList(calls).url.searchParams.get('archived')).toBe('true'))
    expect(lastList(calls).url.searchParams.has('stage')).toBe(false)
    expect(await screen.findByText('Rasheed Bowman')).toBeTruthy()
    expect(screen.queryByText('Dwight Okafor')).toBeNull()
  })

  test('the Source select sends the source id', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    expect(screen.getByRole('combobox', { name: 'Source' }).textContent).toContain('All sources')
    await choose('Source', 'Website')
    await waitFor(() =>
      expect(lastList(calls).url.searchParams.get('source_id')).toBe(sources[0].id)
    )
  })

  test('the Assigned to select sends the employee user id, or unassigned', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    expect(screen.getByRole('combobox', { name: 'Assigned to' }).textContent).toContain('Anyone')
    await choose('Assigned to', 'Renee')
    await waitFor(() =>
      expect(lastList(calls).url.searchParams.get('assigned_to')).toBe(USER_RENEE)
    )
    await choose('Assigned to', 'Unassigned')
    await waitFor(() =>
      expect(lastList(calls).url.searchParams.get('assigned_to')).toBe('unassigned')
    )
  })

  test('search by name, phone or email becomes the q param', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.type(screen.getByPlaceholderText('Name, phone or email'), 'okafor')
    await waitFor(() => expect(lastList(calls).url.searchParams.get('q')).toBe('okafor'), {
      timeout: 3000,
    })
  })

  test('Reset clears the filters back to All', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.click(screen.getByRole('radio', { name: /^Converted/ }))
    await waitFor(() => expect(lastList(calls).url.searchParams.get('stage')).toBe('Converted'))
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(lastList(calls).url.searchParams.has('stage')).toBe(false))
    expect(screen.getByRole('radio', { name: /^All/ }).getAttribute('aria-checked')).toBe('true')
  })

  test('the matching count follows the filtered list', async () => {
    const user = userEvent.setup()
    stubApi(
      routes({
        'GET /leads': (url: URL) =>
          pageOf(
            url.searchParams.get('stage') === 'Contacted'
              ? leads.filter((l) => l.lead_stage === 'Contacted')
              : leads,
            url
          ),
      })
    )
    mount()
    await screen.findByText('4 matching')
    await user.click(screen.getByRole('radio', { name: /^Contacted/ }))
    expect(await screen.findByText('2 matching')).toBeTruthy()
  })

  test('a status chip sends the sort and the page the server pages by', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    const params = lastList(calls).url.searchParams
    expect(params.get('sort')).toBe('created')
    expect(params.get('direction')).toBe('desc')
    expect(params.get('page')).toBe('1')
    expect(params.get('page_size')).toBeTruthy()
  })
})

describe('the leads table sort', () => {
  test('defaults to Created, newest first', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    const created = within(table()).getByRole('columnheader', { name: /Created/ })
    expect(created.getAttribute('aria-sort')).toBe('descending')
    expect(namesInOrder()).toEqual([
      'Dwight Okafor',
      'Celestine Marr',
      'Bartholomew Ng',
      'Inez Calloway',
    ])
  })

  test('Name sorts by name', async () => {
    const user = userEvent.setup()
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.click(within(table()).getByRole('button', { name: /^Name/ }))
    const name = within(table()).getByRole('columnheader', { name: /Name/ })
    expect(name.getAttribute('aria-sort')).toBe('ascending')
    expect(namesInOrder()).toEqual([
      'Bartholomew Ng',
      'Celestine Marr',
      'Dwight Okafor',
      'Inez Calloway',
    ])
  })

  test('Estimated value sorts by the priced total, unpriced last', async () => {
    const user = userEvent.setup()
    stubApi(routes())
    mount()
    await screen.findByText('$1,240')
    await user.click(within(table()).getByRole('button', { name: /^Estimated value/ }))
    const order = namesInOrder()
    expect(order.at(-1)).toBe('Bartholomew Ng')
    expect(order.slice(0, 3)).toEqual(
      within(table())
        .getByRole('columnheader', { name: /Estimated value/ })
        .getAttribute('aria-sort') === 'ascending'
        ? ['Inez Calloway', 'Dwight Okafor', 'Celestine Marr']
        : ['Celestine Marr', 'Dwight Okafor', 'Inez Calloway']
    )
  })
})

describe('the leads table selection actions', () => {
  const action = (name: string) => screen.getByRole('button', { name })

  test('with nothing selected only Export is enabled, and there is no Restore', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    expect(action('Export').hasAttribute('disabled')).toBe(false)
    expect(action('Assign').hasAttribute('disabled')).toBe(true)
    expect(action('Convert').hasAttribute('disabled')).toBe(true)
    expect(action('Delete').hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })

  test('a selection enables Export, Assign, Convert and Delete, and still no Restore', async () => {
    const user = userEvent.setup()
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.click(within(rowOf('Dwight Okafor')).getByRole('checkbox'))
    expect(action('Export').hasAttribute('disabled')).toBe(false)
    expect(action('Assign').hasAttribute('disabled')).toBe(false)
    expect(action('Convert').hasAttribute('disabled')).toBe(false)
    expect(action('Delete').hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })

  test('Delete archives every selected lead after the ruling 162 dialog', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.click(within(rowOf('Dwight Okafor')).getByRole('checkbox'))
    await user.click(within(rowOf('Celestine Marr')).getByRole('checkbox'))
    await user.click(action('Delete'))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('It moves to the archive and can be restored.')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(callsTo(calls, 'DELETE', `/leads/${LEAD_A}`)).toHaveLength(1)
      expect(callsTo(calls, 'DELETE', `/leads/${LEAD_B}`)).toHaveLength(1)
    })
  })

  test('Cancel in the dialog archives nothing', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.click(within(rowOf('Dwight Okafor')).getByRole('checkbox'))
    await user.click(action('Delete'))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
  })

  test('an archived selection offers Restore in place of Delete, and Restore restores', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    await user.click(screen.getByRole('radio', { name: /^Archived/ }))
    await screen.findByText('Rasheed Bowman')
    await user.click(within(rowOf('Rasheed Bowman')).getByRole('checkbox'))
    expect(action('Restore').hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    await user.click(action('Restore'))
    await waitFor(() =>
      expect(callsTo(calls, 'POST', `/leads/${archivedLeads[0].id}/restore`)).toHaveLength(1)
    )
  })
})

describe('the leads table pagination', () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    lead(`00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`, {
      name: `Lead ${String(i + 1).padStart(2, '0')}`,
      number: `LEAD-${5000 + i}`,
      created_at: new Date(NOW.getTime() - (i + 1) * DAY).toISOString(),
    })
  )

  test('pages a long list and keeps the full count in the footer', async () => {
    const user = userEvent.setup()
    stubApi(
      routes({
        'GET /leads': (url: URL) => pageOf(many, url),
        'GET /pricing/lead-estimates': [],
      })
    )
    mount()
    await screen.findByText('Lead 01')
    expect(screen.getByText('60 matching')).toBeTruthy()
    expect(document.querySelector('[data-part="count"]')?.textContent).toMatch(
      /Showing\s*1–\d+\s*of\s*60/
    )
    const firstPage = namesInOrder()
    expect(firstPage.length).toBeLessThan(60)
    await user.click(screen.getByRole('button', { name: 'Page 2' }))
    await waitFor(() => expect(namesInOrder()[0]).not.toBe(firstPage[0]))
    expect(firstPage).not.toContain(namesInOrder()[0])
  })
})

describe('the stat tiles', () => {
  test('every number comes from GET /leads/summary', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('Dwight Okafor')
    const tiles = await screen.findByTestId('lead-stat-tiles')
    await within(tiles).findByText('Response rate')
    expect(within(tiles).getByText('Text')).toBeTruthy()
    expect(within(tiles).getByText('71%')).toBeTruthy()
    expect(within(tiles).getByText('54%')).toBeTruthy()
    expect(within(tiles).getByText('38%')).toBeTruthy()
    expect(within(tiles).getByText('Conversion rate')).toBeTruthy()
    expect(within(tiles).getByText('15%')).toBeTruthy()
    expect(within(tiles).getByText(/target 24%/)).toBeTruthy()
    expect(within(tiles).getByText('Median time to first contact')).toBeTruthy()
    expect(within(tiles).getByText('4h 12m')).toBeTruthy()
    expect(within(tiles).getByText(/target 4h/)).toBeTruthy()
    expect(within(tiles).getByText('Needs attention')).toBeTruthy()
    expect(within(tiles).getByText('Unassigned')).toBeTruthy()
    expect(within(tiles).getByText('6')).toBeTruthy()
    expect(within(tiles).getByText('Not contacted')).toBeTruthy()
    expect(within(tiles).getByText('11')).toBeTruthy()
  })

  test('the tiles change when the summary changes, with the same rows', async () => {
    stubApi(
      routes({
        'GET /leads/summary': {
          ...summary,
          conversion: { ...summary.conversion, rate: 0.31 },
          first_contact: { median_hours: 1.5, target_hours: 4 },
        },
      })
    )
    mount()
    const tiles = await screen.findByTestId('lead-stat-tiles')
    expect(await within(tiles).findByText('31%')).toBeTruthy()
    expect(within(tiles).getByText('1h 30m')).toBeTruthy()
  })

  test('a summary with no contact yet shows a dash, not zero', async () => {
    stubApi(
      routes({
        'GET /leads/summary': {
          ...summary,
          totals: { ...summary.totals, median_hours_to_first_contact: null },
          first_contact: { median_hours: null, target_hours: 4 },
        },
      })
    )
    mount()
    const tiles = await screen.findByTestId('lead-stat-tiles')
    await within(tiles).findByText('Median time to first contact')
    expect(within(tiles).getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('48 leads · 6 unowned')).toBeTruthy()
  })
})

describe('the activity feed', () => {
  test('lists the lead events with actor and relative time', async () => {
    stubApi(routes())
    mount()
    const feed = await screen.findByTestId('lead-activity')
    expect(within(feed).getByText('Activity')).toBeTruthy()
    expect(await within(feed).findByText('Maryam Shahrokhi is a new lead')).toBeTruthy()
    expect(within(feed).getByText('Pedro Gonzalez · 12m ago')).toBeTruthy()
    expect(within(feed).getByText('Richard Meyer was contacted')).toBeTruthy()
    expect(within(feed).getByText('Dana Whitfield · 4h ago')).toBeTruthy()
    expect(within(feed).getByText('PG')).toBeTruthy()
  })
})

describe('the leads list states', () => {
  test('Loading shows a busy table and no empty state', async () => {
    stubApi(routes({ 'GET /leads': pending() }))
    mount()
    const busy = await screen.findAllByRole('status')
    expect(busy.length).toBeGreaterThan(0)
    expect(screen.queryByText('No leads here')).toBeNull()
    expect(screen.queryByText('Dwight Okafor')).toBeNull()
  })

  test('Empty explains and offers Clear filters', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes({ 'GET /leads': { rows: [], total: 0 } }))
    mount()
    expect(await screen.findByText('No leads here')).toBeTruthy()
    expect(screen.getByText('Clear the filters, or add a lead.')).toBeTruthy()
    expect(screen.getByText('0 matching')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /^New/ }))
    await waitFor(() => expect(lastList(calls).url.searchParams.get('stage')).toBe('New'))
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(lastList(calls).url.searchParams.has('stage')).toBe(false))
  })

  test('Error shows an alert and Try again refetches', async () => {
    const user = userEvent.setup()
    const calls = stubApi(routes({ 'GET /leads': fail(500, 'boom') }))
    mount()
    expect(await screen.findByRole('alert')).toBeTruthy()
    const before = leadCalls(calls).length
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(leadCalls(calls).length).toBeGreaterThan(before))
  })

  test('Mobile draws rows, not a table, with the priced value', async () => {
    desktop(false)
    stubApi(routes())
    mount()
    expect(await screen.findByText('Dwight Okafor')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(await screen.findByText('$1,240 est.')).toBeTruthy()
    expect(screen.getAllByText('Website').length).toBeGreaterThan(0)
  })

  test('Mobile has no axe violations', async () => {
    desktop(false)
    stubApi(routes())
    const { container } = mount()
    await screen.findByText('$1,240 est.')
    await expectNoAxeViolations(container)
  })
})
