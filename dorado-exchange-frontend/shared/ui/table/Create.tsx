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
      <AddNewTrigger onOpen={() => setOpen(true)} icon={triggerIcon} className={triggerClass} />
      <AddNewDialog open={open} onOpenChange={setOpen} createConfig={createConfig} />
    </>
  )
}