'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Circle } from '@dorado/icons'
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

import { usePayoutDraft } from '@/features/checkout/purchase-order-checkout/payoutStep/payoutDraft'
import ACHForm from './achForm'
import WireForm from './wireForm'
import EcheckForm from './echeckForm'
import { cn } from '@/shared/utils/cn'
import { User } from '@/features/users/types'
import PriceNumberFlow from '../../../../shared/ui/PriceNumberFlow'
import DoradoAccountForm from './doradoAccountForm'
import { usePaymentMethods } from '@dorado/client'

export default function PayoutStep({ user }: { user?: User }) {
  const setPayout = usePayoutDraft((state) => state.setPayout)

  // The method rows (D207) - the accordion, the delay and the fee, all of them
  // the server's. Each form used to seed a `cost` default off these rows with
  // a hardcoded `?? 20` for WIRE; the fee is rendered from the row directly
  // and the form never carried it anywhere, so the field is gone.
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')

  const storeData = usePayoutDraft((state) => state.payout)
  const selected = storeData?.method

  const achForm = useForm<AchPayout>({
    resolver: zodResolver(achSchema),
    mode: 'onChange',
    defaultValues: {
      account_holder_name:
        storeData?.method === 'ACH' ? storeData.account_holder_name ?? '' : user?.name ?? '',
      bank_name: storeData?.method === 'ACH' ? storeData.bank_name ?? '' : '',
      routing_number: storeData?.method === 'ACH' ? storeData.routing_number ?? '' : '',
      account_number: storeData?.method === 'ACH' ? storeData.account_number ?? '' : '',
      account_type: storeData?.method === 'ACH' ? storeData.account_type ?? 'Checking' : 'Checking',
      confirmation: storeData?.method === 'ACH' ? storeData.confirmation ?? false : false,
    },
  })

  const wireForm = useForm<WirePayout>({
    resolver: zodResolver(wireSchema),
    mode: 'onChange',
    defaultValues: {
      account_holder_name:
        storeData?.method === 'WIRE' ? storeData.account_holder_name ?? '' : user?.name ?? '',
      bank_name: storeData?.method === 'WIRE' ? storeData.bank_name ?? '' : '',
      routing_number: storeData?.method === 'WIRE' ? storeData.routing_number ?? '' : '',
      account_number: storeData?.method === 'WIRE' ? storeData.account_number ?? '' : '',
      confirmation: storeData?.method === 'WIRE' ? storeData.confirmation ?? false : false,
    },
  })

  const echeckForm = useForm<EcheckPayout>({
    resolver: zodResolver(echeckSchema),
    mode: 'onChange',
    shouldUnregister: false,
    defaultValues: {
      account_holder_name:
        storeData?.method === 'ECHECK' ? storeData.account_holder_name ?? '' : user?.name ?? '',
      payout_email: storeData?.method === 'ECHECK' ? storeData.payout_email ?? '' : user?.email ?? '',
    },
  })

  const doradoAccountForm = useForm<DoradoPayout>({
    resolver: zodResolver(doradoAccountSchema),
    mode: 'onChange',
    shouldUnregister: false,
    defaultValues: {
      account_holder_name:
        storeData?.method === 'DORADO_ACCOUNT' ? storeData.account_holder_name ?? '' : user?.name ?? '',
      payout_email:
        storeData?.method === 'DORADO_ACCOUNT' ? storeData.payout_email ?? '' : user?.email ?? '',
    },
  })

  // NO EFFECT SYNCS VALIDITY, and none needs to: every field's own onChange
  // already writes the draft, and the stepper parses that draft against
  // `payoutSchema` (payoutDraft.ts's isPayoutComplete) when it decides whether
  // "Review Order" is enabled. The two effects this replaces watched four
  // `formState.isValid` flags and called `trigger()` on a selection change.

  const handleFormSwitch = (method: PayoutMethodType) => {
    const form =
      method === 'ACH' ? achForm
        : method === 'WIRE' ? wireForm
        : method === 'ECHECK' ? echeckForm
        : doradoAccountForm
    setPayout({ method, ...form.getValues() })
    // The newly opened form has never been submitted, so nothing has computed
    // its validity yet - this is the handler that opened it.
    void form.trigger()
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
                      <Circle size={6} className="text-placeholder" />
                      <small>
                        {Number(option.flat_fee ?? 0) === 0 ? (
                          'Free'
                        ) : (
                          <PriceNumberFlow value={Number(option.flat_fee)} className="tabular-nums" />
                        )}
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
