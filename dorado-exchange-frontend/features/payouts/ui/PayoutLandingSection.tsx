import { payoutOptions } from '@/features/payouts/types'
import { Button } from '@/shared/ui/base/button'
import { ArrowUpRightIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'

export function Payout() {
    const router = useRouter()
  
  return (
    <>
      <section aria-label="Payout Methods" className="w-full p-4 lg:py-10">
        <div className="max-w-7xl mx-auto">
          <header className="mb-4 sm:mb-8">
            <h2 className="text-2xl text-neutral-900 sm:text-3xl font-semibold">
              Same Day Payouts
            </h2>
            <p className="text-neutral-700 text-sm sm:text-base mt-2 max-w-3xl">
              Don't like long wait times for payouts? We send it the same day we receive your metal.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-10">
            {payoutOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <div
                  key={opt.method}
                  className="group relative rounded-xl bg-primary has-[.arrow:hover]:-translate-y-0.5 transition p-4 raised-off-page"
                >
                  <div className="flex items-center justify-between w-full mb-2 md:mb-4 lg:mb-10">
                    <div className="flex items-center gap-2">
                      <Icon className="text-white hidden md:block" size={48} />
                      <Icon className="text-white md:hidden" size={36} />
                      <h3 className="text-white text-xl font-semibold truncate mb-0 pb-0 md:hidden">
                        {opt.label}
                      </h3>
                    </div>

                    <Button
                      type="button"
                      className="arrow inline-flex items-center justify-center hover:cursor-pointer p-0"
                      onClick={() => router.push('/payout-options')}
                    >
                      <ArrowUpRightIcon className="text-white hidden md:block" size={20} />
                      <ArrowUpRightIcon className="text-white md:hidden" size={16} />
                    </Button>
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <h3 className="text-white hidden md:block text-2xl font-semibold truncate mb-0 pb-0">
                      {opt.label}
                    </h3>

                    <p className="text-white text-xs md:text-sm leading-relaxed">{opt.paragraph}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
