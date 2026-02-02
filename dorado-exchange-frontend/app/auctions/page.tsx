'use client';

import { useAuctions } from '@/features/auctions/queries'
import { LiveAuction } from '@/features/auctions/ui/LiveAuction'
import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import { protectedRoutes } from '@/features/routes/types'
import { Suspense } from 'react'

export default function Page() {
  const { data: auctions = [] } = useAuctions()

  const liveAuction =
    auctions.find((a) => a.status === 'live') ??
    auctions.find((a) => a.status === 'scheduled') ??
    null

  return (
    <ProtectedPage requiredRoles={protectedRoutes.auctions.roles}>
      <div className="flex flex-col items-center">
        <Suspense fallback={<p>Loading...</p>}>
          {liveAuction ? (
            <LiveAuction auction_id={liveAuction.id} />
          ) : (
            <p>No active auction</p>
          )}
        </Suspense>
      </div>
    </ProtectedPage>
  )
}
