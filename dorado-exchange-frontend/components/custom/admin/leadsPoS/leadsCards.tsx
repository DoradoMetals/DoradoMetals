import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { InfoIcon, CheckCircleIcon, ChatsCircleIcon } from '@phosphor-icons/react'
import { ReactNode, useMemo } from 'react'
import { LeadCard, LeadsStats } from '@/types/leads'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'


export default function LeadsCards({
  selectedCard,
  setSelectedCard,
  stats,
}: {
  selectedCard: LeadCard
  setSelectedCard: (card: LeadCard | null) => void
  stats: LeadsStats
}) {
  const {
    respondedCount,
    convertedCount,
    contactedCount,
    respondedPct,
    convertedPct,
    contactedPct,
  } = useMemo(() => {
    const total = Math.max(0, stats.totalLeads || 0)
    const responded = Math.min(stats.respondedCount || 0, total)
    const converted = Math.min(stats.convertedCount || 0, total)
    const contacted = Math.min(stats.contactedCount || 0, total)
    const pct = (n: number, d: number) => (d <= 0 ? 0 : (n / d) * 100)

    return {
      respondedCount: responded,
      convertedCount: converted,
      contactedCount: contacted,
      respondedPct: pct(responded, total),
      convertedPct: pct(converted, total),
      contactedPct: pct(contacted, total),
    }
  }, [stats])

  const cards: Array<{
    key: LeadCard
    title: string
    icon: ReactNode
    count: number
    pct: number
  }> = [
    {
      key: 'Converted',
      title: 'Converted',
      icon: (
        <>
          <CheckCircleIcon className="hidden sm:flex" size={64} color={getPrimaryIconStroke()} />
          <CheckCircleIcon className="sm:hidden" size={48} color={getPrimaryIconStroke()} />
        </>
      ),
      count: convertedCount,
      pct: convertedPct,
    },
    {
      key: 'Responded',
      title: 'Responded',
      icon: (
        <>
          <ChatsCircleIcon className="hidden sm:flex" size={64} color={getPrimaryIconStroke()} />
          <ChatsCircleIcon className="sm:hidden" size={48} color={getPrimaryIconStroke()} />
        </>
      ),
      count: respondedCount,
      pct: respondedPct,
    },
    {
      key: 'Contacted',
      title: 'Contacted',
      icon: (
        <>
          <InfoIcon className="hidden sm:flex" size={64} color={getPrimaryIconStroke()} />
          <InfoIcon className="sm:hidden" size={48} color={getPrimaryIconStroke()} />
        </>
      ),
      count: contactedCount,
      pct: contactedPct,
    },
  ]

  console.log(contactedCount)

  const fmt = (pct: number, count: number) => `${Math.round(pct)}% (${count})`

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full">
        {cards.map(({ key, title, icon, count, pct }) => {
          const isSelected = selectedCard === key
          return (
            <Button
              key={key}
              onClick={() => setSelectedCard(isSelected ? null : key)}
              className={cn(
                'cursor-pointer bg-background rounded-lg p-2 sm:p-4 raised-off-page w-full h-auto hover:bg-card',
                isSelected && 'bg-card'
              )}
            >
              <div className="flex items-start sm:items-center justify-between w-full">
                <div className="shrink-0">{icon}</div>

                <div className="flex flex-col items-end">
                  <div className="text-lg sm:text-2xl text-neutral-800">
                    {fmt(pct, count)}
                  </div>
                  <div className="text-xs sm:text-sm text-neutral-600">{title}</div>
                </div>
              </div>
            </Button>
          )
        })}
      </div>
    </div>
  )
}