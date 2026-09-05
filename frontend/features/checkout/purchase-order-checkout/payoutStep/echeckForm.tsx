'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Form } from '@dorado/components'
import { EcheckPayout } from '@/features/payouts/types'
import { UseFormReturn } from 'react-hook-form'
import { usePayoutDraft } from '@/features/checkout/purchase-order-checkout/payoutStep/payoutDraft'
import { ValidatedField } from '@/shared/ui/form/ValidatedField'

export default function EcheckForm({
  form,
  visible,
}: {
  form: UseFormReturn<EcheckPayout>
  visible: boolean
}) {
  const setPayout = usePayoutDraft((state) => state.setPayout)

  const syncToStore = () => {
    const values = form.getValues()
    setPayout({ method: 'ECHECK', ...values })
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="echeck"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden will-change-transform"
        >
          <Form {...form}>
            <form className="space-y-6 p-4 mb-2">
              <ValidatedField
                control={form.control}
                name="account_holder_name"
                label="Addressed To"
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
