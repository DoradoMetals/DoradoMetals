'use client'

import * as React from 'react'
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  type SelectItemShape,
} from '@dorado/components'
import type { LeadPatch, LeadView } from '@dorado/contracts'

const NONE = 'none'

export type EditContactDrawerProps = {
  open: boolean
  setOpen: (open: boolean) => void
  layout?: 'desktop' | 'mobile'
  lead: LeadView
  preferences: SelectItemShape[]
  pending?: boolean
  onSave: (patch: LeadPatch) => void
}

export function EditContactDrawer({
  open,
  setOpen,
  layout = 'desktop',
  lead,
  preferences,
  pending = false,
  onSave,
}: EditContactDrawerProps) {
  const [name, setName] = React.useState(lead.name)
  const [phone, setPhone] = React.useState(lead.phone ?? '')
  const [email, setEmail] = React.useState(lead.email ?? '')
  const [city, setCity] = React.useState(lead.city ?? '')
  const [state, setState] = React.useState(lead.state ?? '')
  const [preference, setPreference] = React.useState(lead.contact_preference_id ?? NONE)

  React.useEffect(() => {
    if (!open) return
    setName(lead.name)
    setPhone(lead.phone ?? '')
    setEmail(lead.email ?? '')
    setCity(lead.city ?? '')
    setState(lead.state ?? '')
    setPreference(lead.contact_preference_id ?? NONE)
  }, [open, lead])

  const save = () => {
    const patch: LeadPatch = {}
    if (name.trim() && name.trim() !== lead.name) patch.name = name.trim()
    const nextPhone = phone.trim() || null
    if (nextPhone !== lead.phone) patch.phone = nextPhone
    const nextEmail = email.trim() || null
    if (nextEmail !== lead.email) patch.email = nextEmail
    const nextCity = city.trim() || null
    if (nextCity !== lead.city) patch.city = nextCity
    const nextState = state.trim().toUpperCase() || null
    if (nextState !== lead.state) patch.state = nextState
    const nextPreference = preference === NONE ? null : preference
    if (nextPreference !== lead.contact_preference_id) patch.contact_preference_id = nextPreference
    if (Object.keys(patch).length === 0) {
      setOpen(false)
      return
    }
    onSave(patch)
  }

  return (
    <Drawer
      open={open}
      setOpen={setOpen}
      size={layout === 'mobile' ? 'full' : 'sm'}
      label="Edit contact"
    >
      <DrawerHeader title="Edit contact" />
      <DrawerBody>
        <div className="flex flex-col gap-sm">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input
            label="State"
            value={state}
            maxLength={2}
            autoCapitalize="characters"
            onChange={(e) => setState(e.target.value)}
          />
          <Select
            label="Preference"
            items={[{ value: NONE, label: 'No preference' }, ...preferences]}
            value={preference}
            onValueChange={setPreference}
          />
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button disabled={pending} aria-busy={pending || undefined} onClick={save}>
          Save
        </Button>
      </DrawerFooter>
    </Drawer>
  )
}
