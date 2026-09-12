import { z } from 'zod/v4'
import { Factor, OtpChannel } from '../auth/enums.js'
import { AuthOtpThrottle } from '../auth/otp_throttles.js'
import { AuthPendingChange } from '../auth/pending_changes.js'
import { AuthPendingSignup } from '../auth/pending_signups.js'
import { Session } from '../auth/sessions.js'
import { User } from '../auth/users.js'

export const OtpPurpose = z.enum(['sign_in', 'sign_up', 'step_up', 'change_email', 'change_phone'])
export type OtpPurpose = z.infer<typeof OtpPurpose>

export const VerificationStatus = z.enum(['sent', 'invalid', 'verified', 'locked'])
export type VerificationStatus = z.infer<typeof VerificationStatus>

export const SendCodeBody = z
  .object({
    channel: OtpChannel,
    phone_number: User.shape.phone_number.unwrap().optional(),
    email: User.shape.email.optional(),
    captcha_token: z.string().optional(),
  })
  .strict()
export type SendCodeBody = z.infer<typeof SendCodeBody>

export const VerifyCodeBody = z
  .object({
    channel: OtpChannel,
    phone_number: User.shape.phone_number.unwrap().optional(),
    email: User.shape.email.optional(),
    code: z.string(),
  })
  .strict()
export type VerifyCodeBody = z.infer<typeof VerifyCodeBody>

export const SignUpBody = z
  .object({
    name: AuthPendingSignup.shape.name,
    email: AuthPendingSignup.shape.email,
    phone_number: AuthPendingSignup.shape.phone_number.unwrap().optional(),
    accepted_terms: z.literal(true),
    captcha_token: z.string(),
  })
  .strict()
export type SignUpBody = z.infer<typeof SignUpBody>

export const ChangeEmailBody = z.object({ email: User.shape.email }).strict()
export type ChangeEmailBody = z.infer<typeof ChangeEmailBody>

export const ChangePhoneBody = z.object({ phone_number: User.shape.phone_number.unwrap() }).strict()
export type ChangePhoneBody = z.infer<typeof ChangePhoneBody>

export const ConfirmChangeBody = z.object({ code: z.string() }).strict()
export type ConfirmChangeBody = z.infer<typeof ConfirmChangeBody>

export const VerificationView = z.object({
  purpose: OtpPurpose,
  channel: OtpChannel,
  destination: z.string(),
  code_length: z.number().int(),
  expires_at: AuthPendingChange.shape.expires_at,
  resend_at: AuthOtpThrottle.shape.last_sent_at.unwrap(),
  attempts_remaining: AuthOtpThrottle.shape.attempts,
  locked_until: AuthOtpThrottle.shape.locked_until,
  status: VerificationStatus,
})
export type VerificationView = z.infer<typeof VerificationView>

export const ChangeConfirmedView = z.object({
  factor: Factor,
  next_value: AuthPendingChange.shape.next_value,
  previous_notified: z.boolean(),
})
export type ChangeConfirmedView = z.infer<typeof ChangeConfirmedView>

export const SessionView = z.object({
  user_id: User.shape.id,
  email: User.shape.email,
  phone_number: User.shape.phone_number,
  phone_number_verified: User.shape.phone_number_verified,
  authenticated_at: Session.shape.createdAt,
  fresh: z.boolean(),
  factor_changed: Session.shape.factor_changed,
})
export type SessionView = z.infer<typeof SessionView>
