'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { DoradoPayout } from '@/features/payouts/types'
import { UseFormReturn } from 'react-hook-form'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'

export default function DoradoAccountForm({
  form,
  visible,
}: {
  form: UseFormReturn<DoradoPayout>
  visible: boolean
}) {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const syncToStore = () => {
    const values = form.getValues()
    setData({ payout: { method: 'DORADO_ACCOUNT', ...values } })
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="echeck"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden will-change-transform rounded-b-lg"
        >
          <div className="text-sm text-neutral-800 px-4 pb-2 flex flex-col">
            <div>
              Your payout is credited instantly to your Dorado Account. Use these funds to buy
              bullion with no extra fees, or withdraw them at any time.
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
