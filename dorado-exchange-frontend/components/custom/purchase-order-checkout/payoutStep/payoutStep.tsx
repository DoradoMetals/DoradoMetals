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
} from '@/types/payout'

import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import ACHForm from './achForm'
import WireForm from './wireForm'
import EcheckForm from './echeckForm'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import { User } from '@/types/user'

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
    },
  })

  const echeckForm = useForm<EcheckPayout>({
    resolver: zodResolver(echeckSchema),
    mode: 'onChange',
    shouldUnregister: false,
    defaultValues: {
      account_holder_name: storeData?.method === 'ECHECK' ? storeData.account_holder_name : user?.name ?? '',
      payout_email: storeData?.method === 'ECHECK' ? storeData.payout_email : user?.email ?? '',
    },
  })
  

  useEffect(() => {
    if (selected === 'ACH') {
      setData({ payoutValid: achForm.formState.isValid })
    } else if (selected === 'WIRE') {
      setData({ payoutValid: wireForm.formState.isValid })
    } else if (selected === 'ECHECK') {
      setData({ payoutValid: echeckForm.formState.isValid })
    }
  }, [
    selected,
    achForm.formState.isValid,
    wireForm.formState.isValid,
    echeckForm.formState.isValid,
    setData,
  ])

  useEffect(() => {
    if (selected === 'ACH') {
      achForm.trigger()
    } else if (selected === 'WIRE') {
      wireForm.trigger()
    } else if (selected === 'ECHECK') {
      echeckForm.trigger()
    }
  }, [selected])

  const handleFormSwitch = (method: PayoutMethodType) => {
    if (method === 'ACH') {
      setData({
        payout: {
          method: method,
          ...achForm.getValues()
        }
      })
    } else if (method === 'WIRE') {
      setData({
        payout: {
          method: method,
          ...wireForm.getValues()
        }
      })
    } else {
      setData({
        payout: {
          method: method,
          ...echeckForm.getValues()
        }
      })
    }
  }

  return (
    <div className="rounded-lg border border-border">
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
                'w-full p-4 text-left flex items-center justify-between cursor-pointer',
                selected === option.method && 'bg-transparent'
              )}
            >
              <div className="flex items-center gap-3">
                <option.icon size={24} className="text-primary" />
                <div className="flex flex-col">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-sm text-muted-foreground">{option.description}</span>
                </div>
              </div>
              <ChevronDown
                className={isSelected ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </button>

            <div
              className={cn(
                'transition-all duration-500 bg-background border-b border-border',
                index === payoutOptions.length - 1 && 'border-none'
              )}
            >
              <ACHForm form={achForm} visible={option.method === 'ACH' && isSelected} />
              <WireForm form={wireForm} visible={option.method === 'WIRE' && isSelected} />
              <EcheckForm form={echeckForm} visible={option.method === 'ECHECK' && isSelected} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
