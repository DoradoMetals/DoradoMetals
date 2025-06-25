'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown } from 'lucide-react'

import {
  payoutOptions,
  achSchema,
  wireSchema,
  echeckSchema,
  AchPayout,
  WirePayout,
  EcheckPayout,
  PayoutMethodType,
  DoradoPayout,
  doradoAccountSchema,
} from '@/types/payout'

import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import ACHForm from './achForm'
import WireForm from './wireForm'
import EcheckForm from './echeckForm'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import { User } from '@/types/user'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { AsteriskIcon, CircleIcon, DotIcon, DotOutlineIcon, MinusIcon } from '@phosphor-icons/react'
import DoradoAccountForm from './doradoAccountForm'

export default function PayoutStep({ user }: { user?: User }) {
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

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
      cost: payoutOptions.find((option) => option.label === 'ACH')?.cost ?? 0,
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
      cost: payoutOptions.find((option) => option.label === 'WIRE')?.cost ?? 20,
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
      cost: payoutOptions.find((option) => option.label === 'ECHECK')?.cost ?? 0,
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
      cost: payoutOptions.find((option) => option.label === 'DORADO_ACCOUNT')?.cost ?? 0,
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
    <div className="rounded-lg border border-border raised-off-page">
      {payoutOptions.map((option, index) => {
        const isSelected = selected === option.method

        return (
          <div key={option.method} className="overflow-hidden">
            <button
              type="button"
              onClick={() => {
                const next = selected === option.method ? null : option.method
                if (next) handleFormSwitch(next)
              }}
              className={cn(
                'w-full p-4 text-left flex items-center cursor-pointer',
                selected === option.method && 'bg-transparent',
                selected !== option.method && 'opacity-80'
              )}
            >
              <div className="flex items-center gap-2 w-full justify-between">
                <div className="flex flex-col w-full">
                  <div className="flex items-center gap-1">
                    <option.icon size={24} color={getPrimaryIconStroke()} />
                    <span className="font-medium">{option.label}</span>
                    <div className="text-neutral-700 text-xs flex items-center gap-2 pt-1 pl-4">
                      <span>{option.time_delay}</span>
                      <CircleIcon size={6} weight="fill" className="text-neutral-300" />
                      <span>
                        {option.cost === 0.0 ? 'Free' : <PriceNumberFlow value={option.cost} />}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end w-full justify-between mt-2">
                    <span className="text-sm text-neutral-600">{option.description}</span>
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
                index === payoutOptions.length - 1 && 'border-none'
              )}
            >
              <ACHForm form={achForm} visible={option.method === 'ACH' && isSelected} />
              <WireForm form={wireForm} visible={option.method === 'WIRE' && isSelected} />
              <EcheckForm form={echeckForm} visible={option.method === 'ECHECK' && isSelected} />
              <DoradoAccountForm
                form={doradoAccountForm}
                visible={option.method === 'DORADO_ACCOUNT' && isSelected}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
