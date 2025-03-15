import React from 'react'
import { authClient } from '@/lib/authClient'
import { User2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function ProfileTrigger() {
  const { data: session } = authClient.useSession()

  return (
    <div className="flex items-center">
      {session?.user ? (
        <Avatar>
          <AvatarFallback className='bg-background text-muted-foreground'>
            <User2 />
          </AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  )
}
