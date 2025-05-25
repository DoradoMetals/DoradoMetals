'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { useCreateUser } from '@/lib/queries/useAuth'
import { X } from 'lucide-react'
import { useState } from 'react'
import UsersTable from './usersTable'

export function UsersPage() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const createUser = useCreateUser()

  const handleCreateNewUser = () => {
    try {
      const userName = name === '' ? 'New User' : name
      createUser.mutate({ email: email, name: userName })
      setEmail('')
      setName('')
    } catch (err) {
      console.error('User creation failed', err)
    }
  }

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="tracking-widest text-xs text-neutral-600 uppercase mr-auto mb-2">
              Create New User
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col w-full justify-center items-center">
            <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 rounded-lg">
              <div className="relative w-full">
                <FloatingLabelInput
                  label="Email"
                  type="email"
                  size="sm"
                  className="input-floating-label-form h-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {email !== '' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEmail('')
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                    tabIndex={-1}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
              <div className="relative w-full">
                <FloatingLabelInput
                  label="Name"
                  type="name"
                  size="sm"
                  className="input-floating-label-form h-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {email !== '' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setName('')
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                    tabIndex={-1}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>

              <Button
                variant="default"
                className="liquid-gold raised-off-page text-white hover:text-white p-4 w-full"
                disabled={!isValidEmail(email)}
                onClick={() => {
                  handleCreateNewUser()
                }}
              >
                Create New User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <UsersTable setOpen={setOpen} />
    </>
  )
}
