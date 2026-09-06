import { AuthShell } from '@/shared/ui/auth/AuthShell'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>
}
