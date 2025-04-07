// components/dialogs/UserDetailsDialog.tsx
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
import { User } from 'lucide-react'

type Props = {
  user_id: string
  username: string
  open: boolean,
  setOpen: (open: boolean) => void; 
  trigger?: React.ReactNode
}

export function UserDetailsDialog({ open, setOpen, user_id, trigger, username }: Props) {

  const { data: user, isLoading } = useAdminUser(user_id, { enabled: open })
  

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="flex items-center justify-center p-0 text-sm font-normal hover:bg-transparent">
          <User size={16} />
           {username}
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

          {/* Future action buttons */}
          <div className="flex gap-2 pt-4">
            <Button variant="secondary">Impersonate</Button>
            <Button variant="destructive">Disable User</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
