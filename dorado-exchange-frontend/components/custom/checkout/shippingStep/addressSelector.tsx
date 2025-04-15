'use client'

import React, { Dispatch, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Address } from '@/types/address'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { useFormContext } from 'react-hook-form'
import { PurchaseOrderCheckout } from '@/types/checkout'
import { FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Button } from '@/components/ui/button'

interface AddressSelectorProps {
  addresses: Address[]
  selectedAddress: Address
  setSelectedAddress: Dispatch<React.SetStateAction<Address>>
}

export function AddressSelector({
  addresses,
  selectedAddress,
  setSelectedAddress,
}: AddressSelectorProps) {
  const form = useFormContext<PurchaseOrderCheckout>()
  const [expanded, setExpanded] = useState(false)

  const handleSelect = (id: string) => {
    const found = addresses.find((a) => a.id === id)
    if (found) {
      form.setValue('address', found)
      setExpanded(false)
      setSelectedAddress(found)
    }
  }

  return (
    <FormField
      control={form.control}
      name="address"
      render={({ field }) => (
        <FormItem>
          <div className="rounded-lg border border-primary overflow-hidden bg-background">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="relative w-full text-left p-3 bg-card flex items-start gap-4 transition-colors rounded-none cursor-pointer"
            >
              <div className="flex flex-col">
                <div className="flex items-center justify-between w-full">
                  <span className="text-base sm:text-lg text-neutral-800">
                    {selectedAddress.name}
                  </span>
                  <span className="text-xs sm:text-sm text-neutral-500 whitespace-nowrap">
                    {formatPhoneNumber(selectedAddress.phone_number)}
                  </span>
                </div>

                <div className="mt-1 text-xs sm:text-sm text-neutral-600 leading-tight">
                  {selectedAddress.line_1} {selectedAddress.line_2} {selectedAddress.city},{' '}
                  {selectedAddress.state} {selectedAddress.zip}
                </div>
              </div>

              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="absolute top-6 right-4 text-neutral-800"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.div>
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
                    value={field.value?.id ?? ''}
                    onValueChange={handleSelect}
                    className="flex flex-col gap-2 px-4 py-3"
                  >
                    {addresses
                      .filter((address) => address.id !== selectedAddress.id)
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
                              <span className="text-xs sm:text-sm text-neutral-500 whitespace-nowrap">
                                {formatPhoneNumber(address.phone_number)}
                              </span>
                            </div>

                            <div className="mt-1 text-xs sm:text-sm text-neutral-600 leading-tight">
                              {address.line_1} {address.line_2} {address.city}, {address.state}{' '}
                              {address.zip}
                            </div>
                          </div>

                          <div className="absolute top-1 right-2">
                            <RadioGroupItem
                              value={address?.id || ''}
                              id={address.id}
                              className="sr-only"                            />
                          </div>
                        </motion.label>
                      ))}
                  </RadioGroup>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
