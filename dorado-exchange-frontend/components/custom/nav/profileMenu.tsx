import React from 'react'
import { Dropdown, Tabs, Tab, TriggerWrapper } from '@/components/lukacho/dropdown-menu'
import Link from 'next/link'
import SignOutButton from '../auth/signOutButton'
import { ThemeSwitcher } from '../theme/theme-switcher'
import { useUserStore } from '@/store/useUserStore'
import ProfileTrigger from './profileTrigger'
import { useRouter } from 'next/navigation'
import { ArrowRight, UserPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeSwitcherDesktop } from '../theme/theme-switcher-desktop'

export default function ProfileMenu() {
  const { user } = useUserStore()
  const router = useRouter();

  return (
    <div className="relative flex w-full justify-start md:justify-center">
      <Dropdown>
        {user ? (
          <TriggerWrapper>
            <ProfileTrigger />
          </TriggerWrapper>
        ) : null}

        <Tabs className="bg-background shadow-lg p-2 w-40">
          <Tab>
            <div className="flex flex-col gap-2">
              {user ? (
                <>
                  <Button
                    variant="ghost"
                    effect="expandIcon"
                    iconPlacement="right"
                    iconSize={20}
                    onClick={
                      () => {router.push('/account')}
                    }
                    icon={UserPen}
                    className="px-3 h-8 py-1 text-md font-light hover:bg-background hover:text-primary"
                  >
                    Go to Account
                  </Button>

                  <ThemeSwitcherDesktop />

                  <div className="border-t border-neutral-700 my-2" />

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
