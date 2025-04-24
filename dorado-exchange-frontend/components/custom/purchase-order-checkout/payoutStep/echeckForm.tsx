'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Form } from '@/components/ui/form'
import { EcheckPayout } from '@/types/payout'
import { UseFormReturn } from 'react-hook-form'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { ValidatedField } from '@/components/ui/validated_field'

export default function EcheckForm({
  form,
  visible,
}: {
  form: UseFormReturn<EcheckPayout>
  visible: boolean
}) {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const syncToStore = () => {
    const values = form.getValues()
    setData({ payout: { method: 'ECHECK', ...values } })
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="echeck"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <Form {...form}>
            <form className="space-y-6 p-4 mb-2">
              <ValidatedField
                control={form.control}
                name="account_holder_name"
                label="Addressed To"
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
                name="payout_email"
                label="Email Delivery"
                className="input-floating-label-form"
                inputProps={{
                  autoComplete: 'off',
                  onChange: (e) => {
                    form.setValue('payout_email', e.target.value, { shouldValidate: true })
                    syncToStore()
                  },
                }}
              />
            </form>
          </Form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
