'use client'

import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { purityOptions, ScrapInput, scrapSchema, type Scrap } from '@/features/scrap/types'
import { Button } from '@dorado/components'
import { Separator } from '@/shared/ui/base/separator'
import { Form } from '@/shared/ui/base/form'
import { useEffect, useState } from 'react'
import { defineStepper } from '@stepperize/react'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { useRouter } from 'next/navigation'
import { useSpotPrices } from '@/features/spots/queries'
import ReviewStep from '@/features/scrap/ui/ReviewStep'
import MetalStep from '@/features/scrap/ui/MetalStep'
import WeightStep from '@/features/scrap/ui/WeightStep'
import PurityStep from '@/features/scrap/ui/PurityStep'

const { useStepper, utils } = defineStepper(
  { id: 'itemForm', title: 'Item Details', description: 'Enter your item information.' },
  { id: 'review', title: 'Review', description: 'Review and submit your item.' }
)

export default function ScrapForm() {
  const form = useForm<ScrapInput, any, Scrap>({
    resolver: zodResolver(scrapSchema),
    mode: 'onChange',
    defaultValues: {
      id: crypto.randomUUID(),
      name: '',
      metal: 'Gold',
      pre_melt: 0,
      gross_unit: 'g',
      purity: purityOptions['Gold'][0].value,
      bid_premium: 0.75,
    },
  })

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  const addItem = useCheckoutItems.getState().addItem
  const { data: metals = [] } = useSpotPrices()

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
    // Only the declaration: content and premium are the server's.
    addItem('purchase', {
      id: values.id,
      metal_id: metals.find((m) => m.name === values.metal)?.id,
      pre_melt: values.pre_melt,
      post_melt: values.post_melt,
      purity: values.purity,
      unit: values.gross_unit,
      quantity: 1,
    })
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
      bid_premium: 0.75,
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
                <Button variant="secondary" type="button" onClick={handleAddAnother}>
                  Add Another
                </Button>
                <Button
                  type="button"
                  className="ml-auto"
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
          <p className="eyebrow">Select Metal</p>
        </div>
        <div className="w-full lg:w-3/5">
          <MetalStep />
        </div>
      </div>

      <Separator />

      <div className="w-full lg:flex lg:justify-between">
        <div className="hidden lg:block flex flex-col">
          <p className="eyebrow">Select Weight</p>
        </div>
        <div className="w-full lg:w-3/5">
          <WeightStep />
        </div>
      </div>

      <Separator />

      <div className="lg:flex lg:justify-between">
        <div className="hidden lg:block flex flex-col">
          <p className="eyebrow">Select Purity</p>
          <div className="Select "></div>
        </div>
        <div className="w-full lg:w-3/5">
          <PurityStep />
        </div>
      </div>
      <div className="lg:flex lg:justify-between lg:w-3/5 lg:ml-auto">
        <Button type="submit" className="w-full">
          Add Item
        </Button>
      </div>
    </div>
  )
}
