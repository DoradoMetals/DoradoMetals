import * as React from "react";
import clsx from "clsx";
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

export const Logo: React.FC<{ size?: number; height?: number }> = ({ size = 36, height, ...props }) => (
  <svg
    className="text-yellow-500"
    fill="none"
    height={size || height}
    viewBox="0 0 32 32"
    width={size || height}
    {...props}
  >
    <path
      clipRule="evenodd"
      d="M17.6482 10.1305L15.8785 7.02583L7.02979 22.5499H10.5278L17.6482 10.1305ZM19.8798 14.0457L18.11 17.1983L19.394 19.4511H16.8453L15.1056 22.5499H24.7272L19.8798 14.0457Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

export const MoonFilledIcon = (props: React.ComponentProps<"svg">) => (
  <MoonIcon className="w-6 h-6 text-yellow-500" {...props} />
);

export const SunFilledIcon = (props: React.ComponentProps<"svg">) => (
  <SunIcon className="w-6 h-6 text-yellow-500" {...props} />
);

export const HeartFilledIcon = (props: React.ComponentProps<"svg">) => (
  <HeartIcon className="w-6 h-6 text-red-500" {...props} />
);

export const SearchIcon = (props: React.ComponentProps<"svg">) => (
  <MagnifyingGlassIcon className="w-6 h-6 text-gray-500" {...props} />
);

export const UserIcon = (props: React.ComponentProps<"svg">) => (
  <UserCircleIcon className="w-6 h-6 text-yellow-500" {...props} />
);

export const CartIcon = (props: React.ComponentProps<"svg">) => (
  <ShoppingCartIcon className="w-6 h-6 text-yellow-500" {...props} />
);

export const Phone = (props: React.ComponentProps<"svg">) => (
  <PhoneIcon className="w-6 h-6 text-yellow-500" {...props} />
);

export const Envelope = (props: React.ComponentProps<"svg">) => (
  <EnvelopeIcon className="w-6 h-6 text-yellow-500" {...props} />
);

export const SpotTickerArrowUp = (props: React.ComponentProps<"svg">) => (
  <ChevronUpIcon className="w-6 h-6 text-green-500" {...props} />
);

export const SpotTickerArrowDown = (props: React.ComponentProps<"svg">) => (
  <ChevronDownIcon className="w-6 h-6 text-red-500" {...props} />
);

export const MinusIcon = (props: React.ComponentProps<"svg">) => (
  <HeroMinus className="w-5 h-5 text-gray-700" {...props} />
);

export const PlusIcon = (props: React.ComponentProps<"svg">) => (
  <HeroPlus className="w-5 h-5 text-gray-700" {...props} />
);