import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGetSession } from '@/features/auth/queries'

interface ProtectedPageProps {
  children: ReactNode
  requiredRoles: string[]
}

export default function ProtectedPage({ children, requiredRoles }: ProtectedPageProps) {
  const { user, isPending } = useGetSession()

  const router = useRouter()

  const role = user?.role
  const authorized = requiredRoles.includes(role ?? '')

  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!isPending) {
      if (!authorized) {
        router.replace('/authentication')
      }
      setChecked(true)
    }
  }, [authorized, isPending, router])

  if (!checked || isPending) return <p>Loading...</p>

  if (!authorized) return null

  return <>{children}</>
}
