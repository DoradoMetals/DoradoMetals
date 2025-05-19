'use client'

import { cn } from '@/lib/utils'
import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { useEffect, useState } from 'react'

interface CountdownRingProps {
  sentAt: string | Date
  expiresAt: string | Date
  fillColor: string
}

export default function CountdownRing({ sentAt, expiresAt, fillColor }: CountdownRingProps) {
  const sent = new Date(sentAt).getTime()
  const expires = new Date(expiresAt).getTime()
  const [now, setNow] = useState(Date.now())

  // Recalculate current time every 100ms (drift-proof)
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Derived values
  const durationSeconds = Math.max(1, Math.floor((expires - sent) / 1000)) // prevent div by 0
  const totalSecondsLeft = Math.max(0, Math.floor((expires - now) / 1000))
  const percent = totalSecondsLeft / durationSeconds

  const radius = 60
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - percent * circumference

  const hours = String(Math.floor(totalSecondsLeft / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((totalSecondsLeft % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSecondsLeft % 60).padStart(2, '0')

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-80 h-80">
        <svg className="w-full h-full transform -rotate-y-180 -rotate-z-90 drop-shadow-lg" viewBox="0 0 140 140">
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="stroke-card"
            fill="transparent"
            strokeWidth="10"
          />
          <circle
            cx="70"
            cy="70"
            r={radius}
            className={fillColor}
            fill="transparent"
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="butt"
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center text-4xl text-neutral-900 font-mono">
          <div className="flex items-start">
            <div className="flex flex-col items-center">
              <NumberFlow
                willChange
                isolate
                value={Number(hours)}
                format={{ minimumIntegerDigits: 2 }}
                opacityTiming={{ duration: 50, easing: 'ease-out' }}
                transformTiming={{
                  easing: `linear(0, 0.001 0.43%, 0.0045 0.94%, 0.0195 2.03%, 0.0444 3.19%, 0.0808 4.49%, 0.1593 6.81%, 0.3676 12.31%, 0.4683 15.14%, 0.5652, 0.6487 21.22%, 0.6871, 0.722, 0.7536 26%, 0.7832 27.67%, 0.8107, 0.835 31.15%, 0.8574 32.96%, 0.8776 34.84%, 0.897 36.94%, 0.9141 39.11%, 0.9293 41.43%, 0.9423 43.82%, 0.9539 46.43%, 0.9637 49.18%, 0.9789 55.34%, 0.9888 62.37%, 0.995 71.13%, 0.9983 82.58%, 0.9997 99.96%)`,
                  duration: 500,
                }}
              />
              <div className="text-xs text-neutral-600">Hours</div>
            </div>

            <span className="pt-1">:</span>

            <div className="flex flex-col items-center">
              <NumberFlow
                willChange
                isolate
                value={Number(minutes)}
                format={{ minimumIntegerDigits: 2 }}
                opacityTiming={{ duration: 50, easing: 'ease-out' }}
                transformTiming={{
                  easing: `linear(0, 0.001 0.43%, 0.0045 0.94%, 0.0195 2.03%, 0.0444 3.19%, 0.0808 4.49%, 0.1593 6.81%, 0.3676 12.31%, 0.4683 15.14%, 0.5652, 0.6487 21.22%, 0.6871, 0.722, 0.7536 26%, 0.7832 27.67%, 0.8107, 0.835 31.15%, 0.8574 32.96%, 0.8776 34.84%, 0.897 36.94%, 0.9141 39.11%, 0.9293 41.43%, 0.9423 43.82%, 0.9539 46.43%, 0.9637 49.18%, 0.9789 55.34%, 0.9888 62.37%, 0.995 71.13%, 0.9983 82.58%, 0.9997 99.96%)`,
                  duration: 500,
                }}
              />
              <div className="text-xs text-neutral-600">Minutes</div>
            </div>

            <span className="pt-1">:</span>

            <div className="flex flex-col items-center">
              <NumberFlow
                willChange
                isolate
                value={Number(seconds)}
                format={{ minimumIntegerDigits: 2 }}
                opacityTiming={{ duration: 50, easing: 'ease-out' }}
                transformTiming={{
                  easing: `linear(0, 0.001 0.43%, 0.0045 0.94%, 0.0195 2.03%, 0.0444 3.19%, 0.0808 4.49%, 0.1593 6.81%, 0.3676 12.31%, 0.4683 15.14%, 0.5652, 0.6487 21.22%, 0.6871, 0.722, 0.7536 26%, 0.7832 27.67%, 0.8107, 0.835 31.15%, 0.8574 32.96%, 0.8776 34.84%, 0.897 36.94%, 0.9141 39.11%, 0.9293 41.43%, 0.9423 43.82%, 0.9539 46.43%, 0.9637 49.18%, 0.9789 55.34%, 0.9888 62.37%, 0.995 71.13%, 0.9983 82.58%, 0.9997 99.96%)`,
                  duration: 500,
                }}
              />
              <div className="text-xs text-neutral-600">Seconds</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
