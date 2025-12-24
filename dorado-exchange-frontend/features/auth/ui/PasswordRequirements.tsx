'use client'

import { CheckIcon, XIcon } from '@phosphor-icons/react'
import { Control, useWatch } from 'react-hook-form'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheckIcon, CircleXIcon } from 'lucide-react'

const rules = [
  { label: 'At least 6 characters', validate: (pw: string) => pw.length >= 6 },
  { label: 'One uppercase letter', validate: (pw: string) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', validate: (pw: string) => /[a-z]/.test(pw) },
  { label: 'One number', validate: (pw: string) => /\d/.test(pw) },
  {
    label: 'One special character - @, $, !, %, *, ?, &',
    validate: (pw: string) => /[@$!%*?&]/.test(pw),
  },
]

export function PasswordRequirements<T extends Record<string, any>>({
  control,
  name = 'newPassword',
}: {
  control: Control<T>
  name?: keyof T
}) {
  const pw = useWatch({ control, name: name as any }) as string

  return (
    <AnimatePresence initial={false}>
      {pw.length > 0 && (
        <motion.div
          key="pw-reqs"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'tween', duration: 0.25 }}
          className="overflow-hidden w-full"
        >
          <div className="flex gap-1 md:gap-2 mb-2">
            {rules.map(({ validate }, i) => {
              const ok = validate(pw)
              return (
                <div key={i} className="relative flex-1 h-1 bg-destructive">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: ok ? 1 : 0 }}
                    transition={{ type: 'tween', duration: 0.2 }}
                    style={{ transformOrigin: 'left' }}
                    className="absolute inset-0 bg-success border-1 border-success"
                  />
                </div>
              )
            })}
          </div>

          {/* rule list */}
          <ul className="space-y-1 text-xs md:text-sm">
            {rules.map(({ label, validate }) => {
              const ok = validate(pw)
              return (
                <li key={label} className="flex items-center justify-between">
                  <span className={ok ? 'text-success' : 'text-destructive'}>{label}</span>
                  {ok ? (
                    <CircleCheckIcon size={16} className="text-success" />
                  ) : (
                    <CircleXIcon size={16} className="text-destructive" />
                  )}
                </li>
              )
            })}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
