'use client'

import * as React from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Text,
} from '@dorado/components'
import type { LeadConvertBody, LeadView } from '@dorado/contracts'

import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

import { formatEstimate, pluralize } from '../_lib'

export type ConvertDialogProps = {
  open: boolean
  lead: LeadView
  itemCount: number
  estimateTotal: number | null
  pending?: boolean
  error?: string | null
  onConvert: (body: LeadConvertBody) => void
  onCancel: () => void
}

export function ConvertDialog({
  open,
  lead,
  itemCount,
  estimateTotal,
  pending = false,
  error = null,
  onConvert,
  onCancel,
}: ConvertDialogProps) {
  const [name, setName] = React.useState(lead.name)
  const [email, setEmail] = React.useState(lead.email ?? '')
  const [phone, setPhone] = React.useState(formatPhoneNumber(lead.phone ?? ''))
  const [carry, setCarry] = React.useState(true)
  const [tried, setTried] = React.useState(false)
  const carryId = React.useId()
  const missingEmail = email.trim() === ''

  const submit = () => {
    setTried(true)
    if (missingEmail) return
    const typed = phone.replace(/\D/g, '')
    const original = (lead.phone ?? '').replace(/\D/g, '')
    onConvert({
      name: name.trim() || lead.name,
      email: email.trim(),
      phone: typed === original || typed.endsWith(original) ? lead.phone : typed || null,
      carry_estimate: carry,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogTitle>Convert to customer?</DialogTitle>
        <DialogDescription>
          The texts, calls and notes follow the lead onto the new customer.
        </DialogDescription>
        <div className="flex flex-col gap-sm">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Email"
            type="email"
            required
            value={email}
            invalid={tried && missingEmail}
            message={tried && missingEmail ? 'An email is needed to convert.' : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="flex items-start gap-xs">
            <Checkbox
              id={carryId}
              checked={carry}
              onCheckedChange={(on) => setCarry(on === true)}
            />
            <div className="flex flex-col gap-3xs">
              <label htmlFor={carryId} className="text-small text-foreground">
                Add the estimate to their cart
              </label>
              {itemCount > 0 && estimateTotal != null && (
                <Text variant="micro" className="text-muted-foreground">
                  {`${pluralize(itemCount, 'item', 'items')} · ${formatEstimate(estimateTotal)}`}
                </Text>
              )}
            </div>
          </div>
          {error != null && (
            <Text variant="small" className="text-destructive">
              {error}
            </Text>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={pending} aria-busy={pending || undefined} onClick={submit}>
            Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
