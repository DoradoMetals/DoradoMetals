import * as z from 'zod'

export const signUpSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/\d/, 'Must contain at least one number')
    .regex(/[@$!%*?&]/, 'Must contain at least one special character'),
  name: z.string().min(1, 'Must enter your name'),
  terms: z.boolean().refine((val) => val === true, {
    message: 'Please accept the terms and conditions and the privacy policy',
  }),
})
export type SignUp = z.infer<typeof signUpSchema>

export const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password required'),
  rememberMe: z.boolean().default(true),
})
export type SignIn = z.infer<typeof signInSchema>

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/\d/, 'Must contain at least one number')
      .regex(/[@$!%*?&]/, 'Must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type ResetPassword = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/\d/, 'Must contain at least one number')
      .regex(/[@$!%*?&]/, 'Must contain at least one special character'),
    currentPassword: z.string().nonempty('Please input current password.'),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Passwords cannot be the same.',
    path: ['currentPassword'],
  })
export type ChangePassword = z.infer<typeof changePasswordSchema>
