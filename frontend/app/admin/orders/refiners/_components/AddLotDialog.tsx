'use client'

import * as React from 'react'
import {
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  useDebounce,
} from '@dorado/components'
import { Search } from '@dorado/icons'

import { useLotPicker } from '../_api'

export type AddLotDialogProps = {
  open: boolean
  pending?: boolean
  onAdd: (lotId: string) => void
  onClose: () => void
}

export function AddLotDialog({ open, pending = false, onAdd, onClose }: AddLotDialogProps) {
  const [q, setQ] = React.useState('')
  const debounced = useDebounce(q, 250)
  const lots = useLotPicker(debounced).data ?? []

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogTitle>Add lot</DialogTitle>
        <DialogDescription>Search on-hand lots by reference, item or order.</DialogDescription>
        <Autocomplete
          label="Lot"
          placeholder="Search lots"
          leading={<Search aria-hidden />}
          value={q}
          onValueChange={setQ}
          disabled={pending}
          empty="No on-hand lots match"
          items={lots.map((lot) => ({
            id: lot.id,
            textValue: [lot.reference, lot.product_name ?? lot.form ?? lot.metal_id]
              .filter(Boolean)
              .join(' · '),
          }))}
          onSelect={(item) => onAdd(item.id)}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
