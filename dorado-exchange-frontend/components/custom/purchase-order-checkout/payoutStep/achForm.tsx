'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Form, FormControl, FormLabel, FormMessage } from '@/components/ui/form'
import { AchPayout } from '@/types/payout'
import { UseFormReturn } from 'react-hook-form'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { ValidatedField } from '@/components/ui/validated_field'
import { FormField, FormItem } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { accountTypeOptions } from '@/types/payout'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

export default function ACHForm({
  form,
  visible,
}: {
  form: UseFormReturn<AchPayout>
  visible: boolean
}) {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  // ⚡ Helper to sync state when any field changes
  const syncToStore = () => {
    const values = form.getValues()
    setData({ payout: { method: 'ACH', ...values } })
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="ach"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-y-hidden will-change-transform"
        >
          <Form {...form}>
            <form className="p-4">
              <div className='space-y-6'>

              
              <ValidatedField
                control={form.control}
                name="account_holder_name"
                label="Name on Account"
                className="input-floating-label-form"
                inputProps={{
                  autoComplete: 'off',
                  onChange: (e) => {
                    form.setValue('account_holder_name', e.target.value, { shouldValidate: true })
                    syncToStore()
                  },
                }}
              />
              <FormField
                control={form.control}
                name="account_type"
                render={({ field }) => (
                  <FormItem>
                    <RadioGroup
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val)
                        syncToStore()
                      }}
                      className="gap-3 w-full flex justify-between"
                    >
                      {accountTypeOptions.map((option) => (
                        <label
                          key={option.value}
                          htmlFor={option.value}
                          className={cn(
                            'relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg border border-border bg-background p-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:shadow-md'
                          )}
                        >
                          <div className="flex flex-col items-center gap-2">
                            {option.icon && <option.icon className="w-5 h-5 text-primary" />}
                            <div className="text-xs sm:text-sm text-neutral-800 font-medium">
                              {option.label}
                            </div>
                          </div>
                          <RadioGroupItem
                            id={option.value}
                            value={option.value}
                            className="sr-only"
                          />
                        </label>
                      ))}
                    </RadioGroup>
                  </FormItem>
                )}
              />
              <ValidatedField
                control={form.control}
                name="bank_name"
                label="Bank Name"
                inputProps={{
                  autoComplete: 'off',
                  onChange: (e) => {
                    form.setValue('bank_name', e.target.value, { shouldValidate: true })
                    syncToStore()
                  },
                }}
              />
              <div className="flex w-full justify-between gap-2">
                <ValidatedField
                  control={form.control}
                  name="routing_number"
                  label="Routing Number"
                  type="number"
                  className="input-floating-label-form no-spinner"
                  inputProps={{
                    autoComplete: 'off',
                    onChange: (e) => {
                      form.setValue('routing_number', e.target.value, { shouldValidate: true })
                      syncToStore()
                    },
                  }}
                />
                <ValidatedField
                  control={form.control}
                  name="account_number"
                  label="Account Number"
                  type="number"
                  className="input-floating-label-form no-spinner"
                  inputProps={{
                    autoComplete: 'off',
                    onChange: (e) => {
                      form.setValue('account_number', e.target.value, { shouldValidate: true })
                      syncToStore()
                    },
                  }}
                />
              </div>
              
              </div>
              <FormField
                control={form.control}
                name="confirmation"
                render={({ field }) => (
                  <FormItem className="flex-col items-start gap-1 mt-4">
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(val) => {
                            field.onChange(val)
                            syncToStore()
                          }}
                          id={`confirmation-${form.getValues().account_holder_name ?? ''}`}
                          className="checkbox-form"
                        />
                      </FormControl>
                      <label
                        htmlFor={`confirmation-${form.getValues().account_holder_name ?? ''}`}
                        className="cursor-pointer text-sm text-neutral-700 font-normal"
                      >
                        I have entered the correct bank information.
                      </label>
                    </div>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
