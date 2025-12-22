'use client'

import { Button } from '@/components/ui/button'
import { useGetSession, useRequestPasswordReset } from '@/lib/queries/useAuth'
import ChangePasswordForm from '../../auth/changePassword'
import { AccountAction } from '@/components/ui/account-action'
import {
  ChatTextIcon,
  DeviceMobileIcon,
  DevicesIcon,
  EnvelopeIcon,
  SignOutIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { ActiveDevices } from './activeDevices'

export function PasswordAndSecurity() {
  const { user } = useGetSession()
  const requestPasswordReset = useRequestPasswordReset()

  const [showDevices, setShowDevices] = useState(false)

  const handlePasswordReset = () => {
    if (!user?.email) return
    requestPasswordReset.mutate(user.email)
  }

  return (
    <section className="w-full bg-card raised-off-page p-4 rounded-lg">
      <div className="border-b border-neutral-200 pb-6 mb-6">
        <p className="text-xs text-neutral-500 mb-6 uppercase tracking-widest">Change Password</p>

        <ChangePasswordForm showTitle={false} />
      </div>

      <div className="border-b border-neutral-200 pb-6 mb-6">
        <p className="text-xs text-neutral-500 mb-6 uppercase tracking-widest">
          Request Password Reset
        </p>

        <Button
          type="button"
          variant="secondary"
          onClick={handlePasswordReset}
          disabled={!user?.email || requestPasswordReset.isPending}
          className="w-full mb-8 raised-off-page"
        >
          {requestPasswordReset.isPending ? 'Sending...' : 'Request Password Reset'}
        </Button>

        {!user?.email && (
          <p className="mt-2 text-xs text-neutral-500">
            Add an email to your account before requesting a reset link.
          </p>
        )}
      </div>

      <div className="border-b border-neutral-200 pb-6 mb-6">
        <p className="text-xs text-neutral-500 mb-4 uppercase tracking-widest">
          Set Up Two-Factor Auth
        </p>

        <div className="space-y-3">
          <AccountAction
            icon={DeviceMobileIcon}
            label="Authenticator App"
            description="Coming soon"
            buttonLabel="Set Up"
          />

          <AccountAction
            icon={EnvelopeIcon}
            label="Email"
            description="Coming soon"
            buttonLabel="Set Up"
          />

          <AccountAction
            icon={ChatTextIcon}
            label="SMS Code"
            description="Coming soon"
            buttonLabel="Set Up"
          />
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-neutral-500 mb-2 uppercase tracking-widest">Security</p>

        <div className="space-y-2">
          <AccountAction
            icon={DevicesIcon}
            label="Active Devices"
            description="View and manage active devices."
            buttonLabel={showDevices ? 'Hide' : 'View'}
            onClick={() => setShowDevices((prev) => !prev)}
          />
          {showDevices && <ActiveDevices />}
        </div>

        <Button
          type="button"
          className="mt-4 w-full border border-destructive text-destructive hover:text-white hover:bg-destructive bg-card hover:shadow-lg flex items-center justify-center gap-2"
          variant="outline"
        >
          <SignOutIcon size={20} />
          <span className="text-sm font-medium">Sign Out on All Devices</span>
        </Button>
      </div>
    </section>
  )
}
