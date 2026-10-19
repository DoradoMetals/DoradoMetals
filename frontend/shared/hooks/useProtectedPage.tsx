import { ReactNode, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useGetSession } from '@/shared/hooks/auth/queries'
import { sessionVerdict } from '@/shared/hooks/sessionVerdict'
import { signInHref } from '@/shared/utils/returnTo'

interface ProtectedPageProps {
  children: ReactNode
  requiredRoles: string[]
}

const RETRY_MS = 5000

export default function ProtectedPage({ children, requiredRoles }: ProtectedPageProps) {
  const { user, error, isPending, retry } = useGetSession()

  const router = useRouter()
  const pathname = usePathname()

  const verdict = sessionVerdict({ user, error, isPending })
  const authorized = requiredRoles.includes(user?.role ?? '')

  // The last session that was good. A failed refetch on window focus does not
  // clear it; only a definitive signed-out answer does.
  const lastGood = useRef(false)
  if (verdict === 'in') lastGood.current = authorized
  if (verdict === 'out') lastGood.current = false

  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (verdict === 'in' || verdict === 'out') {
      if (!authorized) router.replace(signInHref(pathname))
      setChecked(true)
    }
  }, [authorized, verdict, pathname, router])

  useEffect(() => {
    if (verdict !== 'unknown') return
    const timer = setTimeout(() => retry?.(), RETRY_MS)
    return () => clearTimeout(timer)
  }, [verdict, error, retry])

  if (verdict === 'unknown') return lastGood.current ? <>{children}</> : <p>Loading...</p>

  if (!checked || verdict === 'pending')
    return lastGood.current ? <>{children}</> : <p>Loading...</p>

  if (!authorized) return null

  return <>{children}</>
}
