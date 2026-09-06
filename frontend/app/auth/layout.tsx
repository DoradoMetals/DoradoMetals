import { AuthShell } from '@/shared/ui/auth/AuthShell'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>
}
