'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Form } from '@/components/ui/form'
import { AchPayout } from '@/types/payout'
import { UseFormReturn } from 'react-hook-form'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { ValidatedField } from '@/components/ui/validated_field'
import { FormField, FormItem } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { accountTypeOptions } from '@/types/payout'
import { cn } from '@/lib/utils'

export default function ACHForm({
  form,
  visible,
}: {
  form: UseFormReturn<AchPayout>
  visible: boolean
}) {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="ach"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => setData({ payout: { method: 'ACH', ...data } }))}
              className="space-y-6 p-4 mb-2"
            >
              <ValidatedField
                control={form.control}
                name="account_holder_name"
                label="Name on Account"
                className="input-floating-label-form"
                inputProps={{ autoComplete: 'off' }}
              />
              <FormField
                control={form.control}
                name="account_type"
                render={({ field }) => (
                  <FormItem>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
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
                          <RadioGroupItem id={option.value} value={option.value} className="sr-only" />
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
                inputProps={{ autoComplete: 'off' }}
              />
              <div className="flex w-full justify-between gap-2">
                <ValidatedField
                  control={form.control}
                  name="routing_number"
                  label="Routing Number"
                  type="number"
                  className="input-floating-label-form no-spinner"
                  inputProps={{ autoComplete: 'off' }}
                />
                <ValidatedField
                  control={form.control}
                  name="account_number"
                  label="Account Number"
                  type="number"
                  className="input-floating-label-form no-spinner"
                  inputProps={{ autoComplete: 'off' }}
                />
              </div>
            </form>
          </Form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
