'use client';
import Drawer from "@/components/edil-ozi/drawer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/authClient";
import { Menu } from 'lucide-react';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dispatch, useState } from "react";
import SignOutButton from "../auth/signOutButton";
import SignInButton from "../auth/signInButton";

export default function Sidebar({ isDrawerActive, setIsDrawerActive }: { 
  isDrawerActive: boolean; 
  setIsDrawerActive: Dispatch<React.SetStateAction<boolean>>; 
}) {
  const { data: session } = authClient.useSession();

  const pathname = usePathname();
  const menuItems = [
    {
      key: 1,
      label: 'Buy from Us',
      src: '/buy',
      className: pathname === '/buy' ? "text-primary" : "text-muted",
    },
    {
      key: 2,
      label: 'Sell to Us',
      src: '/sell',
      className: pathname === '/sell' ? "text-primary" : "text-muted",
    },
    {
      key: 3,
      label: "Account",
      src: "/account",
      className: pathname === "/account" ? "text-primary" : "text-muted",
    }
  ];

  const drawerContent = (
    <>
      <div className="w-full flex-col">
        <div className="flex p-10 justify-center items-center">
          <div className="flex items-center gap-4">
            {session?.user ? <SignOutButton /> : <SignInButton />}
          </div>
        </div>

        <div className="flex-col text-lg p-5 gap-3">
          {menuItems.map((item) => (
            <div className="flex-col items-center pb-5" key={item.key}>
              <div className="flex items-center justify-center pb-2" key={item.key}>
                <Link className={item.className} key={item.key} href={item.src} onClick={() => setIsDrawerActive(false)}>
                  {item.label}
                </Link>
              </div>
              <Separator />
            </div>
          ))}
        </div>

      </div>
    </>
  );

  return (
    <div className="">
      <Drawer
        open={isDrawerActive}
        setOpen={setIsDrawerActive}
      >
        <div className="w-screen pt-5 h-full bg-white dark:bg-zinc-900 dark:shadow-zinc-950">
          {drawerContent}
        </div>
      </Drawer>
    </div>
  )
}