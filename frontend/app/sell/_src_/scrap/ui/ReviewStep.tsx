import { getGrossLabel, getPurityLabel, Scrap } from '@/shared/types/scrap'
import { useFormContext } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { useCheckoutQuote } from '@/shared/hooks/quotes/queries'
import { formatRate } from '@/shared/types/rates'
import { useBasket } from '@/shared/hooks/checkout/items/queries'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import { Amount, Badge, Divider } from '@dorado/components'
import { CheckCircle, Coins, Percent, Scale } from '@dorado/icons'
import { cn } from '@/shared/utils/cn'

export default function ReviewStep({ showBanner }: { showBanner: boolean }) {
  const form = useFormContext<Scrap>()
  const metal = form.watch('metal')
  const unit = form.watch('gross_unit') || 'g'
  const pre_melt = form.watch('pre_melt') ?? 0
  const purity = form.watch('purity') ?? 0

  const items = useBasket('purchase')
  const { data: metals = [] } = useSpotPrices()
  const metal_id = metal

  // The WHOLE basket is quoted, not just this line: the premium bands run on
  // the metal's total content across the order, so this line's rate depends on
  // every other line. THE REVIEWED ROW IS FOUND BY ITS ID - it was re-matched
  // by metal, weight, purity and unit against the declaration, because the
  // quote used to key lines by request position rather than by row.
  const { data: answer } = useCheckoutQuote('purchase')
  const quote = answer?.direction === 'purchase' ? answer : undefined
  const reviewed = items.find(
    (i) =>
      !i.bullion_id &&
      i.metal_id === metal_id &&
      Number(i.pre_melt) === Number(pre_melt) &&
      Number(i.purity) === Number(purity) &&
      i.unit === unit
  )
  const line = quote?.items.find((l) => l.id === reviewed?.id)

  const bid_premium = line?.premium
  const price = line?.line_total ?? 0

  return (
    <AnimatePresence mode="wait">
      <div className="space-y-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="text-primary" size={24} />
              <p>Metal:</p>
            </div>
            <strong>{metal}</strong>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="text-primary" size={24} />
              <p>Pre Melt:</p>
            </div>
            {getGrossLabel(pre_melt, unit)}
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Percent className="text-primary" size={24} />
              <p>Purity:</p>
            </div>
            {getPurityLabel(purity, metal)}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="text-primary" size={24} />
              <p>Rate:</p>
            </div>
            <strong>{formatRate(bid_premium)}</strong>
          </div>
        </div>

        <Divider />

        <div className={cn('flex w-full items-center justify-between gap-2', 'items-end')}>
          <p>Price Estimate:</p>
          <strong>
            <Amount value={price} />
          </strong>
        </div>

        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="mb-4 will-change-transform"
          >
            <Badge
              variant="soft"
              intent="success"
              size="lg"
              icon={<CheckCircle className="w-4 h-4" />}
            >
              Item submitted!
            </Badge>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  )
}
