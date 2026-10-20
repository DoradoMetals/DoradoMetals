'use client'

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import type {
  ActivityEntry,
  AdminUser,
  EstimateItem,
  EstimateItemImageAdd,
  EstimateItemImageView,
  EstimateItemPatch,
  EstimateItemView,
  LeadAssignBody,
  LeadAssignee,
  LeadConvertBody,
  LeadDocumentKind,
  LeadDocumentSent,
  LeadDocumentView,
  LeadEstimate,
  LeadEstimateTotal,
  LeadLookup,
  LeadPage,
  LeadPatch,
  LeadSort,
  LeadSortDirection,
  LeadStage,
  LeadSummary,
  LeadSummaryWindow,
  LeadTimeline,
  LeadView,
  NoteCreateBody,
  NoteView,
  PurityLookup,
  SmsMessageView,
  SmsThreadMessage,
  WeightUnitLookup,
} from '@dorado/contracts'

import { apiRequest, apiRequestBlob, apiRequestForm } from '../fetch'
import { keys } from '../keys'
import { uploadImage } from '../media/queries'

export type LeadListFilters = {
  stage?: LeadStage | null
  priority?: string | null
  source_id?: string | null
  assigned_to?: string | null
  q?: string | null
  archived?: boolean | null
  created_from?: string | null
  created_to?: string | null
  sort?: LeadSort | null
  direction?: LeadSortDirection | null
  page?: number | null
  page_size?: number | null
}

const listParams = (filters: LeadListFilters): Record<string, unknown> => ({
  ...filters,
  q: filters.q?.trim() || null,
  archived: filters.archived ? true : null,
})

export function useLeads(filters: LeadListFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery<LeadPage>({
    queryKey: keys.leads.list(filters),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<LeadPage>('GET', '/leads', undefined, listParams(filters)),
  })
}

export function exportLeads(filters: LeadListFilters = {}): Promise<Blob> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(listParams(filters))) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return apiRequestBlob('GET', query ? `/leads/export?${query}` : '/leads/export')
}

export function useLeadSummary(
  window: LeadSummaryWindow = {},
  options: { enabled?: boolean } = {}
) {
  return useQuery<LeadSummary>({
    queryKey: keys.leads.summary(window),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<LeadSummary>('GET', '/leads/summary', undefined, window),
  })
}

export function useLeadAssignees(options: { enabled?: boolean } = {}) {
  return useQuery<LeadAssignee[]>({
    queryKey: keys.leads.assignees(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<LeadAssignee[]>('GET', '/leads/assignees'),
  })
}

export function useLead(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<LeadView>({
    queryKey: keys.leads.one(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<LeadView>('GET', `/leads/${id}`),
  })
}

function useLookup<T>(kind: string, path: string) {
  return useQuery<T[]>({
    queryKey: keys.leads.lookups(kind),
    staleTime: Infinity,
    queryFn: () => apiRequest<T[]>('GET', path),
  })
}

export const useLeadSources = () => useLookup<LeadLookup>('sources', '/leads/sources')
export const useEstimateKinds = () =>
  useLookup<LeadLookup>('estimate_kinds', '/leads/estimate-kinds')
export const useContactPreferences = () =>
  useLookup<LeadLookup>('contact_preferences', '/leads/contact-preferences')
export const useWeightUnits = () =>
  useLookup<WeightUnitLookup>('weight_units', '/leads/weight-units')
export const usePurities = () => useLookup<PurityLookup>('purities', '/leads/purities')
export const useLeadDocumentKinds = () =>
  useLookup<LeadDocumentKind>('document_kinds', '/leads/document-kinds')

export function useEstimateItems(leadId: string, options: { enabled?: boolean } = {}) {
  return useQuery<EstimateItemView[]>({
    queryKey: keys.leads.items(leadId),
    enabled: (options.enabled ?? true) && leadId.length > 0,
    queryFn: () => apiRequest<EstimateItemView[]>('GET', `/leads/${leadId}/estimate/items`),
  })
}

export function useEstimateItemImages(
  leadId: string,
  itemId: string,
  options: { enabled?: boolean } = {}
) {
  return useQuery<EstimateItemImageView[]>({
    queryKey: keys.leads.itemImages(leadId, itemId),
    enabled: (options.enabled ?? true) && leadId.length > 0 && itemId.length > 0,
    queryFn: () =>
      apiRequest<EstimateItemImageView[]>(
        'GET',
        `/leads/${leadId}/estimate/items/${itemId}/images`
      ),
  })
}

export function useLeadEstimate(leadId: string, options: { enabled?: boolean } = {}) {
  return useQuery<LeadEstimate>({
    queryKey: keys.leads.estimate(leadId),
    enabled: (options.enabled ?? true) && leadId.length > 0,
    queryFn: () => apiRequest<LeadEstimate>('GET', `/pricing/lead-estimates/${leadId}`),
  })
}

export function useLeadEstimateTotals(
  leadIds: readonly string[],
  options: { enabled?: boolean } = {}
) {
  return useQuery<LeadEstimateTotal[]>({
    queryKey: keys.leads.estimates(leadIds),
    enabled: (options.enabled ?? true) && leadIds.length > 0,
    queryFn: () =>
      apiRequest<LeadEstimateTotal[]>('GET', '/pricing/lead-estimates', undefined, {
        lead_ids: leadIds,
      }),
  })
}

export function useLeadDocuments(leadId: string, options: { enabled?: boolean } = {}) {
  return useQuery<LeadDocumentView[]>({
    queryKey: keys.leads.documents(leadId),
    enabled: (options.enabled ?? true) && leadId.length > 0,
    queryFn: () => apiRequest<LeadDocumentView[]>('GET', `/leads/${leadId}/documents`),
  })
}

export function leadDocumentUrl(leadId: string, pdfId: string): Promise<string> {
  return apiRequest<string>('GET', `/leads/${leadId}/documents/${pdfId}/url`)
}

export function useLeadTimeline(leadId: string, options: { enabled?: boolean } = {}) {
  return useQuery<LeadTimeline[]>({
    queryKey: keys.leads.timeline(leadId),
    enabled: (options.enabled ?? true) && leadId.length > 0,
    queryFn: () => apiRequest<LeadTimeline[]>('GET', `/leads/${leadId}/timeline`),
  })
}

export function useLeadMessages(
  leadId: string,
  number: string | null,
  options: { enabled?: boolean } = {}
) {
  return useQuery<SmsThreadMessage[]>({
    queryKey: keys.leads.messages(leadId),
    enabled: (options.enabled ?? true) && !!number,
    queryFn: () => apiRequest<SmsThreadMessage[]>('GET', '/sms', undefined, { number }),
  })
}

export function useLeadNotes(leadId: string, options: { enabled?: boolean } = {}) {
  return useQuery<NoteView[]>({
    queryKey: keys.leads.notes(leadId),
    enabled: (options.enabled ?? true) && leadId.length > 0,
    queryFn: () => apiRequest<NoteView[]>('GET', '/notes', undefined, { lead_id: leadId }),
  })
}

export function useLeadActivity(
  page: { limit?: number | null } = {},
  options: { enabled?: boolean } = {}
) {
  return useQuery<ActivityEntry[]>({
    queryKey: keys.leads.activity(page),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<ActivityEntry[]>('GET', '/activity', undefined, page),
  })
}

const leadKeys = () => [
  keys.leads.lists(),
  keys.leads.summaries(),
  keys.leads.ones(),
  keys.leads.activities(),
  keys.leads.assignees(),
  keys.leads.priced(),
]

function useLeadWrite<TVariables, TResult>(
  run: (variables: TVariables) => Promise<TResult>,
  refresh: () => readonly QueryKey[]
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      for (const queryKey of refresh()) client.invalidateQueries({ queryKey })
    },
  })
}

export function useCreateLead() {
  return useLeadWrite((lead: LeadPatch) => apiRequest<LeadView>('POST', '/leads', lead), leadKeys)
}

export function usePatchLead(id: string) {
  return useLeadWrite(
    (patch: LeadPatch) => apiRequest<LeadView>('PATCH', `/leads/${id}`, patch),
    leadKeys
  )
}

export function useArchiveLead() {
  return useLeadWrite(
    (id: string) => apiRequest<{ message: string }>('DELETE', `/leads/${id}`),
    leadKeys
  )
}

export function useArchiveLeads() {
  return useLeadWrite(async (ids: string[]) => {
    for (const id of ids) await apiRequest<{ message: string }>('DELETE', `/leads/${id}`)
  }, leadKeys)
}

export function useRestoreLeads() {
  return useLeadWrite(async (ids: string[]) => {
    for (const id of ids) await apiRequest<LeadView>('POST', `/leads/${id}/restore`, {})
  }, leadKeys)
}

export function useExportLeads() {
  return useMutation({ mutationFn: (filters: LeadListFilters) => exportLeads(filters) })
}

export function useLeadDocumentUrl(leadId: string) {
  return useMutation({ mutationFn: (pdfId: string) => leadDocumentUrl(leadId, pdfId) })
}

export function useRestoreLead() {
  return useLeadWrite(
    (id: string) => apiRequest<LeadView>('POST', `/leads/${id}/restore`, {}),
    leadKeys
  )
}

export function useAssignLeads() {
  return useLeadWrite(
    (body: LeadAssignBody) => apiRequest<LeadView[]>('POST', '/leads/assign', body),
    leadKeys
  )
}

export function useConvertLead(id: string) {
  return useLeadWrite(
    (body: LeadConvertBody) => apiRequest<AdminUser>('POST', `/leads/${id}/convert`, body),
    leadKeys
  )
}

const estimateKeys = (leadId: string) => () => [
  keys.leads.items(leadId),
  keys.leads.estimate(leadId),
  keys.leads.priced(),
  keys.leads.timeline(leadId),
]

export function useAddEstimateItem(leadId: string) {
  return useLeadWrite(
    (item: EstimateItemPatch) =>
      apiRequest<EstimateItem>('POST', `/leads/${leadId}/estimate/items`, item),
    estimateKeys(leadId)
  )
}

export function usePatchEstimateItem(leadId: string) {
  return useLeadWrite(
    ({ item_id, patch }: { item_id: string; patch: EstimateItemPatch }) =>
      apiRequest<EstimateItem>('PATCH', `/leads/${leadId}/estimate/items/${item_id}`, patch),
    estimateKeys(leadId)
  )
}

export function useRemoveEstimateItem(leadId: string) {
  return useLeadWrite(
    (itemId: string) =>
      apiRequest<{ message: string }>('DELETE', `/leads/${leadId}/estimate/items/${itemId}`),
    estimateKeys(leadId)
  )
}

export function useRemoveEstimateItems(leadId: string) {
  return useLeadWrite(async (itemIds: string[]) => {
    for (const itemId of itemIds) {
      await apiRequest<{ message: string }>('DELETE', `/leads/${leadId}/estimate/items/${itemId}`)
    }
  }, estimateKeys(leadId))
}

export function useAddEstimateItemImage(leadId: string, itemId: string) {
  return useLeadWrite(
    (body: EstimateItemImageAdd) =>
      apiRequest<EstimateItemImageView[]>(
        'POST',
        `/leads/${leadId}/estimate/items/${itemId}/images`,
        body
      ),
    () => [keys.leads.itemImages(leadId, itemId), keys.leads.items(leadId)]
  )
}

export function useAttachEstimateItemImages(leadId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ item_id, files }: { item_id: string; files: File[] }) => {
      for (const file of files) {
        const image_id = await uploadImage(file)
        await apiRequest<EstimateItemImageView[]>(
          'POST',
          `/leads/${leadId}/estimate/items/${item_id}/images`,
          { image_id }
        )
      }
    },
    onSettled: (_data, _error, variables) => {
      client.invalidateQueries({ queryKey: keys.leads.itemImages(leadId, variables.item_id) })
      client.invalidateQueries({ queryKey: keys.leads.items(leadId) })
    },
  })
}

export function useRemoveEstimateItemImage(leadId: string, itemId: string) {
  return useLeadWrite(
    (imageId: string) =>
      apiRequest<EstimateItemImageView[]>(
        'DELETE',
        `/leads/${leadId}/estimate/items/${itemId}/images/${imageId}`
      ),
    () => [keys.leads.itemImages(leadId, itemId), keys.leads.items(leadId)]
  )
}

export function useUploadLeadDocument(leadId: string) {
  return useLeadWrite(
    (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return apiRequestForm<LeadDocumentView>('POST', `/leads/${leadId}/documents`, form)
    },
    () => [keys.leads.documents(leadId)]
  )
}

export function useRemoveLeadDocument(leadId: string) {
  return useLeadWrite(
    (pdfId: string) =>
      apiRequest<LeadDocumentView[]>('DELETE', `/leads/${leadId}/documents/${pdfId}`),
    () => [keys.leads.documents(leadId)]
  )
}

export function useSendLeadDocument(leadId: string) {
  return useLeadWrite(
    (pdfId: string) =>
      apiRequest<LeadDocumentSent>('POST', `/leads/${leadId}/documents/${pdfId}/send`, {}),
    () => [keys.leads.messages(leadId), keys.leads.timeline(leadId)]
  )
}

export function useSendLeadMessage(leadId: string) {
  return useLeadWrite(
    (message: { body: string; image_ids?: string[] }) =>
      apiRequest<SmsMessageView>('POST', '/sms', { lead_id: leadId, ...message }),
    () => [keys.leads.messages(leadId), keys.leads.timeline(leadId)]
  )
}

export function useRequestLeadConsent(leadId: string) {
  return useLeadWrite(
    () => apiRequest<SmsMessageView>('POST', '/sms/consent_request', { lead_id: leadId }),
    () => [keys.leads.messages(leadId), keys.leads.one(leadId)]
  )
}

export function useAddLeadNote(leadId: string) {
  return useLeadWrite(
    (note: NoteCreateBody) => apiRequest<NoteView>('POST', '/notes', { lead_id: leadId, ...note }),
    () => [keys.leads.notes(leadId), keys.leads.timeline(leadId)]
  )
}
