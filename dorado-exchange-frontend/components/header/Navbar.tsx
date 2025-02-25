import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarMenuToggle,
  NavbarBrand,
  NavbarItem,
} from "@heroui/navbar";
import { Avatar } from "@heroui/avatar";

import { link as linkStyles } from "@heroui/theme";
import NextLink from "next/link";
import clsx from "clsx";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/header/ThemeSwitch";
import { Logo } from "@/components/icons";

export const Navbar = () => {
  return (
    <>
    <HeroUINavbar maxWidth="full" position="sticky" className="m-0 bg-content1 transition-colors duration-300">
      <NavbarContent className="flex items-center w-full px-4 lg:px-8">

        {/* Left Section: Brand + Links */}
        <div className="flex items-center gap-6">
          {/* Brand Logo */}
          <NavbarBrand className="flex items-center gap-2">
            <NextLink href="/" className="flex items-center gap-2">
              <Logo />
              <h2 className="font-bold text-lg md:text-xl tracking-wide">Dorado Metals Exchange</h2>
            </NextLink>
          </NavbarBrand>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex gap-3">
            {siteConfig.navItems.map((item) => (
              <NavbarItem key={item.href}>
                <NextLink
                  className={clsx(
                    linkStyles({ color: "foreground" }),
                    "text-lg font-medium hover:text-yellow-500 transition-colors duration-200"
                  )}
                  href={item.href}
                >
                  {item.label}
                </NextLink>
              </NavbarItem>
            ))}
          </div>
        </div>

        {/* Right Section: Theme Switch, Avatar, Mobile Menu Toggle */}
        <div className="flex items-center gap-4 ml-auto">
          <ThemeSwitch />
          <Avatar className="hidden lg:flex w-10 h-10 border border-yellow-500 shadow-md" />
          <NavbarMenuToggle className="lg:hidden" />
        </div>
      </NavbarContent>
    </HeroUINavbar>
    </>
  );
};
