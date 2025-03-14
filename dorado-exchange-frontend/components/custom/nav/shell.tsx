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
import { Menu, ShoppingCart, User, X } from "lucide-react";
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

      <div className="flex items-center justify-between w-full p-3 sm:px-20 bg-background">
        <div className="flex items-center gap-3">
          <Link className="px-0" href={"/"}>
            <Logo />
          </Link>
          <div className="flex items-end">
            <Link href={"/"}>
              <span className="text-lg">
                Dorado Metals Exchange
              </span>
            </Link>
          
            <div className="hidden lg:flex gap-3 text-sm items-center text-xl font-light tracking-wide pl-10 gap-7">
              {menuItems.map((item) => (
                <Link className={item.className} key={item.key} href={item.src}>
                  <p>{item.label}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Menu */}
        <div className="hidden lg:block flex items-center gap-6 items-end">
          <div className="flex items-center gap-3">
            <Button className="px-0 hover:bg-background" variant="ghost">
              <User className="w-5 h-5" />
            </Button>
            <Button className="px-0 hover:bg-background" variant="ghost">
              <ShoppingCart className="w-5 h-5" />
            </Button>
            <ThemeSwitcher />
            <div>{session?.user ? <SignOutButton /> : <SignInButton />}</div>
          </div>
        </div>

        {/* Mobile Sidebar */}
        <div className="lg:hidden ml-auto mx-0 px-0 flex items-center gap-3">
          <Button className="px-0 hover:bg-background" variant="ghost">
            <User className="w-5 h-5" />
          </Button>
          <Button className="px-0 hover:bg-background" variant="ghost">
            <ShoppingCart className="w-5 h-5" />
          </Button>
          <Button className="px-0 hover:bg-background" variant="ghost" onClick={() => setIsDrawerActive(true)}>
            {!isDrawerActive ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </Button>
          <Sidebar isDrawerActive={isDrawerActive} setIsDrawerActive={setIsDrawerActive} />
        </div>
      </div>
    </>
  );
}

