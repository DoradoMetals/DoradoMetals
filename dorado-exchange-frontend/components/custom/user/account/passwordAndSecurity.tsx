'use client'

import { Button } from '@/components/ui/button'
import { useGetSession, useRequestPasswordReset } from '@/lib/queries/useAuth'
import { Smartphone, Mail, MessageSquare, Clock3, MonitorSmartphone, LogOut } from 'lucide-react'
import ChangePasswordForm from '../../auth/changePassword'

export function PasswordAndSecurity() {
  const { user } = useGetSession()

  const requestPasswordReset = useRequestPasswordReset()

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
          variant='secondary'
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
          <TwoColumnRow
            icon={<Smartphone className="h-5 w-5 text-neutral-800" />}
            label="Authenticator App"
            description="Coming soon"
            buttonLabel="Set Up"
          />

          <TwoColumnRow
            icon={<Mail className="h-5 w-5 text-neutral-800" />}
            label="Email"
            description="Coming soon"
            buttonLabel="Set Up"
          />

          <TwoColumnRow
            icon={<MessageSquare className="h-5 w-5 text-neutral-800" />}
            label="SMS Code"
            description="Coming soon"
            buttonLabel="Set Up"
          />
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-neutral-500 mb-2 uppercase tracking-widest">Security</p>

        <TwoColumnRow
          icon={<Clock3 className="h-5 w-5 text-neutral-800" />}
          label="Login History"
          description="Coming soon"
          buttonLabel="View"
        />

        <TwoColumnRow
          icon={<MonitorSmartphone className="h-5 w-5 text-neutral-800" />}
          label="Devices"
          description="Coming soon"
          buttonLabel="View"
        />

        <Button
          type="button"
          className="mt-4 w-full border border-destructive text-destructive hover:text-white hover:bg-destructive bg-card hover:shadow-lg"
          variant="outline"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out on All Devices
        </Button>
      </div>
    </section>
  )
}

type TwoColumnRowProps = {
  icon: React.ReactNode
  label: string
  description?: string
  buttonLabel: string
}

function TwoColumnRow({ icon, label, description, buttonLabel }: TwoColumnRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-neutral-900">{label}</span>
          {description && (
            <span className="text-xs text-neutral-500 leading-tight">{description}</span>
          )}
        </div>
      </div>

      <Button type="button" size="sm" variant="secondary" className="text-xs px-3 py-1 h-8 raised-off-page">
        {buttonLabel}
      </Button>
    </div>
  )
}
