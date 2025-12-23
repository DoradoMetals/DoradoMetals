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
import * as z from 'zod'
import { UAParser } from 'ua-parser-js'

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

export type UserRoleOption = {
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
    colorClass: 'text-blue-500',
  },
  {
    label: 'Verified User',
    value: 'verified_user',
    icon: UserCheckIcon,
    colorClass: 'text-green-500',
  },
  {
    label: 'User',
    value: 'user',
    icon: UserIcon,
    colorClass: 'text-orange-500',
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
