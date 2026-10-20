'use client'

import * as React from 'react'
import { Alert, Skeleton, useMediaUp } from '@dorado/components'
import type {
  LeadDocumentKind,
  LeadLookup,
  PurityLookup,
  WeightUnitLookup,
} from '@dorado/contracts'

import { ConvertLeadFlow, DeleteLeadDialog } from '../../_components'
import { formatShortDate } from '../../_lib'
import {
  useAddItem,
  useArchive,
  useAttachImages,
  useDocumentKinds,
  useDocuments,
  useItems,
  useKinds,
  useLeadRecord,
  useDocumentUrl,
  usePatch,
  usePreferenceLabels,
  usePricedEstimate,
  usePurityLabels,
  useRemoveItems,
  useRestore,
  useSendDocument,
  useSendText,
  useSourceLabels,
  useStaff,
  useThread,
  useTimeline,
  useUnits,
  useUploadPhoto,
} from '../_api'
import { ContactCard } from './ContactCard'
import { DetailsCard } from './DetailsCard'
import { DocumentsCard } from './DocumentsCard'
import { EditContactDrawer } from './EditContactDrawer'
import { EstimateCard } from './EstimateCard'
import { LeadHeader } from './LeadHeader'
import { MessagesCard } from './MessagesCard'
import { TimelineCard } from './TimelineCard'

const NO_LOOKUPS: LeadLookup[] = []
const NO_UNITS: WeightUnitLookup[] = []
const NO_PURITIES: PurityLookup[] = []
const NO_KINDS: LeadDocumentKind[] = []

export function LeadScreen({ leadId }: { leadId: string }) {
  const mobile = !useMediaUp('lg')
  const layout = mobile ? 'mobile' : 'desktop'

  const lead = useLeadRecord(leadId)
  const items = useItems(leadId)
  const estimate = usePricedEstimate(leadId, (items.data?.length ?? 0) > 0)
  const kinds = useKinds().data ?? NO_LOOKUPS
  const units = useUnits().data ?? NO_UNITS
  const purities = usePurityLabels().data ?? NO_PURITIES
  const sources = useSourceLabels().data ?? NO_LOOKUPS
  const preferences = usePreferenceLabels().data ?? NO_LOOKUPS
  const staff = (useStaff().data ?? []).filter((employee) => employee.enabled)
  const timeline = useTimeline(leadId)
  const thread = useThread(leadId, lead.data?.phone ?? null)
  const documents = useDocuments(leadId)
  const documentKinds = useDocumentKinds().data ?? NO_KINDS

  const patch = usePatch(leadId)
  const archive = useArchive()
  const restore = useRestore()
  const addItem = useAddItem(leadId)
  const removeItems = useRemoveItems(leadId)
  const attach = useAttachImages(leadId)
  const uploadPhoto = useUploadPhoto()
  const sendText = useSendText(leadId)
  const sendDocument = useSendDocument(leadId)
  const documentUrl = useDocumentUrl(leadId)

  const [deleting, setDeleting] = React.useState(false)
  const [converting, setConverting] = React.useState(false)
  const [editingContact, setEditingContact] = React.useState(false)

  if (lead.isPending) {
    return (
      <div role="status" aria-label="Loading lead" className="flex flex-col gap-md">
        <Skeleton className="h-[155px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    )
  }

  if (lead.isError) {
    return (
      <Alert intent="danger" title="Couldn't load this lead">
        {lead.error.message}
      </Alert>
    )
  }

  const record = lead.data
  const staffItems = staff.map((employee) => ({ value: employee.user_id, label: employee.name }))
  const preference =
    preferences.find((row) => row.id === record.contact_preference_id)?.label ?? null

  return (
    <>
      <LeadHeader
        layout={layout}
        lead={record}
        assignees={staffItems}
        onAssign={(userId) => patch.mutate({ assigned_to_id: userId })}
        onConvert={() => setConverting(true)}
        onDelete={() => setDeleting(true)}
        onRestore={() => restore.mutate(record.id)}
        pending={archive.isPending || restore.isPending}
      />

      <div className="grid grid-cols-1 items-start gap-md lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-lg">
        <div className="flex min-w-0 flex-col gap-md lg:gap-lg">
          <EstimateCard
            layout={layout}
            leadId={leadId}
            items={items.data}
            estimate={estimate.data}
            failed={items.isError}
            onRetry={() => items.refetch()}
            kinds={kinds}
            units={units}
            purities={purities}
            adding={addItem.isPending}
            onAdd={(item, done) => addItem.mutate(item, { onSuccess: done })}
            onRemove={(ids) => removeItems.mutate(ids)}
            attaching={attach.isPending}
            onAttach={(itemId, files, done) =>
              attach.mutate({ item_id: itemId, files }, { onSuccess: done })
            }
          />
          <DetailsCard
            lead={record}
            sources={sources.map((row) => ({ value: row.id, label: row.label }))}
            pending={patch.isPending}
            onSave={(changes, done) => patch.mutate(changes, { onSuccess: done })}
          />
          <TimelineCard
            since={`Since ${formatShortDate(record.created_at)}`}
            events={timeline.data}
            failed={timeline.isError}
            onRetry={() => timeline.refetch()}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-md lg:gap-lg">
          <MessagesCard
            name={record.name}
            phone={record.phone}
            thread={thread.data}
            failed={thread.isError}
            onRetry={() => thread.refetch()}
            uploading={uploadPhoto.isPending}
            onUpload={(file) => uploadPhoto.mutateAsync(file)}
            onSend={(body, imageIds) =>
              sendText.mutate(imageIds.length > 0 ? { body, image_ids: imageIds } : { body })
            }
          />
          <ContactCard
            lead={record}
            preference={preference}
            onEdit={() => setEditingContact(true)}
          />
          <DocumentsCard
            documents={documents.data}
            kinds={documentKinds}
            failed={documents.isError}
            onRetry={() => documents.refetch()}
            onSend={(pdfId) => sendDocument.mutate(pdfId)}
            onDownload={(pdfId) =>
              documentUrl.mutate(pdfId, {
                onSuccess: (url) => window.open(url, '_blank', 'noopener'),
              })
            }
          />
        </div>
      </div>

      <DeleteLeadDialog
        open={deleting}
        pending={archive.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => archive.mutate(record.id, { onSettled: () => setDeleting(false) })}
      />

      {converting && <ConvertLeadFlow lead={record} onDone={() => setConverting(false)} />}

      <EditContactDrawer
        open={editingContact}
        setOpen={setEditingContact}
        layout={layout}
        lead={record}
        preferences={preferences.map((row) => ({ value: row.id, label: row.label }))}
        pending={patch.isPending}
        onSave={(changes) => patch.mutate(changes, { onSuccess: () => setEditingContact(false) })}
      />
    </>
  )
}
