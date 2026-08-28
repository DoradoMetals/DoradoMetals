import { getGrossLabel, getPurityLabel, Scrap } from '@/features/scrap/types'
import { CheckCircle} from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { CoinsIcon, PercentIcon, ScalesIcon } from '@phosphor-icons/react'
import { useUser } from '@/features/auth/authClient'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { sellCartStore } from '@/shared/store/sellCartStore'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

export default function ReviewStep({ showBanner }: { showBanner: boolean }) {
  const form = useFormContext<Scrap>()
  const metal = form.watch('metal')
  const unit = form.watch('gross_unit') || 'g'
  const pre_melt = form.watch('pre_melt') ?? 0
  const purity = form.watch('purity') ?? 0

  const { user } = useUser()
  const items = sellCartStore((s) => s.items)

  // The WHOLE cart is quoted, not just this line: the premium bands on the
  // metal's total content across the order, so this line's rate depends on
  // every other line. Quote lines come back index-aligned with the store
  // array (`items[i]` answers as `index: i` - sell-cart lines have no stable
  // id), and the reviewed item - already added by the time this step shows -
  // is found by its declaration rather than the form's id, because addItem
  // merges identical scrap under the earlier line's id. Gated on the session:
  // the endpoint is per-caller, so signed-out reviewers estimate at zero.
  const { data: quote } = usePurchaseOrderQuote(items)
  const reviewedIndex = items.findIndex(
    (i) =>
      i.type === 'scrap' &&
      (i.data as Scrap).metal === metal &&
      Number((i.data as Scrap).pre_melt) === Number(pre_melt) &&
      Number((i.data as Scrap).purity) === Number(purity) &&
      (i.data as Scrap).gross_unit === unit
  )
  const line = quote?.items.find((l) => l.index === reviewedIndex)

  // The store's own re-tiered bid_premium stands in for the rate label while
  // there is no quote (signed out) - it is the same rates-table band, and a
  // band is rate-table display, not a price.
  const bid_premium =
    line?.premium ??
    (reviewedIndex >= 0 ? (items[reviewedIndex].data as Scrap).bid_premium : undefined)

  const price = line?.line_total ?? 0

  return (
    <AnimatePresence mode="wait">
      <div className="space-y-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CoinsIcon className='text-primary' size={24} />
              <span className="text-base text-neutral-600">Metal:</span>
            </div>
            <span className="text-lg text-neutral-800">{metal}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScalesIcon className='text-primary' size={24} />
              <span className="text-base text-neutral-600">Pre Melt:</span>
            </div>
            {getGrossLabel(pre_melt, unit)}
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <PercentIcon className='text-primary' size={24} />
              <span className="text-base text-neutral-600">Purity:</span>
            </div>
            {getPurityLabel(purity, metal)}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PercentIcon className="text-primary" size={24} />
              <span className="text-base text-neutral-600">Rate:</span>
            </div>
            <span className="text-lg text-neutral-800">{formatRate(bid_premium)}</span>
          </div>
        </div>

        <div className="separator-inset" />

        <div className="flex items-end justify-between">
          <span className="text-base text-neutral-800 ">Price Estimate:</span>
          <span className="text-xl text-neutral-900">
            <PriceNumberFlow value={price} />
          </span>
        </div>

        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 rounded-xl text-green-800 text-sm px-4 py-2 border border-green-800 mb-4 will-change-transform"
          >
            <CheckCircle className="w-4 h-4" />
            Item submitted!
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  )
}
