'use client'

import { Button } from '@dorado/components'
import { Mail, MessageSquareText, MonitorSmartphone, Smartphone, LogOut } from '@dorado/icons'
import { useGetSession, useRequestPasswordReset } from '@/shared/hooks/auth/queries'
import { AccountAction } from './AccountAction'
import { useState } from 'react'
import ChangePasswordForm from '@/shared/ui/ChangePasswordForm'
import { ActiveDevices } from './ActiveDevices'

export function PasswordAndSecurity() {
  const { user } = useGetSession()
  const requestPasswordReset = useRequestPasswordReset()

  const [showDevices, setShowDevices] = useState(false)

  const handlePasswordReset = () => {
    if (!user?.email) return
    requestPasswordReset.mutate(user.email)
  }

  return (
    <section className="w-full bg-card p-4 rounded-lg">
      <div className="border-b border-border pb-6 mb-6">
        <p className="eyebrow mb-6">Change Password</p>

        <ChangePasswordForm showTitle={false} />
      </div>

      <div className="border-b border-border pb-6 mb-6">
        <p className="eyebrow mb-6">Request Password Reset</p>

        <Button
          type="button"
          variant="secondary"
          onClick={handlePasswordReset}
          disabled={!user?.email || requestPasswordReset.isPending}
          className="w-full mb-8"
        >
          {requestPasswordReset.isPending ? 'Sending...' : 'Request Password Reset'}
        </Button>

        {!user?.email && (
          <p className="mt-2">
            Add an email to your account before requesting a reset link.
          </p>
        )}
      </div>

      <div className="border-b border-border pb-6 mb-6">
        <p className="eyebrow mb-4">Set Up Two-Factor Auth</p>

        <div className="space-y-3">
          <AccountAction
            icon={Smartphone}
            label="Authenticator App"
            description="Coming soon"
            buttonLabel="Set Up"
          />

          <AccountAction
            icon={Mail}
            label="Email"
            description="Coming soon"
            buttonLabel="Set Up"
          />

          <AccountAction
            icon={MessageSquareText}
            label="SMS Code"
            description="Coming soon"
            buttonLabel="Set Up"
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
