'use client'

import * as React from 'react'
import { Badge, Button, Card, Input, RadioGroup, Select, Text } from '@dorado/components'
import {
  useAddressBook,
  useAdminUser,
  useFundingSources,
  useLinkedAccounts,
  usePaymentMethods,
  useResendBankLink,
  useSendBankLink,
} from '@dorado/client'
import type { AdminPayout, BankLinkChannel, LinkedAccount } from '@dorado/contracts'

import { hasLots, isRefiner, type DrawerState } from '../../_lib/createOrder'
import {
  BANK_METHODS,
  PAYOUT_LABEL,
  accountLabel,
  addressLabel,
  formatPhone,
} from '../../_lib/createOrderView'
import { Chip, Section, Tile } from './parts'

const LATER = 'later'
const NEW_ACCOUNT = 'new'

export function TransactionStep({
  state,
  update,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
}) {
  if (isRefiner(state.kind)) {
    return (
      <Section title="Settlement comes later">
        <Text variant="small" className="text-muted-foreground">
          A refiner order settles after assay, on the refiner order screen.
        </Text>
      </Section>
    )
  }
  if (state.kind === 'customer_sale') return <SalePayment state={state} update={update} />
  return <PurchasePayout state={state} update={update} />
}

function SalePayment({
  state,
  update,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
}) {
  const methods = (usePaymentMethods('sale').data ?? [])
    .filter((method) => method.enabled)
    .map((method) => ({ value: method.id, label: method.label }))
  const addresses = (useAddressBook(state.customer_id).data ?? [])
    .filter((entry) => entry.address)
    .map((entry) => ({ value: entry.address.id, label: addressLabel(entry) }))
  return (
    <Section title="How do they pay?">
      <Select
        label="Payment method"
        placeholder="Choose a payment method"
        items={methods}
        value={state.payment_method_id ?? undefined}
        onValueChange={(payment_method_id) => update({ payment_method_id })}
      />
      <Select
        label="Billing address"
        placeholder="Choose the billing address"
        items={addresses}
        value={state.recipient_address_id ?? undefined}
        onValueChange={(recipient_address_id) => update({ recipient_address_id })}
      />
    </Section>
  )
}

function PurchasePayout({
  state,
  update,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
}) {
  const methods = (usePaymentMethods('purchase').data ?? []).filter((method) => method.enabled)
  const customer = useAdminUser(state.customer_id).data
  const accounts = useLinkedAccounts(state.customer_id).data ?? []
  const lots = hasLots(state)
  const payout = state.payout === LATER || state.payout === null ? null : state.payout
  const selected = state.payout === LATER ? LATER : (payout?.method ?? '')
  const bank = payout !== null && BANK_METHODS.includes(payout.method)
  const verified = accounts.filter((link) => link.status === 'verified')
  const [linking, setLinking] = React.useState(false)
  const [sentId, setSentId] = React.useState<string | null>(null)

  const setPayout = (next: AdminPayout) => update({ payout: next })

  React.useEffect(() => {
    if (!payout || !bank) return
    const sent = sentId ? verified.find((link) => link.id === sentId) : undefined
    if (sent && payout.bank_link_id !== sent.id) {
      setLinking(false)
      setSentId(null)
      setPayout({ ...payout, bank_link_id: sent.id })
      return
    }
    if (!linking && !payout.bank_link_id && verified[0]) {
      setPayout({ ...payout, bank_link_id: verified[0].id })
    }
  })

  const chooseMethod = (method: string) => {
    if (method === LATER) return update({ payout: LATER })
    setPayout({ method })
  }

  const chosen = payout?.bank_link_id
    ? accounts.find((link) => link.id === payout.bank_link_id)
    : undefined
  const pending = accounts.find((link) => link.status === 'pending')
  const showSend = bank && (linking || verified.length === 0)

  return (
    <>
      <Section title="How do we pay them?">
        <RadioGroup
          value={selected}
          onValueChange={chooseMethod}
          className="grid grid-cols-1 gap-xs sm:grid-cols-2"
        >
          {methods.map((method) => (
            <Tile
              key={method.id}
              value={method.type}
              title={PAYOUT_LABEL[method.type] ?? method.label}
              description={method.label}
            />
          ))}
          <Tile
            value={LATER}
            title="Decide later"
            disabled={lots}
            description={
              lots
                ? 'Set it on the order screen once lots are added.'
                : 'The order screen asks for it before anything is paid.'
            }
          />
        </RadioGroup>
      </Section>
      {payout?.method === 'ECHECK' && (
        <Section title="Details">
          <Text variant="small">{`${customer?.email ?? ''} · email on file`}</Text>
        </Section>
      )}
      {bank && payout && (
        <Section title="Accounts">
          {!showSend && (
            <>
              <Select
                label="Payout to"
                placeholder="Choose an account"
                items={[
                  ...verified.map((link) => ({ value: link.id, label: accountLabel(link) })),
                  { value: NEW_ACCOUNT, label: 'Link a new account' },
                ]}
                value={payout.bank_link_id ?? undefined}
                onValueChange={(value) => {
                  if (value === NEW_ACCOUNT) {
                    setLinking(true)
                    setSentId(null)
                    setPayout({ method: payout.method })
                    return
                  }
                  setPayout({ ...payout, bank_link_id: value })
                }}
              />
              {chosen && <AccountDetails link={chosen} />}
            </>
          )}
          <FundingSourceField payout={payout} onChange={setPayout} />
          {showSend && (
            <SendLink
              userId={state.customer_id}
              phone={customer?.phone_number ?? null}
              email={customer?.email ?? null}
              pending={
                sentId ? accounts.find((link) => link.id === sentId) : linking ? undefined : pending
              }
              onSent={setSentId}
            />
          )}
        </Section>
      )}
    </>
  )
}

function AccountDetails({ link }: { link: LinkedAccount }) {
  return (
    <Card className="gap-2xs">
      <div className="flex items-center justify-between gap-sm">
        <Text variant="small-medium">{link.bank_name ?? 'Bank'}</Text>
        <Badge variant="soft" intent={link.status === 'verified' ? 'success' : 'warning'}>
          {link.status === 'verified' ? 'Verified' : 'Pending'}
        </Badge>
      </div>
      <Text variant="micro" className="text-muted-foreground">
        {[link.account_name, link.last_four ? `···· ${link.last_four}` : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Card>
  )
}

function FundingSourceField({
  payout,
  onChange,
}: {
  payout: AdminPayout
  onChange: (payout: AdminPayout) => void
}) {
  const sources = useFundingSources().data ?? []
  return (
    <Select
      label="Payout from"
      placeholder="Default funding source"
      items={sources.map((source) => ({
        value: source.id,
        label: source.mask ? `${source.label} · ···· ${source.mask}` : source.label,
      }))}
      value={payout.funding_source_id ?? undefined}
      onValueChange={(funding_source_id) => onChange({ ...payout, funding_source_id })}
    />
  )
}

function SendLink({
  userId,
  phone,
  email,
  pending,
  onSent,
}: {
  userId: string | null
  phone: string | null
  email: string | null
  pending: LinkedAccount | undefined
  onSent: (id: string) => void
}) {
  const [channel, setChannel] = React.useState<BankLinkChannel>('sms')
  const send = useSendBankLink(userId)
  const resend = useResendBankLink(userId)
  const to = channel === 'sms' ? formatPhone(phone) : (email ?? '')
  const sentVia = pending?.channel === 'email' ? 'email' : 'SMS'
  const sentTo = pending?.channel === 'email' ? pending?.sent_to : formatPhone(pending?.sent_to)

  return (
    <Card className="gap-sm">
      <div className="flex items-center justify-between gap-sm">
        <div className="flex flex-col gap-3xs">
          <Text variant="small-medium">No linked bank account</Text>
          <Text variant="micro" className="text-muted-foreground">
            The customer completes the link on their phone.
          </Text>
        </div>
        {pending && (
          <Badge variant="soft" intent="warning">
            Pending
          </Badge>
        )}
      </div>
      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <Text variant="micro" className="text-muted-foreground">
            {`Sent by ${sentVia} to ${sentTo ?? ''}`}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            disabled={resend.isPending}
            onClick={() => resend.mutate(pending.id)}
          >
            Resend
          </Button>
        </div>
      ) : (
        <>
          <RadioGroup
            value={channel}
            onValueChange={(value) => setChannel(value as BankLinkChannel)}
            className="flex gap-xs"
          >
            <Chip value="sms" label="SMS" />
            <Chip value="email" label="Email" />
          </RadioGroup>
          <Input label="To" value={to} readOnly />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={send.isPending || !to}
              onClick={() => send.mutate({ channel }, { onSuccess: (link) => onSent(link.id) })}
            >
              Send link
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
