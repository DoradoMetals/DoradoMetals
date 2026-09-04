import { Link } from '@dorado/components'
import NextLink from 'next/link'
import { payoutMethodIcon, PayoutMethodType } from '@/features/payouts/types'
import { usePaymentMethods } from '@dorado/client'
import { Button } from '@dorado/components'
import { ArrowUpRight } from '@dorado/icons'
import { useRouter } from 'next/navigation'

export function Payout() {
  const router = useRouter()
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')

  return (
    <section aria-label="Payout Methods" className="w-full p-4 lg:py-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-4 sm:mb-8">
          <h2>Same Day Payouts</h2>
          <p className="mt-2 max-w-3xl">
            Don&apos;t like long wait times for payouts? We send it the same day we receive your
            metal.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-10">
          {payoutMethods.map((opt) => {
            const Icon = payoutMethodIcon[opt.type as PayoutMethodType]
            return (
              <div
                key={opt.type}
                /* ⚠ WAS WHITE-ON-WHITE, AND THE COMMENT THAT USED TO SIT HERE
                   SAID IT WAS FIXED. The card was `bg-primary
                   text-primary-foreground` (D95's cross-element fix) — but
                   `text-primary-foreground` only reaches descendants that do
                   not set a colour of their own, and typography.css gives
                   `h3` `--foreground` (#f3f4f7) and `p`
                   `--muted-foreground` in @layer base. Both won. So every
                   card on this section rendered a near-white heading and a
                   grey paragraph on a near-white ground: 1.02:1, live.
                   Ruling 19 says chrome carries no hue and panels separate by
                   BORDER, so the fill goes rather than the text being
                   re-painted a third time. */
                className="group relative rounded-xl border border-border bg-card p-4 transition has-[.arrow:hover]:-translate-y-0.5"
              >
                <div className="flex items-center justify-between w-full mb-2 md:mb-4 lg:mb-10">
                  <div className="flex items-center gap-2">
                    <Icon className="hidden md:block" size={48} />
                    <Icon className="md:hidden" size={36} />
                    <h3 className="truncate mb-0 pb-0 md:hidden">{opt.label}</h3>
                  </div>

                  {/* Navigation is a LINK, not a button (Jacob's rule). An
                      icon-only link: the icon takes the link's colour, hover
                      brightens it, middle-click works. */}
                  <Link asChild className="arrow inline-flex size-8 items-center justify-center">
                    <NextLink href="/payout-options" aria-label={`${opt.label} payout details`}>
                    <ArrowUpRight className="hidden md:block" size={20} />
                    <ArrowUpRight className="md:hidden" size={16} />
                  </NextLink>
                  </Link>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <h3 className="hidden md:block truncate mb-0 pb-0">{opt.label}</h3>

                  <p>{opt.long_description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
