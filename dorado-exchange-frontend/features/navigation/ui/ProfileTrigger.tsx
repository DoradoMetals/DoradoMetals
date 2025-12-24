import { User2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/shared/ui/base/avatar'
import { useUser } from '@/features/auth/authClient'

export default function ProfileTrigger() {
  const { user } = useUser()
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
