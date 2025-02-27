import * as React from "react";
import {
  MoonIcon,
  SunIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ShoppingCartIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MinusIcon as HeroMinus,
  PlusIcon as HeroPlus,
} from "@heroicons/react/24/solid";

export const Logo: React.FC<{ size?: number; height?: number }> = ({ size = 45, height, ...props }) => (
  <svg
    className="text-primary"
    fill="primary-color"
    height={size || height}
    viewBox="0 0 32 32"
    width={size || height}
    {...props}
  >
    <g transform="translate(-103.07 -122.77)">
      <path 
        d="m122.96 132.24h0.45713v21.634h-0.45713zm-8.2286 0h0.45714v21.634h-0.45714zm-1.6-9.4648h11.886v3.6056h-11.886zm10.057 3.6056h1.3714v5.4084h-1.3714zm-3.2 0h1.3714v5.4084h-1.3714zm-3.2 0h1.3714v5.4084h-1.3714zm-3.2 0h1.3714v5.4084h-1.3714zm-1.3714 5.8592h2.2857v3.6056h-2.2857zm-2.2857 4.507h4.5714v3.6056h-4.5714zm-2.2857 4.507h6.8572v3.6056h-6.8572zm-2.2857 4.507h9.1429v3.6056h-9.1429zm-2.2857 4.507h11.429v3.6056h-11.429zm20.571-18.028h2.2857v3.6056h-2.2857zm0 4.507h4.5714v3.6056h-4.5714zm0 4.507h6.8571v3.6056h-6.8571zm0 4.507h9.1429v3.6056h-9.1429zm-8.9143-13.521h8.6857v0.9014h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm0 1.8028h8.6857v0.90142h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm0 1.8028h8.6857v0.90142h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm0 1.8028h8.6857v0.90142h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm0 1.8028h8.6857v0.90142h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm0 1.8028h8.6857v0.90141h-8.6857zm8.9143-3.6056h11.429v3.6056h-11.429z" 
        fill="#ffb400"
        stroke-width=".10962" 
      />
    </g>
  </svg>
);

export const MoonFilledIcon = (props: React.ComponentProps<"svg">) => (
  <MoonIcon className="w-6 h-6" {...props} />
);

export const SunFilledIcon = (props: React.ComponentProps<"svg">) => (
  <SunIcon className="w-6 h-6" {...props} />
);

export const HeartFilledIcon = (props: React.ComponentProps<"svg">) => (
  <HeartIcon className="w-6 h-6" {...props} />
);

export const SearchIcon = (props: React.ComponentProps<"svg">) => (
  <MagnifyingGlassIcon className="w-6 h-6" {...props} />
);

export const UserIcon = (props: React.ComponentProps<"svg">) => (
  <UserCircleIcon className="w-6 h-6" {...props} />
);

export const CartIcon = (props: React.ComponentProps<"svg">) => (
  <ShoppingCartIcon className="w-6 h-6" {...props} />
);

export const Phone = (props: React.ComponentProps<"svg">) => (
  <PhoneIcon className="w-6 h-6" {...props} />
);

export const Envelope = (props: React.ComponentProps<"svg">) => (
  <EnvelopeIcon className="w-6 h-6" {...props} />
);

export const SpotTickerArrowUp = (props: React.ComponentProps<"svg">) => (
  <ChevronUpIcon className="w-6 h-6" {...props} />
);

export const SpotTickerArrowDown = (props: React.ComponentProps<"svg">) => (
  <ChevronDownIcon className="w-6 h-6" {...props} />
);

export const MinusIcon = (props: React.ComponentProps<"svg">) => (
  <HeroMinus className="w-5 h-5" {...props} />
);

export const PlusIcon = (props: React.ComponentProps<"svg">) => (
  <HeroPlus className="w-5 h-5" {...props} />
);