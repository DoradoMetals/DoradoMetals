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
  const form = useForm<ScrapInput>({
    resolver: zodResolver(scrapSchema),
    mode: 'onChange',
    defaultValues: {
      id: crypto.randomUUID(),
      name: '',
      metal: 'Gold',
      gross: 0,
      gross_unit: 'g',
      purity: purityOptions['Gold'][0].value,
    },
  })

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  const addItem = sellCartStore.getState().addItem
  const { data: spotPrices = [] } = useSpotPrices()

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
    const spot = spotPrices.find((s) => s.id === values.metal)
    const content =
      convertTroyOz(values.gross ?? 0, values.gross_unit ?? 'g') * (values.purity ?? 0)
    const price = getScrapPrice(content, spot)

    const item = {
      type: 'scrap' as const,
      data: {
        ...values,
        content,
        price,
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
      gross: 0,
      gross_unit: 'g',
      purity: purityOptions['Gold'][0].value,
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
                <Button type="button" variant="outline" onClick={handleAddAnother} className=' raised-off-page hover:bg-card bg-card'>
                  Add Another
                </Button>
                <Button type="button" className="ml-auto raised-off-page primary-gradient hover:primary-gradient shine-on-hover" onClick={() => router.push('/checkout')}>
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
          <div className='Select '>

          </div>
        </div>
        <div className="w-full lg:w-3/5">
          <PurityStep />
        </div>
      </div>
      <div className="lg:flex lg:justify-between lg:w-3/5 lg:ml-auto">
        <Button type="submit" className="primary-gradient raised-off-page w-full shine-on-hover">
          Add Item
        </Button>
      </div>
    </div>
  )
}
