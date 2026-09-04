'use client'

import * as React from "react";

export type MenuIconProps = Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
  open: boolean;
  size?: number;
};

const LINE = "origin-center transition-transform duration-200 ease-out motion-reduce:transition-none";

export const MenuIcon = React.forwardRef<SVGSVGElement, MenuIconProps>(
  ({ open, size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <line
        x1="4"
        y1="6"
        x2="20"
        y2="6"
        className={LINE}
        style={{ transform: open ? "translateY(6px) rotate(45deg)" : undefined }}
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        className="origin-center transition-opacity duration-200 ease-out motion-reduce:transition-none"
        style={{ opacity: open ? 0 : 1 }}
      />
      <line
        x1="4"
        y1="18"
        x2="20"
        y2="18"
        className={LINE}
        style={{ transform: open ? "translateY(-6px) rotate(-45deg)" : undefined }}
      />
    </svg>
  )
);
MenuIcon.displayName = "MenuIcon";
