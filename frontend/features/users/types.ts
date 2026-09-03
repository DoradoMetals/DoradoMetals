import type { exchange } from "@dorado/contracts";
import {
  CrownIcon,
  Icon,
  IconProps,
  UserCheckIcon,
  UserIcon,
  DeviceMobileIcon,
  DeviceTabletIcon,
  LaptopIcon,
  DesktopIcon,
} from '@phosphor-icons/react'
import { z } from 'zod/v4'
import { UAParser } from 'ua-parser-js'

// THE ACCOUNT FORM'S SCHEMA, AND BETTER-AUTH'S SESSION USER.
//
// LEFT HERE DELIBERATELY, with the reason stated because it is the one
// frontend schema `audit:frontend-nullability` marks PARSED AT RUNTIME.
//
// It has two jobs and they pull in opposite directions:
//   1. zodResolver in ui/UserForm.tsx - a FORM, where requiring `name` is
//      correct and is the audit's documented false-positive class.
//   2. `user: userSchema` inside adminSalesOrderCheckoutSchema, which IS
//      .parse()d - and there the value is API-sourced, so requiring `name`
//      against a NULLABLE column is the hazard ruling 39 names.
//
// Job 2 is UNREACHABLE TODAY: the only value ever passed is the drawer
// store's `createSalesOrderUser`, and `setCreateSalesOrderUser` has no caller
// anywhere in the tree - the admin create-sales-order drawer cannot be given
// a user. Splitting the two jobs means deciding what that drawer should send,
// which is a design question with an API side to it, so this wave states it
// rather than guessing. See docs/waves/phase3-frontend.md.
//
// The SHAPE is better-auth's session user (camelCase), not our /users wire -
// see AdminUser below for the other thing called a user here.
export const userSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email().min(1, 'Email is required'),
  name: z.string().min(1, 'Name is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  emailVerified: z.boolean().optional(),
  image: z.string().url().nullable().optional(),
  role: z.string().optional(),
  stripeCustomerId: z.string().nullable().optional(),
  dorado_funds: z.number().optional().nullable(),
})

export type User = z.infer<typeof userSchema>

type UserRoleOption = {
  label: string
  value: string
  icon: Icon
  colorClass: string
}

export const userRoleOptions: UserRoleOption[] = [
  {
    label: 'Admin',
    value: 'admin',
    icon: CrownIcon,
    colorClass: 'text-info',
  },
  {
    label: 'Verified User',
    value: 'verified_user',
    icon: UserCheckIcon,
    colorClass: 'text-success',
  },
  {
    label: 'User',
    value: 'user',
    icon: UserIcon,
    colorClass: 'text-warning',
  },
]

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: Date
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: Date
  updatedAt: Date
  impersonatedBy?: string | null
}

export interface ParsedUA {
  osName: string
  osVersion: string | null
  browserName: string
  browserVersion: string | null
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
}

const cache = new Map<string, ParsedUA>()

export function parseUserAgent(uaString: string | null | undefined): ParsedUA {
  if (!uaString) {
    return {
      osName: 'Unknown',
      osVersion: null,
      browserName: 'Unknown',
      browserVersion: null,
      deviceType: 'unknown',
    }
  }

  const cached = cache.get(uaString)
  if (cached) return cached

  const parser = new UAParser(uaString)
  const browser = parser.getBrowser()
  const os = parser.getOS()
  const device = parser.getDevice()

  const result: ParsedUA = {
    osName: os.name ?? 'Unknown',
    osVersion: os.version ?? null,
    browserName: browser.name ?? 'Unknown',
    browserVersion: browser.version ?? null,
    deviceType:
      (device.type as ParsedUA['deviceType']) ??
      (uaString.includes('Mobile') ? 'mobile' : 'desktop'),
  }

  cache.set(uaString, result)
  return result
}

type DeviceIconResult = {
  Icon: React.ComponentType<IconProps>
  label: string
}

export function getDeviceIcon(ua: ParsedUA): DeviceIconResult {
  if (ua.deviceType === 'mobile') {
    return { Icon: DeviceMobileIcon, label: 'Mobile' }
  }

  if (ua.deviceType === 'tablet') {
    return { Icon: DeviceTabletIcon, label: 'Tablet' }
  }

  const os = ua.osName ?? ''

  if (os.includes('Windows')) {
    return { Icon: DesktopIcon, label: 'Desktop' }
  }

  return { Icon: LaptopIcon, label: 'Laptop' }
}

// THE ADMIN USERS WIRE, FROM THE CONTRACTS (phase 3, ruling 39).
//
// GET /users/get_all and /users/get_one serve the contract's `User` - the
// exchange.users row with better-auth's camelCase columns aliased to
// snake_case and the Stripe and ban columns dropped. This interface was that
// same shape written out by hand with everything required and ONE FIELD THE
// WRONG TYPE: `email_verified: string` against a boolean column. Nothing read
// it, which is the only reason it never showed.
//
// *** TWO DIFFERENT THINGS ARE CALLED A USER IN THIS TREE, AND THEY DO NOT
//     MATCH. *** `AdminUser` is OUR wire, snake_case, from the API. `User`
//     above is BETTER-AUTH'S SESSION USER, camelCase (createdAt,
//     emailVerified, stripeCustomerId), which arrives through authClient's own
//     getSession and never through apiRequest. They are not interchangeable
//     and neither is a rename of the other.
export type AdminUser = exchange.users.Read;
