'use client'

import { Button } from '@/components/ui/button'
import { defineStepper } from '@stepperize/react'
import { AddressCarousel } from './addressCarousel'
import { useAddress } from '@/lib/queries/useAddresses'
import { Address } from '@/types/address'
import { useState } from 'react'
import AddressModal from '../user/addresses/addressDialog'
import { Plus } from 'lucide-react'
import { useGetSession } from '@/lib/queries/useAuth'
import { PurchaseOrderCheckout, purchaseOrderCheckoutSchema } from '@/types/checkout'
import { Toggle } from '@/components/ui/toggle'
import { insuredPackageOptions, uninsuredPackageOptions } from '@/types/packaging'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RadioGroup } from '@/components/ui/radio-group'
import { useForm } from 'react-hook-form'
const { useStepper, utils } = defineStepper(
  {
    id: 'shipping',
    title: 'Shipping',
    description: 'Choose how you want your items to be shipped',
  },
  { id: 'payment', title: 'Payment', description: 'Select how you want to pay.' },
  { id: 'review', title: 'Review Order', description: 'Review and confirm your order.' },
  {
    id: 'complete',
    title: 'Order Complete!',
    description: 'Your order is complete. Please download your invoice.',
  }
)

export default function CheckoutStepper() {

  // const form = useForm<PurchaseOrderCheckout>({
  //   resolver: zodResolver(purchaseOrderCheckoutSchema),
  //   defaultValues: {
  //     address: ,
  //     package: insuranceToggle
  //       ? insuredPackageOptions[selectedPackageLabel]
  //       : uninsuredPackageOptions[selectedPackageLabel],
  //     pickup_type: 'DROPOFF_AT_FEDEX_LOCATION',
  //     pickup_time: new Date(),
  //     shipping_service: '',
  //     payment: '',
  //     confirmation: false,
  //   },
  // })
  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  return (
    <div className="flex flex-col w-full px-5 max-w-lg lg:mt-15 space-y-6">
      <div className="flex items-center gap-4 mb-6 ">
        <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
        <div className="flex flex-col">
          <h2 className="flex-1 header-text">{stepper.current.title}</h2>
          <p className="secondary-text">{stepper.current.description}</p>
        </div>
      </div>

      {stepper.switch({
        shipping: () => <ShippingStep />,
        payment: () => <PaymentStep />,
        review: () => <ReviewStep />,
        complete: () => <CompleteStep />,
      })}

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={stepper.prev} disabled={stepper.isFirst}>
          Back
        </Button>
        <Button type="button" onClick={stepper.next}>
          Next
        </Button>
      </div>
    </div>
  )
}

function ShippingStep() {
  const { user } = useGetSession()
  const { data: addresses = [] } = useAddress()
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [insuranceToggle, setInsuranceToggle] = useState(true)
  const [selectedPackageLabel, setSelectedPackageLabel] = useState<string>('FedEx Small (Double Boxed)')


  const defaultValues: Address = {
    id: crypto.randomUUID(),
    user_id: user?.id ?? '',
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    zip: '',
    name: '',
    is_default: addresses.length === 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phone_number: '',
    country_code: 'US',
    is_valid: false,
    is_residential: false,
  }

  const [selectedAddress, setSelectedAddress] = useState<Address>(
    addresses[activeIndex] || defaultValues
  )

  return (
    <div>
      <AddressModal
        address={selectedAddress}
        open={open}
        setOpen={setOpen}
        title={addresses.length === 0 ? 'Add Address' : 'Edit'}
      />
      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <div className="flex justify-center text-sm text-neutral-800">
            You must have an address to begin checkout.
          </div>
          <Button
            effect="expandIcon"
            variant="default"
            size="sm"
            iconPlacement="right"
            icon={Plus}
            iconSize={16}
            onClick={() => {
              setSelectedAddress(defaultValues)
              setOpen(true)
            }}
          >
            <div className="flex items-center gap-2">Add Address</div>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-6">
            <div className="flex w-full justify-between items-center">
              <h2 className="text-sm text-neutral-600">Select Address</h2>

              <Button
                variant="link"
                effect="hoverUnderline"
                className="ml-auto"
                onClick={() => {
                  setSelectedAddress(defaultValues)
                  setOpen(true)
                }}
              >
                <div className="flex items-center gap-1 text-sm text-neutral-600 ">
                  <Plus size={16} />
                  Add New
                </div>
              </Button>
            </div>
            <AddressCarousel
              setOpen={setOpen}
              addresses={addresses}
              activeIndex={activeIndex}
              onChangeIndex={setActiveIndex}
              setSelectedAddress={setSelectedAddress}
            />
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex items-center w-full justify-between">
              <h2 className="text-sm text-neutral-600">Select Packaging</h2>
            </div>
            <div className="flex flex-col items-end w-full justify-end gap-2">
              <Label className="text-base text-neutral-800" htmlFor="insurance">
                Want your package insured?
              </Label>

              <Switch
                checked={insuranceToggle}
                onCheckedChange={(checked) => setInsuranceToggle(checked)}
              />
            </div>
            {/* <RadioGroup
              value={selectedPackageLabel}
              onValueChange={(val) => {
                setSelectedPackageLabel(val)
                const pkg = (insuranceToggle ? insuredPackageOptions : uninsuredPackageOptions)[val]
                form.setValue('package', pkg) // or whatever field you want to update
              }}
              className="gap-3 w-full items-stretch flex flex-col"
            >
              {Object.entries(
                insuranceToggle ? insuredPackageOptions : uninsuredPackageOptions
              ).map(([label, pkg]) => (
                <label
                  key={label}
                  className="flex w-full items-stretch justify-between gap-4 rounded-lg p-3 cursor-pointer border border-neutral-200 has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-xl has-[[data-state=checked]]:border-primary transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <div className="title-text">{label}</div>
                    <p className="tertiary-text text-sm text-neutral-500">
                      {pkg.dimensions.length}x{pkg.dimensions.width}x{pkg.dimensions.height}{' '}
                      {pkg.dimensions.units} — {pkg.weight.value} {pkg.weight.units}
                    </p>
                  </div>
                  <RadioGroupItem
                    value={label}
                    id={label}
                    className="sr-only after:absolute after:inset-0"
                  />
                </label>
              ))}
            </RadioGroup> */}
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentStep() {
  return <div>Payment</div>
}

function ReviewStep() {
  return <div>Review</div>
}

function CompleteStep() {
  return <div>Complete</div>
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const size = 80
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const fillPercentage = (currentStep / totalSteps) * 100
  const dashOffset = circumference - (circumference * fillPercentage) / 100

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-500"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="text-primary transition-all duration-300 ease-in-out"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-medium" aria-live="polite">
          {currentStep} of {totalSteps}
        </span>
      </div>
    </div>
  )
}
