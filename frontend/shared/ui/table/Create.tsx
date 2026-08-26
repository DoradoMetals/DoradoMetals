'use client'

import { ComponentType, useState } from 'react'
import { AddNewDialog, CreateConfig } from './CreateDialog'
import { AddNewTrigger } from './CreateTrigger'

type AddNewProps = {
  createConfig: CreateConfig
  triggerIcon?: ComponentType<{ size?: number; className?: string }>
  triggerClass?: string
}

export function AddNew({
  createConfig,
  triggerIcon,
  triggerClass,
}: AddNewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <AddNewTrigger
        onOpen={() => setOpen(true)}
        icon={triggerIcon}
        className={triggerClass}
        // The dialog already names what it creates - "Create New Lead" - so the
        // trigger takes its accessible name from the same string rather than
        // asking every table to repeat it.
        label={createConfig.title.replace(/^Create\s+(New\s+)?/i, '')}
      />
      <AddNewDialog open={open} onOpenChange={setOpen} createConfig={createConfig} />
    </>
  )
}