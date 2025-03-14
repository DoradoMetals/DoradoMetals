import React from "react";
import { Dropdown, Tabs, Tab, TriggerWrapper } from "@/components/lukacho/dropdown-menu";
import { User, Moon, Sun } from "lucide-react";
import Link from "next/link";
import SignOutButton from "../auth/signOutButton";
import SignInButton from "../auth/signInButton";
import { ThemeSwitcher } from "../theme/theme-switcher";
import { useUserStore } from "@/store/useUserStore";
import { cn } from "@/lib/utils";

export default function ProfileMenu() {
  const { user } = useUserStore();

  return (
    <div className="relative flex w-full justify-start md:justify-center">
      <Dropdown>
        <TriggerWrapper>
          <User className="text-muted-foreground" />
        </TriggerWrapper>

        <Tabs className="bg-background p-2 w-40">
          <Tab>
            <div className="flex flex-col gap-2">
              {user ? (
                <>
                  <Link href="/profile">
                    <div className="flex items-center gap-3 p-2 cursor-pointer">
                      <span className="text-sm">Go to Profile</span>
                    </div>
                  </Link>

                  <ThemeSwitcher />

                  <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

                  <SignOutButton />
                </>
              ) : (
                <>
                  <SignInButton />
                  
                  <Link href="/register">
                    <div className="flex items-center gap-3 p-2 cursor-pointer">
                      <span className="text-sm">Sign Up</span>
                    </div>
                  </Link>
                </>
              )}
            </div>
          </Tab>
        </Tabs>
      </Dropdown>
    </div>
  );
}
