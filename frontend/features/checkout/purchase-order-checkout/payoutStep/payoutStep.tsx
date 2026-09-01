'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown } from 'lucide-react'

import {
  payoutMethodIcon,
  achSchema,
  wireSchema,
  echeckSchema,
  AchPayout,
  WirePayout,
  EcheckPayout,
  PayoutMethodType,
  DoradoPayout,
  doradoAccountSchema,
} from '@/features/payouts/types'

import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import ACHForm from './achForm'
import WireForm from './wireForm'
import EcheckForm from './echeckForm'
import { cn } from '@/shared/utils/cn'
import { useEffect } from 'react'
import { User } from '@/features/users/types'
import PriceNumberFlow from '../../../../shared/ui/PriceNumberFlow'
import { CircleIcon } from '@phosphor-icons/react'
import DoradoAccountForm from './doradoAccountForm'
import { usePaymentMethods } from '@/features/payments/queries'

export default function PayoutStep({ user }: { user?: User }) {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  // The method rows (D207). The old array lookups here keyed on LABEL
  // ('ACH' against 'ACH Transfer'), so they never matched and every cost fell
  // through to its ?? fallback; the rows are keyed by type, which does.
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')

  const selected = usePurchaseOrderCheckoutStore((state) => state.data.payout?.method)
  const storeData = usePurchaseOrderCheckoutStore((state) => state.data.payout)

  const achForm = useForm<AchPayout>({
    resolver: zodResolver(achSchema),
    mode: 'onChange',
    defaultValues: {
      account_holder_name:
        storeData?.method === 'ACH' ? storeData.account_holder_name : user?.name ?? '',
      bank_name: storeData?.method === 'ACH' ? storeData.bank_name : '',
      routing_number: storeData?.method === 'ACH' ? storeData.routing_number : '',
      account_number: storeData?.method === 'ACH' ? storeData.account_number : '',
      account_type: storeData?.method === 'ACH' ? storeData.account_type : 'Checking',
      confirmation: storeData?.method === 'ACH' ? storeData.confirmation : false,
      cost: Number(payoutMethods.find((option) => option.type === 'ACH')?.flat_fee ?? 0),
    },
  })

  const wireForm = useForm<WirePayout>({
    resolver: zodResolver(wireSchema),
    mode: 'onChange',
    defaultValues: {
      account_holder_name:
        storeData?.method === 'WIRE' ? storeData.account_holder_name : user?.name ?? '',
      bank_name: storeData?.method === 'WIRE' ? storeData.bank_name : '',
      routing_number: storeData?.method === 'WIRE' ? storeData.routing_number : '',
      account_number: storeData?.method === 'WIRE' ? storeData.account_number : '',
      confirmation: storeData?.method === 'WIRE' ? storeData.confirmation : false,
      cost: Number(payoutMethods.find((option) => option.type === 'WIRE')?.flat_fee ?? 20),
    },
  })

  const echeckForm = useForm<EcheckPayout>({
    resolver: zodResolver(echeckSchema),
    mode: 'onChange',
    shouldUnregister: false,
    defaultValues: {
      account_holder_name:
        storeData?.method === 'ECHECK' ? storeData.account_holder_name : user?.name ?? '',
      payout_email: storeData?.method === 'ECHECK' ? storeData.payout_email : user?.email ?? '',
      cost: Number(payoutMethods.find((option) => option.type === 'ECHECK')?.flat_fee ?? 0),
    },
  })

  const doradoAccountForm = useForm<DoradoPayout>({
    resolver: zodResolver(doradoAccountSchema),
    mode: 'onChange',
    shouldUnregister: false,
    defaultValues: {
      account_holder_name:
        storeData?.method === 'DORADO_ACCOUNT' ? storeData.account_holder_name : user?.name ?? '',
      payout_email:
        storeData?.method === 'DORADO_ACCOUNT' ? storeData.payout_email : user?.email ?? '',
      cost: Number(payoutMethods.find((option) => option.type === 'DORADO_ACCOUNT')?.flat_fee ?? 0),
    },
  })

  useEffect(() => {
    if (selected === 'ACH') {
      setData({ payoutValid: achForm.formState.isValid })
    } else if (selected === 'WIRE') {
      setData({ payoutValid: wireForm.formState.isValid })
    } else if (selected === 'ECHECK') {
      setData({ payoutValid: echeckForm.formState.isValid })
    } else if (selected === 'DORADO_ACCOUNT') {
      setData({ payoutValid: doradoAccountForm.formState.isValid })
    }
  }, [
    selected,
    achForm.formState.isValid,
    wireForm.formState.isValid,
    echeckForm.formState.isValid,
    doradoAccountForm.formState.isValid,
    setData,
  ])

  useEffect(() => {
    if (selected === 'ACH') {
      achForm.trigger()
    } else if (selected === 'WIRE') {
      wireForm.trigger()
    } else if (selected === 'ECHECK') {
      echeckForm.trigger()
    } else if (selected === 'DORADO_ACCOUNT') {
      doradoAccountForm.trigger()
    }
  }, [selected])

  const handleFormSwitch = (method: PayoutMethodType) => {
    if (method === 'ACH') {
      setData({
        payout: {
          method: method,
          ...achForm.getValues(),
        },
      })
    } else if (method === 'WIRE') {
      setData({
        payout: {
          method: method,
          ...wireForm.getValues(),
        },
      })
    } else if (method === 'ECHECK') {
      setData({
        payout: {
          method: method,
          ...echeckForm.getValues(),
        },
      })
    } else {
      setData({
        payout: {
          method: method,
          ...doradoAccountForm.getValues(),
        },
      })
    }
  }

  return (
    <div className="rounded-lg border border-border">
      {payoutMethods.map((option, index) => {
        const isSelected = selected === option.type
        const Icon = payoutMethodIcon[option.type as PayoutMethodType]

        return (
          <div key={option.type} className="overflow-hidden">
            <button
              type="button"
              onClick={() => {
                const next = selected === option.type ? null : option.type
                if (next) handleFormSwitch(next as PayoutMethodType)
              }}
              className={cn(
                'w-full p-4 text-left flex items-center cursor-pointer',
                isSelected && 'bg-transparent',
                !isSelected && 'opacity-80'
              )}
            >
              <div className="flex items-center gap-2 w-full justify-between">
                <div className="flex flex-col w-full">
                  <div className="flex items-center gap-1">
                    {Icon && <Icon size={24} className='text-primary' />}
                    <strong>{option.label}</strong>
                    <div className="flex items-center gap-2 pt-1 pl-4">
                      <small>{option.time_delay}</small>
                      <CircleIcon size={6} weight="fill" className="text-placeholder" />
                      <small>
                        {Number(option.flat_fee ?? 0) === 0 ? 'Free' : <PriceNumberFlow value={Number(option.flat_fee)} />}
                      </small>
                    </div>
                  </div>

                  <div className="flex items-end w-full justify-between mt-2">
                    <small>{option.short_description}</small>
                  </div>
                </div>
                <ChevronDown
                  className={
                    isSelected ? 'rotate-180 transition-transform' : 'transition-transform'
                  }
                />
              </div>
            </button>

            <div
              className={cn(
                'transition-all duration-500 bg-background border-b border-border rounded-b-lg',
                index === payoutMethods.length - 1 && 'border-none'
              )}
            >
              <ACHForm form={achForm} visible={option.type === 'ACH' && isSelected} />
              <WireForm form={wireForm} visible={option.type === 'WIRE' && isSelected} />
              <EcheckForm form={echeckForm} visible={option.type === 'ECHECK' && isSelected} />
              <DoradoAccountForm
                form={doradoAccountForm}
                visible={option.type === 'DORADO_ACCOUNT' && isSelected}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
