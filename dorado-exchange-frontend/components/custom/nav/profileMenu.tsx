import React from 'react'
import { Dropdown, Tabs, Tab, TriggerWrapper } from '@/components/lukacho/dropdown-menu'
import SignOutButton from '../auth/signOutButton'
import ProfileTrigger from './profileTrigger'
import { useRouter } from 'next/navigation'
import { List, UserPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeSwitcherDesktop } from '../theme/theme-switcher-desktop'
import { useUser } from '@/lib/authClient'

export default function ProfileMenu() {
  const { user } = useUser()
  const router = useRouter()

  return (
    <div className="relative flex w-full justify-start md:justify-center z-60">
      <Dropdown>
        {user ? (
          <TriggerWrapper>
            <ProfileTrigger />
          </TriggerWrapper>
        ) : null}

        <Tabs className="bg-card shadow-lg p-2 z-40">
          <Tab>
            <div className="flex flex-col gap-4">
              {user ? (
                <>
                  <Button
                    variant="ghost"
                    effect="expandIcon"
                    iconPlacement="right"
                    iconSize={20}
                    onClick={() => {
                      router.push('/account')
                    }}
                    icon={UserPen}
                    className="px-4 h-8 py-2 text-md font-light hover:bg-card hover:text-primary"
                  >
                    Account
                  </Button>

                  <ThemeSwitcherDesktop />

                  <div className="border-t border-neutral-300 my-2" />

                  <SignOutButton />
                </>
              ) : null}
            </div>
          </Tab>
        </Tabs>
      </Dropdown>
    </div>
  )
}
