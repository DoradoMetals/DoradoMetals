'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@dorado/components'
import { LogOut, Mail, MonitorSmartphone, Smartphone } from '@dorado/icons'

import { AccountAction } from './AccountAction'
import { ActiveDevices } from './ActiveDevices'

export function PasswordAndSecurity() {
  const router = useRouter()
  const [showDevices, setShowDevices] = useState(false)

  return (
    <section className="w-full rounded-lg bg-card p-4">
      <div className="mb-6 border-b border-border pb-6">
        <p className="eyebrow mb-4">Sign-in</p>

        <div className="space-y-3">
          <AccountAction
            icon={Smartphone}
            label="Phone"
            description="Your number is how you sign in. Every sign-in ends in a code."
            buttonLabel="Change"
            onClick={() => router.push('/settings/phone')}
          />

          <AccountAction
            icon={Mail}
            label="Email"
            description="Used when you ask for the code by email instead."
            buttonLabel="Change"
            onClick={() => router.push('/settings/email')}
          />
        </div>
      </div>

      <div className="space-y-4">
        <p className="eyebrow mb-2">Security</p>

        <div className="space-y-2">
          <AccountAction
            icon={MonitorSmartphone}
            label="Active Devices"
            description="View and manage active devices."
            buttonLabel={showDevices ? 'Hide' : 'View'}
            onClick={() => setShowDevices((prev) => !prev)}
          />
          {showDevices && <ActiveDevices />}
        </div>

        <Button type="button" variant="secondary" intent="danger" className="mt-4 w-full">
          <LogOut size={20} />
          Sign Out on All Devices
        </Button>
      </div>
    </section>
  )
}
