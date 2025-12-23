import { useState } from 'react'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import fuzzysort from 'fuzzysort'
import { Button } from '@/shared/ui/base/button'
import { X } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { motion } from 'framer-motion'
import { cn } from '@/shared/utils/cn'
import { Switch } from '@/shared/ui/base/switch'
import { useSellProducts } from '@/features/products/queries'
import BullionCard from '@/features/products/ui/BullionCard'

export default function BullionTab() {
  const { data: bullionProducts = [] } = useSellProducts()
  const [input, setInput] = useState('')
  const [showGenerics, setShowGenerics] = useState(false)

  const isInputActive = input !== ''
  const isShowAll = isInputActive || showGenerics

  const metalOptions = ['Gold', 'Silver', 'Platinum', 'Palladium']
  const [selectedMetal, setSelectedMetal] = useState('All')

  const filtered =
    selectedMetal === 'All'
      ? bullionProducts
      : bullionProducts.filter((p) => p.default.metal_type === selectedMetal)

  const filteredBullion = input
    ? fuzzysort
        .go(
          input,
          filtered.map((p) => ({
            ...p,
            searchText: `${p.default.product_name} ${p.default.metal_type}`,
          })),
          {
            keys: ['searchText'],
            limit: 50,
            threshold: -10000,
          }
        )
        .map((r) => r.obj)
    : filtered

  const displayedBullion = isShowAll
    ? filteredBullion.filter((group) => !group.default.is_generic)
    : filteredBullion.filter((group) => group.default.is_generic)

  const handleClear = () => {
    setInput('')
  }

  return (
    <div className="relative flex flex-col gap-2 mt-8 mb-8 w-full">
      <div className="flex items-center justify-between w-full gap-2">
        <label htmlFor="show-generics" className="text-sm font-medium text-neutral-700">
          Show All Products
        </label>
        <Switch
          id="show-generics"
          checked={isShowAll}
          onCheckedChange={(val) => setShowGenerics(val)}
          disabled={isInputActive}
        />
      </div>

      <RadioGroup
        value={selectedMetal}
        onValueChange={(val) => {
          setSelectedMetal(val)
        }}
        className="grid grid-cols-4 gap-2"
      >
        {metalOptions.map((label) => {
          const isSelected = selectedMetal === label

          return (
            <motion.label
              key={label}
              initial={false}
              animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
              onClick={(e) => {
                if (isSelected) {
                  e.preventDefault() // prevents Radix from swallowing the click
                  setSelectedMetal('All')
                }
              }}
              className={cn(
                'radio-group-buttons w-full',
                isSelected ? 'bg-primary! text-white' : 'text-neutral-700 !bg-card'
              )}
            >
              {label}
              <RadioGroupItem
                value={label}
                id={label}
                className="sr-only after:absolute after:inset-0"
              />
            </motion.label>
          )
        })}
      </RadioGroup>

      <div className="relative w-full mt-4">
        <FloatingLabelInput
          label="Search Products"
          size="sm"
          className="input-floating-label-form"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {input && (
          <Button
            variant="ghost"
            onClick={handleClear}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
            tabIndex={-1}
          >
            <X size={16} />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6 sm:gap-8 mt-4">
        {displayedBullion.map((group) => (
          <BullionCard key={group.default.id} product={group.default} variants={group.variants} />
        ))}
      </div>
    </div>
  )
}
