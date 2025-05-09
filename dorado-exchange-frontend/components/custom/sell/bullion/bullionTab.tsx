import { useAllProducts } from '@/lib/queries/useProducts'
import { useState } from 'react'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import fuzzysort from 'fuzzysort'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import BullionCard from './bullionCard'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function BullionTab() {
  const { data: bullionProducts = [], isLoading } = useAllProducts()
  const [input, setInput] = useState('')

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

  const handleClear = () => {
    setInput('')
  }

  return (
    <div className="relative flex flex-col gap-4 mt-8 mb-8">
      <RadioGroup
        value={selectedMetal}
        onValueChange={(val) => {
          setSelectedMetal(val)
        }}
        className="grid grid-cols-2 xs:grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3"
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
                  e.preventDefault() // 👈 prevents Radix from swallowing the click
                  setSelectedMetal('All') // 👈 deselects
                }
              }}
              className={cn(
                'radio-group-buttons',
                isSelected ? 'liquid-gold text-white' : 'text-neutral-700 !bg-card'
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
        {input !== '' && (
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
        {filteredBullion.map((group) => (
          <BullionCard key={group.default.id} product={group.default} variants={group.variants} />
        ))}
      </div>
    </div>
  )
}
