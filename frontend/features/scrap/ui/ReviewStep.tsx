import { getGrossLabel, getPurityLabel, Scrap } from '@/features/scrap/types'
import { CheckCircle} from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { CoinsIcon, PercentIcon, ScalesIcon } from '@phosphor-icons/react'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import { formatRate } from '@/features/rates/types'
import { useBasket } from '@/features/checkout/items/queries'
import { useSpotPrices } from '@/features/spots/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Badge, Divider } from '@dorado/components'
import { DetailRow } from '@/shared/ui/DetailRow'

export default function ReviewStep({ showBanner }: { showBanner: boolean }) {
  const form = useFormContext<Scrap>()
  const metal = form.watch('metal')
  const unit = form.watch('gross_unit') || 'g'
  const pre_melt = form.watch('pre_melt') ?? 0
  const purity = form.watch('purity') ?? 0

  const items = useBasket('purchase')
  const { data: metals = [] } = useSpotPrices()
  const metal_id = metals.find((m) => m.name === metal)?.id

  // The WHOLE basket is quoted, not just this line: the premium bands on the
  // metal's total content across the order, so this line's rate depends on
  // every other line. Quote lines come back index-aligned with the store
  // array, and the reviewed item - already added by the time this step shows -
  // is found by its declaration, because addItem merges identical lots.
  const { data: quote } = usePurchaseOrderQuote(items)
  const reviewedIndex = items.findIndex(
    (i) =>
      !i.bullion_id &&
      i.metal_id === metal_id &&
      Number(i.pre_melt) === Number(pre_melt) &&
      Number(i.purity) === Number(purity) &&
      i.unit === unit
  )
  const line = quote?.items.find((l) => l.index === reviewedIndex)

  const bid_premium = line?.premium
  const price = line?.line_total ?? 0

  return (
    <AnimatePresence mode="wait">
      <div className="space-y-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CoinsIcon className="text-primary" size={24} />
              <p>Metal:</p>
            </div>
            <strong>{metal}</strong>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScalesIcon className="text-primary" size={24} />
              <p>Pre Melt:</p>
            </div>
            {getGrossLabel(pre_melt, unit)}
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <PercentIcon className="text-primary" size={24} />
              <p>Purity:</p>
            </div>
            {getPurityLabel(purity, metal)}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PercentIcon className="text-primary" size={24} />
              <p>Rate:</p>
            </div>
            <strong>{formatRate(bid_premium)}</strong>
          </div>
        </div>

        <Divider />

        <DetailRow label="Price Estimate:" className="items-end">
          <PriceNumberFlow value={price} />
        </DetailRow>

        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="mb-4 will-change-transform"
          >
            <Badge variant="soft" intent="success" size="lg" icon={<CheckCircle className="w-4 h-4" />}>
              Item submitted!
            </Badge>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  )
}
