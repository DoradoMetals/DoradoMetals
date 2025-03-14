"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../../icons/logo";
import Sidebar from "./sidebar";
import { authClient } from "@/lib/authClient";
import SignOutButton from "../auth/signOutButton";
import SignInButton from "../auth/signInButton";
import { ThemeSwitcher } from "../theme/theme-switcher";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Shell() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const [isDrawerActive, setIsDrawerActive] = useState(false);

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
    {
      key: 3,
      label: "Account",
      src: "/account",
      className: pathname === "/account" ? "text-primary" : "text-muted",
    }
  ];

  return (
    <>
      {/* Mobile Navbar */}

      <div className="flex items-center justify-between bg-background w-full p-6">
        <div className="flex items-center gap-3">
          <Link href={"/"}>
            <Logo />
          </Link>
          <Link href={"/"}>
            <span className="font-semibold text-lg tracking-tight">
              Dorado Metals Exchange
            </span>
          </Link>
        </div>

        {/* Mobile Sidebar */}
        <div className="sm:hidden ml-auto mx-0 px-0">
          <Button variant="ghost" onClick={() => setIsDrawerActive(true)}>
            {!isDrawerActive ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </Button>
          <Sidebar isDrawerActive={isDrawerActive} setIsDrawerActive={setIsDrawerActive} />
        </div>

        {/* Desktop Menu */}
        <div className="hidden sm:flex items-center gap-6">
          <div className="flex gap-3 text-sm">
            {menuItems.map((item) => (
              <Link className={item.className} key={item.key} href={item.src}>
                <p>{item.label}</p>
              </Link>
            ))}
          </div>
          <ThemeSwitcher />
          <div>{session?.user ? <SignOutButton /> : <SignInButton />}</div>
        </div>
      </div>
    </>
  );
}

