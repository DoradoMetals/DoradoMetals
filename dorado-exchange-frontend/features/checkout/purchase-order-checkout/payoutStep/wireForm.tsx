'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from '@/shared/ui/base/form'
import { WirePayout } from '@/types/payout'
import { UseFormReturn } from 'react-hook-form'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { ValidatedField } from '@/shared/ui/form/ValidatedField'
import { Checkbox } from '@/shared/ui/base/checkbox'

export default function WireForm({
  form,
  visible,
}: {
  form: UseFormReturn<WirePayout>
  visible: boolean
}) {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const syncToStore = () => {
    const values = form.getValues()
    setData({ payout: { method: 'WIRE', ...values } })
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="wire"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden will-change-transform"
        >
          <Form {...form}>
            <form className="p-4">
              <div className="space-y-6">
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
                <ValidatedField
                  control={form.control}
                  name="bank_name"
                  label="Bank Name"
                  className="input-floating-label-form"
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
