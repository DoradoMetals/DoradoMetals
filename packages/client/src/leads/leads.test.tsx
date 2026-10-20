import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as client from '../index'
import { keys } from '../keys'
import {
  useAddEstimateItem,
  useAddEstimateItemImage,
  useAddLeadNote,
  useArchiveLead,
  useContactPreferences,
  useConvertLead,
  useCreateLead,
  useEstimateItemImages,
  useEstimateItems,
  useEstimateKinds,
  useLead,
  useLeadActivity,
  useLeadDocumentKinds,
  useLeadDocuments,
  useLeadEstimate,
  useLeadEstimateTotals,
  useLeadMessages,
  useLeadNotes,
  useLeads,
  useLeadSources,
  useLeadSummary,
  useLeadTimeline,
  usePatchEstimateItem,
  usePatchLead,
  usePurities,
  useRemoveEstimateItem,
  useRemoveEstimateItemImage,
  useRemoveLeadDocument,
  useRequestLeadConsent,
  useRestoreLead,
  useSendLeadMessage,
  useUploadLeadDocument,
  useWeightUnits,
} from './index'

const LEAD = '00000000-0000-4000-8000-00000000000a'
const ITEM = '00000000-0000-4000-8000-00000000000b'
const IMAGE = '00000000-0000-4000-8000-00000000000c'
const OTHER = '00000000-0000-4000-8000-00000000000d'
const USER = '00000000-0000-4000-8000-00000000000e'

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }

const respond = (body: unknown = {}, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

type Call = [string, { method: string; body?: unknown }]

const callOf = (mock: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = mock.mock.calls[index] as unknown as Call
  return {
    url: String(url),
    method: init.method,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
  }
}

const paramsOf = (url: string) => new URL(url, 'http://x').searchParams
const pathOf = (url: string) => new URL(url, 'http://x').pathname

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the package entry', () => {
  it('exports the lead and media hooks', () => {
    expect(typeof client.useLeads).toBe('function')
    expect(typeof client.useSendLeadMessage).toBe('function')
    expect(typeof client.useUploadImage).toBe('function')
    expect(typeof client.useImageUrl).toBe('function')
  })
})

describe('lead keys', () => {
  it('nests every lead read under the leads root', () => {
    expect(keys.leads.all()).toEqual(['leads'])
    expect(keys.leads.list({ archived: true })).toEqual(['leads', 'list', { archived: true }])
    expect(keys.leads.lists()).toEqual(['leads', 'list'])
    expect(keys.leads.summaries()).toEqual(['leads', 'summary'])
    expect(keys.leads.one(LEAD)).toEqual(['leads', 'one', LEAD])
    expect(keys.leads.summary({})).toEqual(['leads', 'summary', {}])
    expect(keys.leads.lookups('sources')).toEqual(['leads', 'lookups', 'sources'])
    expect(keys.leads.items(LEAD)).toEqual(['leads', 'items', LEAD])
    expect(keys.leads.itemImages(LEAD, ITEM)).toEqual(['leads', 'item_images', LEAD, ITEM])
    expect(keys.leads.estimate(LEAD)).toEqual(['leads', 'estimate', LEAD])
    expect(keys.leads.estimates([LEAD, OTHER])).toEqual(['leads', 'estimates', [LEAD, OTHER]])
    expect(keys.leads.documents(LEAD)).toEqual(['leads', 'documents', LEAD])
    expect(keys.leads.timeline(LEAD)).toEqual(['leads', 'timeline', LEAD])
    expect(keys.leads.messages(LEAD)).toEqual(['leads', 'messages', LEAD])
    expect(keys.leads.notes(LEAD)).toEqual(['leads', 'notes', LEAD])
    expect(keys.leads.activity({ limit: 20 })).toEqual(['leads', 'activity', { limit: 20 }])
  })
})

describe('lead reads', () => {
  const reads: [string, () => unknown, string][] = [
    ['one', () => useLead(LEAD), `/leads/${LEAD}`],
    ['sources', () => useLeadSources(), '/leads/sources'],
    ['estimate kinds', () => useEstimateKinds(), '/leads/estimate-kinds'],
    ['contact preferences', () => useContactPreferences(), '/leads/contact-preferences'],
    ['weight units', () => useWeightUnits(), '/leads/weight-units'],
    ['purities', () => usePurities(), '/leads/purities'],
    ['document kinds', () => useLeadDocumentKinds(), '/leads/document-kinds'],
    ['estimate items', () => useEstimateItems(LEAD), `/leads/${LEAD}/estimate/items`],
    [
      'item images',
      () => useEstimateItemImages(LEAD, ITEM),
      `/leads/${LEAD}/estimate/items/${ITEM}/images`,
    ],
    ['priced estimate', () => useLeadEstimate(LEAD), `/pricing/lead-estimates/${LEAD}`],
    ['documents', () => useLeadDocuments(LEAD), `/leads/${LEAD}/documents`],
    ['timeline', () => useLeadTimeline(LEAD), `/leads/${LEAD}/timeline`],
  ]

  it.each(reads)('reads %s with a GET', async (_name, hook, url) => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(hook as () => { isSuccess: boolean }, {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock)).toMatchObject({ method: 'GET', url })
  })

  it('lists the open leads with no archived param by default', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useLeads({}), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const { url, method } = callOf(fetchMock)
    expect(method).toBe('GET')
    expect(pathOf(url)).toBe('/leads')
    expect(paramsOf(url).has('archived')).toBe(false)
  })

  it('sends every list filter as a query param', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(
      () =>
        useLeads({
          stage: 'Contacted',
          source_id: '00000000-0000-4000-8000-0000000000a1',
          assigned_to: 'unassigned',
          q: 'okafor',
          archived: false,
        }),
      { wrapper: wrapperFor(newClient()) }
    )
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const params = paramsOf(callOf(fetchMock).url)
    expect(params.get('stage')).toBe('Contacted')
    expect(params.get('source_id')).toBe('00000000-0000-4000-8000-0000000000a1')
    expect(params.get('assigned_to')).toBe('unassigned')
    expect(params.get('q')).toBe('okafor')
  })

  it('asks for the archived leads with archived=true', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useLeads({ archived: true }), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    expect(paramsOf(callOf(fetchMock).url).get('archived')).toBe('true')
  })

  it('keys the list by its filters', async () => {
    vi.stubGlobal('fetch', respond([]))
    const client = newClient()
    const result = renderHook(() => useLeads({ archived: true }), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    expect(client.getQueryData(keys.leads.list({ archived: true }))).toEqual([])
  })

  it('reads the summary with the created window', async () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(
      () => useLeadSummary({ created_from: '2026-09-01', created_to: '2026-10-01' }),
      { wrapper: wrapperFor(newClient()) }
    )
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const { url, method } = callOf(fetchMock)
    expect(method).toBe('GET')
    expect(pathOf(url)).toBe('/leads/summary')
    expect(paramsOf(url).get('created_from')).toBe('2026-09-01')
    expect(paramsOf(url).get('created_to')).toBe('2026-10-01')
  })

  it('reads the summary with no params when no window is set', async () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useLeadSummary({}), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).url).toBe('/leads/summary')
  })

  it('prices the listed leads in one read', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useLeadEstimateTotals([LEAD, OTHER]), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const { url } = callOf(fetchMock)
    expect(pathOf(url)).toBe('/pricing/lead-estimates')
    expect(paramsOf(url).getAll('lead_ids')).toEqual([LEAD, OTHER])
  })

  it('reads the thread by the lead number', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useLeadMessages(LEAD, '+15125550307'), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const { url } = callOf(fetchMock)
    expect(pathOf(url)).toBe('/sms')
    expect(paramsOf(url).get('number')).toBe('+15125550307')
  })

  it('reads the lead notes by lead id', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useLeadNotes(LEAD), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const { url } = callOf(fetchMock)
    expect(pathOf(url)).toBe('/notes')
    expect(paramsOf(url).get('lead_id')).toBe(LEAD)
  })

  it('reads the activity feed with its limit', async () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useLeadActivity({ limit: 20 }), {
      wrapper: wrapperFor(newClient()),
    })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    const { url } = callOf(fetchMock)
    expect(pathOf(url)).toBe('/activity')
    expect(paramsOf(url).get('limit')).toBe('20')
  })

  it('stays idle with no id, no number or no leads to price', () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = wrapperFor(newClient())
    renderHook(() => useLead(''), { wrapper })
    renderHook(() => useEstimateItems(''), { wrapper })
    renderHook(() => useEstimateItemImages(LEAD, ''), { wrapper })
    renderHook(() => useLeadMessages(LEAD, null), { wrapper })
    renderHook(() => useLeadEstimateTotals([]), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('lead writes', () => {
  const writes: [
    string,
    () => { mutateAsync: (v: never) => Promise<unknown> },
    unknown,
    string,
    string,
    unknown,
  ][] = [
    [
      'create',
      () => useCreateLead(),
      { name: 'Dwight Okafor', phone: '+15125550307', email: 'd.okafor@gmail.com' },
      'POST',
      '/leads',
      { name: 'Dwight Okafor', phone: '+15125550307', email: 'd.okafor@gmail.com' },
    ],
    [
      'patch',
      () => usePatchLead(LEAD),
      { assigned_to_id: USER },
      'PATCH',
      `/leads/${LEAD}`,
      { assigned_to_id: USER },
    ],
    [
      'patch carrying a location',
      () => usePatchLead(LEAD),
      { city: 'Austin', state: 'TX' },
      'PATCH',
      `/leads/${LEAD}`,
      { city: 'Austin', state: 'TX' },
    ],
    [
      'patch clearing a location',
      () => usePatchLead(LEAD),
      { city: null, state: null },
      'PATCH',
      `/leads/${LEAD}`,
      { city: null, state: null },
    ],
    ['archive', () => useArchiveLead(), LEAD, 'DELETE', `/leads/${LEAD}`, undefined],
    ['restore', () => useRestoreLead(), LEAD, 'POST', `/leads/${LEAD}/restore`, {}],
    [
      'convert carrying the estimate',
      () => useConvertLead(LEAD),
      { email: 'd.okafor@gmail.com', carry_estimate: true },
      'POST',
      `/leads/${LEAD}/convert`,
      { email: 'd.okafor@gmail.com', carry_estimate: true },
    ],
    [
      'add estimate item',
      () => useAddEstimateItem(LEAD),
      { kind_id: OTHER, metal_id: 'Gold', weight: 12, unit_id: USER, purity_id: IMAGE },
      'POST',
      `/leads/${LEAD}/estimate/items`,
      { kind_id: OTHER, metal_id: 'Gold', weight: 12, unit_id: USER, purity_id: IMAGE },
    ],
    [
      'patch estimate item',
      () => usePatchEstimateItem(LEAD),
      { item_id: ITEM, patch: { weight: 8.4 } },
      'PATCH',
      `/leads/${LEAD}/estimate/items/${ITEM}`,
      { weight: 8.4 },
    ],
    [
      'remove estimate item',
      () => useRemoveEstimateItem(LEAD),
      ITEM,
      'DELETE',
      `/leads/${LEAD}/estimate/items/${ITEM}`,
      undefined,
    ],
    [
      'link an item image',
      () => useAddEstimateItemImage(LEAD, ITEM),
      { image_id: IMAGE },
      'POST',
      `/leads/${LEAD}/estimate/items/${ITEM}/images`,
      { image_id: IMAGE },
    ],
    [
      'unlink an item image',
      () => useRemoveEstimateItemImage(LEAD, ITEM),
      IMAGE,
      'DELETE',
      `/leads/${LEAD}/estimate/items/${ITEM}/images/${IMAGE}`,
      undefined,
    ],
    [
      'remove a document',
      () => useRemoveLeadDocument(LEAD),
      IMAGE,
      'DELETE',
      `/leads/${LEAD}/documents/${IMAGE}`,
      undefined,
    ],
    [
      'send a text with images',
      () => useSendLeadMessage(LEAD),
      { body: 'Here is the photo', image_ids: [IMAGE] },
      'POST',
      '/sms',
      { lead_id: LEAD, body: 'Here is the photo', image_ids: [IMAGE] },
    ],
    [
      'send a text',
      () => useSendLeadMessage(LEAD),
      { body: 'Hi Dwight' },
      'POST',
      '/sms',
      { lead_id: LEAD, body: 'Hi Dwight' },
    ],
    [
      'request consent',
      () => useRequestLeadConsent(LEAD),
      undefined,
      'POST',
      '/sms/consent_request',
      { lead_id: LEAD },
    ],
    [
      'add a note',
      () => useAddLeadNote(LEAD),
      { body: 'Call after 5pm' },
      'POST',
      '/notes',
      { lead_id: LEAD, body: 'Call after 5pm' },
    ],
  ]

  it.each(writes)('%s', async (_name, hook, variables, method, url, body) => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(hook, { wrapper: wrapperFor(newClient()) })
    await result.result.current.mutateAsync(variables as never)
    expect(callOf(fetchMock)).toEqual({ method, url, body })
  })

  it('uploads a document as multipart form data', async () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useUploadLeadDocument(LEAD), {
      wrapper: wrapperFor(newClient()),
    })
    const file = new File(['%PDF-1.4'], 'quote.pdf', { type: 'application/pdf' })
    await result.result.current.mutateAsync(file)
    const { url, method, body } = callOf(fetchMock)
    expect(method).toBe('POST')
    expect(url).toBe(`/leads/${LEAD}/documents`)
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('rejects with the API status', async () => {
    vi.stubGlobal('fetch', respond({ message: 'no such lead' }, 404))
    const result = renderHook(() => useRestoreLead(), { wrapper: wrapperFor(newClient()) })
    await expect(result.result.current.mutateAsync(LEAD)).rejects.toMatchObject({
      status: 404,
      message: 'no such lead',
    })
  })
})

describe('lead invalidations', () => {
  const invalidations: [
    string,
    () => { mutateAsync: (v: never) => Promise<unknown> },
    unknown,
    readonly unknown[][],
  ][] = [
    [
      'create',
      () => useCreateLead(),
      { name: 'A' },
      [[...keys.leads.lists()], [...keys.leads.summaries()]],
    ],
    [
      'patch',
      () => usePatchLead(LEAD),
      { name: 'A' },
      [[...keys.leads.lists()], [...keys.leads.summaries()]],
    ],
    [
      'archive',
      () => useArchiveLead(),
      LEAD,
      [[...keys.leads.lists()], [...keys.leads.summaries()]],
    ],
    [
      'restore',
      () => useRestoreLead(),
      LEAD,
      [[...keys.leads.lists()], [...keys.leads.summaries()]],
    ],
    [
      'convert',
      () => useConvertLead(LEAD),
      { carry_estimate: false },
      [[...keys.leads.lists()], [...keys.leads.summaries()]],
    ],
    [
      'add estimate item',
      () => useAddEstimateItem(LEAD),
      { weight: 1 },
      [[...keys.leads.items(LEAD)], [...keys.leads.estimate(LEAD)]],
    ],
    [
      'patch estimate item',
      () => usePatchEstimateItem(LEAD),
      { item_id: ITEM, patch: { weight: 1 } },
      [[...keys.leads.items(LEAD)], [...keys.leads.estimate(LEAD)]],
    ],
    [
      'remove estimate item',
      () => useRemoveEstimateItem(LEAD),
      ITEM,
      [[...keys.leads.items(LEAD)], [...keys.leads.estimate(LEAD)]],
    ],
    [
      'link an item image',
      () => useAddEstimateItemImage(LEAD, ITEM),
      { image_id: IMAGE },
      [[...keys.leads.itemImages(LEAD, ITEM)], [...keys.leads.items(LEAD)]],
    ],
    [
      'unlink an item image',
      () => useRemoveEstimateItemImage(LEAD, ITEM),
      IMAGE,
      [[...keys.leads.itemImages(LEAD, ITEM)], [...keys.leads.items(LEAD)]],
    ],
    [
      'upload a document',
      () => useUploadLeadDocument(LEAD),
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
      [[...keys.leads.documents(LEAD)]],
    ],
    [
      'remove a document',
      () => useRemoveLeadDocument(LEAD),
      IMAGE,
      [[...keys.leads.documents(LEAD)]],
    ],
    [
      'send a text',
      () => useSendLeadMessage(LEAD),
      { body: 'x' },
      [[...keys.leads.messages(LEAD)], [...keys.leads.timeline(LEAD)]],
    ],
    [
      'request consent',
      () => useRequestLeadConsent(LEAD),
      undefined,
      [[...keys.leads.messages(LEAD)], [...keys.leads.one(LEAD)]],
    ],
    [
      'add a note',
      () => useAddLeadNote(LEAD),
      { body: 'x' },
      [[...keys.leads.notes(LEAD)], [...keys.leads.timeline(LEAD)]],
    ],
  ]

  it.each(invalidations)('%s refreshes the reads it changes', async (_n, hook, vars, expected) => {
    vi.stubGlobal('fetch', respond({}))
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const result = renderHook(hook, { wrapper: wrapperFor(client) })
    await result.result.current.mutateAsync(vars as never)
    for (const queryKey of expected) {
      await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey }))
    }
  })

  it('a lead write leaves the lookups alone', async () => {
    vi.stubGlobal('fetch', respond({}))
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const result = renderHook(() => usePatchLead(LEAD), { wrapper: wrapperFor(client) })
    await result.result.current.mutateAsync({ name: 'A' } as never)
    await waitFor(() => expect(spy).toHaveBeenCalled())
    for (const [args] of spy.mock.calls) {
      expect((args as { queryKey: unknown[] }).queryKey).not.toEqual(keys.leads.all())
      expect((args as { queryKey: unknown[] }).queryKey[1]).not.toBe('lookups')
    }
  })

  it('a lead write also drops the priced list so the value column refreshes', async () => {
    vi.stubGlobal('fetch', respond({}))
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const result = renderHook(() => useAddEstimateItem(LEAD), { wrapper: wrapperFor(client) })
    await result.result.current.mutateAsync({ weight: 1 } as never)
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['leads', 'estimates'] }))
  })
})
