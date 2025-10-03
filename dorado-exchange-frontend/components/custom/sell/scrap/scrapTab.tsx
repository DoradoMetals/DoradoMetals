'use client'

import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { purityOptions, ScrapInput, scrapSchema, type Scrap } from '@/types/scrap'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useEffect, useState } from 'react'
import { defineStepper, Stepper } from '@stepperize/react'
import { sellCartStore } from '@/store/sellCartStore'
import { useRouter } from 'next/navigation'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getScrapPrice from '@/utils/getScrapPrice'
import { convertTroyOz } from '@/utils/convertTroyOz'
import PurityStep from './purityStep'
import WeightStep from './weightStep'
import MetalStep from './metalStep'
import ReviewStep from './reviewStep'

const { useStepper, utils } = defineStepper(
  { id: 'itemForm', title: 'Item Details', description: 'Enter your item information.' },
  { id: 'review', title: 'Review', description: 'Review and submit your item.' }
)

export default function ScrapForm() {
  const { data: spotPrices = [] } = useSpotPrices()

  const form = useForm<ScrapInput>({
    resolver: zodResolver(scrapSchema),
    mode: 'onChange',
    defaultValues: {
      id: crypto.randomUUID(),
      name: '',
      metal: 'Gold',
      pre_melt: 0,
      gross_unit: 'g',
      purity: purityOptions['Gold'][0].value,
      bid_premium: spotPrices[0]?.scrap_percentage ?? 0.75,
    },
  })

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  const addItem = sellCartStore.getState().addItem

  const [submitted, setSubmitted] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (showBanner) {
      const timeout = setTimeout(() => {
        setShowBanner(false)
      }, 5000)

      return () => clearTimeout(timeout)
    }
  }, [showBanner])

  const router = useRouter()

  const handleSubmit = (values: Scrap) => {
    const spot = spotPrices.find((s) => s.type === values.metal)
    const content =
      convertTroyOz(values.pre_melt ?? 0, values.gross_unit ?? 'g') * (values.purity ?? 0)
    const price = getScrapPrice(content, spot?.scrap_percentage ?? 0, spot)

    const bid_premium = spot?.scrap_percentage ?? 0.75

    const item = {
      type: 'scrap' as const,
      data: {
        ...values,
        content,
        price,
        bid_premium,
      },
    }

    addItem(item)
    setSubmitted(true)
    setShowBanner(true)

    stepper.goTo('review')
  }

  const handleAddAnother = () => {
    form.reset({
      id: crypto.randomUUID(),
      name: '',
      metal: 'Gold',
      pre_melt: 0,
      gross_unit: 'g',
      purity: purityOptions['Gold'][0].value,
      bid_premium: spotPrices[0]?.scrap_percentage ?? 0.75,
    })
    setSubmitted(false)
    stepper.goTo('itemForm')
  }

  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-6 rounded-lg w-full mt-4"
        >
          {stepper.switch({
            itemForm: () => <ItemFormStep />,
            review: () => <ReviewStep showBanner={showBanner} />,
          })}

          <div className="flex justify-end gap-4">
            {stepper.current.id === 'review' && (
              <>
                <Button
                  type="button"
                  onClick={handleAddAnother}
                  className="raised-off-page hover:bg-card bg-card"
                >
                  <div className="text-primary-gradient">Add Another</div>
                </Button>
                <Button
                  type="button"
                  className="ml-auto raised-off-page liquid-gold shine-on-hover text-white"
                  onClick={() => router.push('/checkout')}
                >
                  Go to Checkout
                </Button>
              </>
            )}
          </div>
        </form>
      </Form>
    </FormProvider>
  )
}

function ItemFormStep() {
  return (
    <div className="flex flex-col gap-6">
      <div className="w-full lg:flex lg:justify-between">
        <div className="hidden lg:block flex flex-col">
          <div className="section-label text-primary-gradient">Select Metal</div>
        </div>
        <div className="w-full lg:w-3/5">
          <MetalStep />
        </div>
      </div>

      <div className="separator-inset" />

      <div className="w-full lg:flex lg:justify-between">
        <div className="hidden lg:block flex flex-col">
          <div className="section-label text-primary-gradient">Select Weight</div>
        </div>
        <div className="w-full lg:w-3/5">
          <WeightStep />
        </div>
      </div>

      <div className="separator-inset" />

      <div className="lg:flex lg:justify-between">
        <div className="hidden lg:block flex flex-col">
          <div className="section-label text-primary-gradient">Select Purity</div>
          <div className="Select "></div>
        </div>
        <div className="w-full lg:w-3/5">
          <PurityStep />
        </div>
      </div>
      <div className="lg:flex lg:justify-between lg:w-3/5 lg:ml-auto">
        <Button
          type="submit"
          className="liquid-gold raised-off-page w-full shine-on-hover text-white"
        >
          Add Item
        </Button>
      </div>
    </div>
  )
}
