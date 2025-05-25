import React from 'react'
import { User2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useGetSession } from '@/lib/queries/useAuth'

export default function ProfileTrigger() {
  const { user } = useGetSession()
  return (
    <div className="flex items-center hover:cursor-pointer">
      {user ? (
        <Avatar>
          <AvatarFallback className="text-neutral-900 bg-transparent">
            <User2 />
          </AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  )
}
