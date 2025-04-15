'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Edit } from 'lucide-react'
import { Address } from '@/types/address'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import formatPhoneNumber from '@/utils/formatPhoneNumber'

import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { Button } from '@/components/ui/button'

interface AddressSelectorProps {
  addresses: Address[]
  emptyAddress: Address
  setTitle: (title: string) => void
  setDraftAddress: (addr: Address) => void
  setOpen: (open: boolean) => void
}

export function AddressSelector({
  addresses,
  emptyAddress,
  setTitle,
  setDraftAddress,
  setOpen,
}: AddressSelectorProps) {
  const address = usePurchaseOrderCheckoutStore((state) => state.data.address)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const [expanded, setExpanded] = useState(false)

  const handleSelect = (id: string) => {
    const found = addresses.find((a) => a.id === id)
    if (found) {
      setData({
        address: found,
      })
      setExpanded(false)
    }
  }

  return (
    <div className="rounded-lg border border-primary overflow-hidden bg-background">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        disabled={addresses.length <= 1}
        className="relative w-full text-left p-3 bg-card flex items-start gap-4 transition-colors rounded-none cursor-pointer"
      >
        <div className="flex items-center w-full justify-between gap-3">
          <div className='flex items-center gap-3'>
          <Button
            type="button"
            variant="ghost"
            className="text-neutral-700 hover:text-primary hover:bg-background px-0 py-0 h-auto min-h-0 font-normal"
            onClick={(e) => {
              e.stopPropagation()
              setTitle('Edit Address')
              setDraftAddress(address ?? emptyAddress)
              setOpen(true)
            }}
          >
            <Edit size={20} className="text-primary" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center justify-between w-full">
              <span className="text-base sm:text-lg text-neutral-800">{address?.name}</span>
              <span className="text-sm text-neutral-500 whitespace-nowrap">
                {formatPhoneNumber(address?.phone_number ?? '')}
              </span>
            </div>

            <div className="mt-1 text-xs text-neutral-700 leading-tight">
              {address?.line_1} {address?.line_2} {address?.city}, {address?.state} {address?.zip}
            </div>
          </div>
          </div>
          
          {addresses.length > 1 && (
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-neutral-800"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.div>
        )}
        </div>


      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="address-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <RadioGroup
              value={address?.id ?? ''}
              onValueChange={handleSelect}
              className="flex flex-col gap-2 px-4 py-3"
            >
              {addresses
                .filter((a) => a.id !== address?.id)
                .map((address, index) => (
                  <motion.label
                    key={address.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    htmlFor={address.id}
                    className="relative peer flex w-full items-start justify-between gap-4 bg-background rounded-lg p-3 cursor-pointer border border-border transition-colors has-[[data-state=checked]]:shadow-xl has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-card"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between w-full">
                        <span className="text-base sm:text-lg text-neutral-800">
                          {address.name}
                        </span>
                        <span className="text-xs text-neutral-500 whitespace-nowrap">
                          {formatPhoneNumber(address.phone_number)}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-neutral-600 leading-tight">
                        {address.line_1} {address.line_2} {address.city}, {address.state}{' '}
                        {address.zip}
                      </div>
                    </div>

                    <div className="absolute top-1 right-2">
                      <RadioGroupItem
                        value={address?.id || ''}
                        id={address.id}
                        className="sr-only"
                      />
                    </div>
                  </motion.label>
                ))}
            </RadioGroup>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
