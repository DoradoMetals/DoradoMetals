import { intakeOptions } from '@/features/intake/types'
import { Button } from '@/shared/ui/base/button'
import { ArrowRightIcon } from '@phosphor-icons/react'

export function Intake() {
  return (
    <>
      <section aria-label="Intake Methods" className="w-full p-4 lg:py-10">
        <div className="flex items-center justify-center">
          <div className="flex flex-col gap-10 md:gap-16 items-center justify-center max-w-5xl w-full px-6">
            {intakeOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <div
                  key={opt.method}
                  className="flex items-start justify-center gap-6 sm:gap-8 w-full"
                >
                  <Icon size={96} className="text-primary shrink-0 hidden md:block" />

                  <div className="flex flex-col">
                    <div className="flex items-end gap-2">
                      <Icon size={32} className="text-primary shrink-0 md:hidden" />

                      <h3 className="text-xl sm:text-2xl md:text-3xl md:text-4xl font-semibold text-neutral-900">
                        {opt.label}
                      </h3>
                    </div>

                    <p className="mt-2 text-neutral-700 text-sm sm:text-lg max-w-55 md:max-w-sm">
                      {opt.blurb}
                    </p>
                    <Button variant="ghost" className="self-start p-0 mb-0">
                      <span className="mt-3 inline-flex items-center gap-2 text-neutral-500 text-xs md:text-sm">
                        Learn More
                        <ArrowRightIcon size={16} className="text-neutral-500" />
                      </span>
                    </Button>
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
