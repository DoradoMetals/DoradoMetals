import { CheckCircleIcon, CrownIcon, Icon, ShieldIcon, UserCheckIcon, UserIcon } from '@phosphor-icons/react'
import * as z from 'zod'

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
    colorClass: 'text-yellow-500',
  },
]


