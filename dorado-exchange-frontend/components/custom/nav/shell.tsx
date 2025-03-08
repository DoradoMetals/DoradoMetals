"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "../../icons/logo";
import Sidebar from "./sidebar";
import { authClient } from "@/lib/authClient";
import SignOutButton from "../auth/signOutButton";
import SignInButton from "../auth/signInButton";

import { User } from "@/types";

export default function Shell() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function fetchUser() {
      const { data } = await authClient.getSession();
      setUser(data?.user || null);
    }
    fetchUser();
  }, []);

  const menuItems = [
    {
      key: 1,
      label: "Buy",
      src: "/buy",
      className: pathname === "/buy" ? "text-primary" : "text-muted",
    },
    {
      key: 2,
      label: "Sell",
      src: "/sell",
      className: pathname === "/sell" ? "text-primary" : "text-muted",
    },
  ];

  return (
    <>
      {/* Mobile Navbar */}
      <div className="visible sm:hidden">
        <div className="flex items-center bg-white dark:bg-black p-6">
          <div className="flex items-center flex-shrink-0 mr-6 gap-3">
            <Link href={"/"}>
              <Logo />
            </Link>
            <Link href={"/"}>
              <span className="font-semibold text-lg tracking-tight">
                Dorado Metals Exchange
              </span>
            </Link>
          </div>
          <div className="ml-auto">
            <Sidebar />
          </div>
        </div>
      </div>

      {/* Desktop Navbar */}
      <div className="hidden sm:block">
        <div className="flex items-center bg-white dark:bg-black p-6">
          <div className="flex items-center flex-shrink-0 mr-6 gap-3">
            <Link href={"/"}>
              <Logo />
            </Link>
            <Link href={"/"}>
              <span className="font-semibold text-lg tracking-tight">
                Dorado Metals Exchange
              </span>
            </Link>
          </div>
          <div className="w-full block w-auto">
            <div className="text-sm flex gap-3 items-center">
              {menuItems.map((item) => (
                <Link className={item.className} key={item.key} href={item.src}>
                  <p>{item.label}</p>
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <SignOutButton/>
            ) : (
              <>
                <SignInButton />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
