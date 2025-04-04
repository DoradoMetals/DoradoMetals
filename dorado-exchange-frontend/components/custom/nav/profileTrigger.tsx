import React from 'react'
import { User2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useUser } from '@/lib/authClient'

export default function ProfileTrigger() {
  const { user } = useUser();
  return (
    <div className="flex items-center">
      {user ? (
        <Avatar>
          <AvatarFallback className="bg-card text-muted-foreground">
            <User2 />
          </AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  )
}
