import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useGetSession } from '@/shared/hooks/auth/queries'
import { signInHref } from '@/shared/utils/returnTo'

interface ProtectedPageProps {
  children: ReactNode
  requiredRoles: string[]
}

export default function ProtectedPage({ children, requiredRoles }: ProtectedPageProps) {
  const { user, isPending } = useGetSession()

  const router = useRouter()
  const pathname = usePathname()

  const role = user?.role
  const authorized = requiredRoles.includes(role ?? '')

  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!isPending) {
      if (!authorized) {
        // The page they wanted travels to the sign-in screen and back.
        router.replace(signInHref(pathname))
      }
      setChecked(true)
    }
  }, [authorized, isPending, pathname, router])

  if (!checked || isPending) return <p>Loading...</p>

  if (!authorized) return null

  return <>{children}</>
}
