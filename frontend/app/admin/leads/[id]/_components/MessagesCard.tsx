'use client'

import * as React from 'react'
import { Chat, Text, UploadDrawer, type ChatMessage } from '@dorado/components'
import type { SmsDeliveryStatus, SmsThreadMessage } from '@dorado/contracts'

import { formatClock } from '@/shared/utils/formatStamp'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

const messageStatus = (status: SmsDeliveryStatus): ChatMessage['status'] =>
  status === 'failed' || status === 'undelivered'
    ? 'failed'
    : status === 'queued' || status === 'sent'
      ? 'sending'
      : 'delivered'

export type MessagesCardProps = {
  name: string
  phone: string | null
  thread: SmsThreadMessage[] | undefined
  failed: boolean
  onRetry: () => void
  onSend: (body: string, imageIds: string[]) => void
  onUpload: (file: File) => Promise<string>
  uploading: boolean
}

export function MessagesCard({
  name,
  phone,
  thread,
  failed,
  onRetry,
  onSend,
  onUpload,
  uploading,
}: MessagesCardProps) {
  const [attaching, setAttaching] = React.useState(false)
  const [files, setFiles] = React.useState<File[]>([])
  const [attached, setAttached] = React.useState<string[]>([])
  const first = name.split(/\s+/)[0] ?? name

  const messages: ChatMessage[] = (thread ?? []).map((message) => ({
    id: message.id,
    direction: message.direction,
    status: message.direction === 'outbound' ? messageStatus(message.status) : undefined,
    time: formatClock(message.created_at),
    body: (
      <span className="flex flex-col gap-xs">
        {message.images.map((image, index) => (
          <img
            key={image.id}
            src={image.url}
            alt={`Photo ${index + 1}`}
            className="max-h-60 rounded-md object-cover"
          />
        ))}
        {message.body ? <span>{message.body}</span> : null}
      </span>
    ),
  }))

  const upload = async () => {
    const ids: string[] = []
    for (const file of files) ids.push(await onUpload(file))
    setAttached((now) => [...now, ...ids])
    setAttaching(false)
    setFiles([])
  }

  return (
    <div data-testid="lead-card-messages" className="flex flex-col gap-xs">
      <Chat
        phone={phone ? formatPhoneNumber(phone) : ''}
        status={failed ? 'error' : phone && thread === undefined ? 'loading' : 'ready'}
        onRetry={onRetry}
        messages={messages}
        placeholder={`Text ${first}…`}
        onAttach={() => setAttaching(true)}
        onCall={phone ? () => window.open(`tel:${phone}`) : undefined}
        onSend={(body) => {
          onSend(body, attached)
          setAttached([])
        }}
      />
      {attached.length > 0 && (
        <Text variant="micro" className="px-sm text-muted-foreground">
          {attached.length === 1 ? '1 photo attached' : `${attached.length} photos attached`}
        </Text>
      )}
      <UploadDrawer
        open={attaching}
        setOpen={setAttaching}
        title="Attach photos"
        accept="image/*"
        multiple
        fileCount={files.length}
        onFiles={setFiles}
        canUpload={files.length > 0 && !uploading}
        onUpload={() => void upload()}
      />
    </div>
  )
}
