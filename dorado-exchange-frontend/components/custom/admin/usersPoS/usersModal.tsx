'use client'

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAdminUser } from '@/lib/queries/admin/useAdminUser'
import { Search } from 'lucide-react'

type Props = {
  user_id: string
  username: string
  open: boolean
  setOpen: (open: boolean) => void
  color: string
}

export function UserDetailsDialog({ open, setOpen, user_id, username, color }: Props) {
  const { data: user } = useAdminUser(user_id, { enabled: open })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="p-0 text-xs font-normal hover:bg-transparent tracking-wide text-neutral-700 overflow-hidden"
        >
          <div className='w-20 sm:w-40 truncate whitespace-nowrap overflow-hidden'>{username}</div>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Username</p>
            <p>{user?.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Email</p>
            <p>{user?.email}</p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="secondary">Impersonate</Button>
            <Button variant="destructive">Disable User</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
