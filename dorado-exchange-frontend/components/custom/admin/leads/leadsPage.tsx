'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { useGetSession } from '@/lib/queries/useAuth'
import { useCreateLead, useLeads } from '@/lib/queries/useLeads'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import LeadsTable from './leadsTable'
import LeadsCards from './leadsCards'
import { LeadCard, LeadsStats } from '@/types/leads'
import formatPhoneNumber, { normalizePhone } from '@/utils/formatPhoneNumber'

export function LeadsPage() {
  const { user } = useGetSession()

  const { data: leads = [] } = useLeads()
  const [selectedCard, setSelectedCard] = useState<LeadCard>(null)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [email, setEmail] = useState('')

  const createLead = useCreateLead()

  const isValidEmail = (val: string) => {
    if (!val) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
  }

  const stats: LeadsStats = useMemo(() => {
    const total = leads.length
    const responded = leads.filter((l) => !!l.responded).length
    const converted = leads.filter((l) => !!l.converted).length
    const contacted = leads.filter((l) => !!l.contacted).length
    return {
      totalLeads: total,
      respondedCount: responded,
      convertedCount: converted,
      contactedCount: contacted,
    }
  }, [leads])

  const phoneDisplay = useMemo(() => formatPhoneNumber(phoneDigits), [phoneDigits])
  const hasPhone = phoneDigits.replace(/\D/g, '').length >= 10
  const emailOk = isValidEmail(email)
  const canSubmit = (hasPhone || (!!email && emailOk)) && emailOk

  const handleCreateNewLead = () => {
    try {
      createLead.mutate({
        name: name,
        phone: phoneDigits,
        email: email || 'null',
        created_by: user?.name ?? '',
        updated_by: user?.name ?? '',
      })

      setName('')
      setEmail('')
      setPhoneDigits('')
      setOpen(false)
    } catch (err) {
      console.error('Lead creation failed', err)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="tracking-widest text-xs text-neutral-600 uppercase mr-auto mb-2">
              Create New Lead
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col w-full justify-center items-center">
            <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 rounded-lg">
              <div className="relative w-full">
                <FloatingLabelInput
                  label="Name"
                  type="text"
                  size="sm"
                  className="input-floating-label-form h-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {name !== '' && (
                  <Button
                    variant="ghost"
                    onClick={() => setName('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                    tabIndex={-1}
                    aria-label="Clear name"
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>

              <div className="relative w-full">
                <FloatingLabelInput
                  label="Phone Number"
                  type="text"
                  inputMode="tel"
                  autoComplete="tel"
                  size="sm"
                  className="input-floating-label-form h-10"
                  maxLength={17}
                  value={phoneDisplay}
                  onChange={(e) => {
                    setPhoneDigits(normalizePhone(e.target.value))
                  }}
                />
                {phoneDigits !== '' && (
                  <Button
                    variant="ghost"
                    onClick={() => setPhoneDigits('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                    tabIndex={-1}
                    aria-label="Clear phone"
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>

              <div className="relative w-full">
                <FloatingLabelInput
                  label="Email"
                  type="email"
                  size="sm"
                  className="input-floating-label-form h-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {email !== '' && (
                  <Button
                    variant="ghost"
                    onClick={() => setEmail('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                    tabIndex={-1}
                    aria-label="Clear email"
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>

              <Button
                variant="default"
                className="liquid-gold raised-off-page text-white hover:text-white p-4 w-full"
                disabled={!canSubmit}
                onClick={handleCreateNewLead}
              >
                Create Lead
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LeadsCards selectedCard={selectedCard} setSelectedCard={setSelectedCard} stats={stats} />
      <LeadsTable setOpen={setOpen} selectedCard={selectedCard} />
    </>
  )
}
