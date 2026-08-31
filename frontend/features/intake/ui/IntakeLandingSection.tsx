import { intakeOptions } from '@/features/intake/types'
import { Button } from '@dorado/components'
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

                      {/* Was a four-step responsive ramp (text-xl -> text-4xl).
                          The scale has one size per tag; h2 (28px) is the
                          landing-section heading and sits between the old
                          extremes. */}
                      <h2>{opt.label}</h2>
                    </div>

                    <p className="mt-2 max-w-55 md:max-w-sm">{opt.blurb}</p>
                    <Button variant="tertiary" className="self-start mt-3">
                      Learn More
                      <ArrowRightIcon size={16} />
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
