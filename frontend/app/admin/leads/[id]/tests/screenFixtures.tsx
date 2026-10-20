import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LeadScreen } from '../_components'
import {
  CONTACT_TEXT,
  IMAGE_IN,
  IMAGE_OUT,
  ITEM_1,
  ITEM_2,
  ITEM_3,
  LEAD_A,
  SOURCE_TRADE,
  archivedLeads,
  contactPreferences,
  documents,
  employees,
  estimate,
  estimateKinds,
  itemImages,
  items,
  lead,
  messages,
  purities,
  sources,
  timeline,
  uploadRoutes,
  weightUnits,
  type Routes,
} from '../../tests/fixtures'

export const dwight = lead(LEAD_A, {
  created_at: '2026-09-09T17:00:00.000Z',
  source_id: SOURCE_TRADE,
  notes: 'Inherited a box of estate jewellery. Wants a quote before shipping. Call after 5pm.',
  contact_preference_id: CONTACT_TEXT,
  last_contacted: '2026-09-10T15:06:00.000Z',
  sms_consent_at: '2026-09-09T17:30:00.000Z',
  sms_consent_method: 'verbal',
})

export const archivedDwight = { ...dwight, archived_at: archivedLeads[0].archived_at }

export function leadRoutes(over: Routes = {}): Routes {
  return {
    [`GET /leads/${LEAD_A}`]: dwight,
    [`PATCH /leads/${LEAD_A}`]: (_u: URL, body: unknown) => ({ ...dwight, ...(body as object) }),
    [`DELETE /leads/${LEAD_A}`]: { message: 'Lead archived' },
    [`POST /leads/${LEAD_A}/restore`]: dwight,
    [`POST /leads/${LEAD_A}/convert`]: { id: '00000000-0000-4000-8000-000000000999' },
    [`GET /leads/${LEAD_A}/estimate/items`]: items,
    [`POST /leads/${LEAD_A}/estimate/items`]: items[0],
    [`DELETE /leads/${LEAD_A}/estimate/items/${ITEM_1}`]: { message: 'Estimate item deleted' },
    [`DELETE /leads/${LEAD_A}/estimate/items/${ITEM_2}`]: { message: 'Estimate item deleted' },
    [`DELETE /leads/${LEAD_A}/estimate/items/${ITEM_3}`]: { message: 'Estimate item deleted' },
    [`GET /leads/${LEAD_A}/estimate/items/${ITEM_1}/images`]: itemImages,
    [`GET /leads/${LEAD_A}/estimate/items/${ITEM_2}/images`]: [],
    [`POST /leads/${LEAD_A}/estimate/items/${ITEM_2}/images`]: [],
    [`GET /pricing/lead-estimates/${LEAD_A}`]: estimate,
    [`GET /leads/${LEAD_A}/timeline`]: timeline,
    [`GET /leads/${LEAD_A}/documents`]: documents,
    'GET /leads/sources': sources,
    'GET /leads/estimate-kinds': estimateKinds,
    'GET /leads/weight-units': weightUnits,
    'GET /leads/purities': purities,
    'GET /leads/contact-preferences': contactPreferences,
    'GET /leads/document-kinds': [{ kind: 'rate_sheet', name: 'Rates Sheet' }],
    'GET /employees': employees,
    'GET /notes': [],
    'GET /sms': messages,
    'POST /sms': messages[0],
    [`GET /images/${IMAGE_IN}/url`]: 'https://img.example/in.jpg',
    [`GET /images/${IMAGE_OUT}/url`]: 'https://img.example/out.jpg',
    ...uploadRoutes(),
    ...over,
  }
}

export function mountLead() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LeadScreen leadId={LEAD_A} />
    </QueryClientProvider>
  )
}

export const card = (name: string) => screen.getByTestId(`lead-card-${name}`)
export const findCard = (name: string) => screen.findByTestId(`lead-card-${name}`)
