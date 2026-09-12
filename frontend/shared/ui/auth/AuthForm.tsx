'use client'

import NextLink from 'next/link'
import type { ChangeConfirmedView, VerificationView } from '@dorado/contracts'
import { Alert, Button, Checkbox, Divider, Input, Link, OTPInput } from '@dorado/components'
import { GoogleLogo, Phone } from '@dorado/icons'

import { minutesUntil, secondsUntil } from '@/shared/utils/authForm'

const SUPPORT_HREF = 'mailto:support@doradometals.com'
const TITLE_ID = 'auth-form-title'

type Shared = {
  pending?: boolean
  message?: string | null
  onGoogle?: () => void
  googlePending?: boolean
  captcha?: React.ReactNode
}

type IdentityState = 'sign-in' | 'sign-in-email' | 'change-email' | 'change-phone'
type CodeState = 'otp' | 'otp-error' | 'otp-success' | 'verify-its-you'

export type AuthFormProps =
  | (Shared & {
      state: IdentityState
      value: string
      onValueChange: (value: string) => void
      onSubmit: () => void
    })
  | (Shared & {
      state: 'sign-up'
      name: string
      email: string
      phone: string
      acceptedTerms: boolean
      onNameChange: (value: string) => void
      onEmailChange: (value: string) => void
      onPhoneChange: (value: string) => void
      onTermsChange: (value: boolean) => void
      onSubmit: () => void
    })
  | (Shared & {
      state: CodeState
      view: VerificationView
      code: string
      onCodeChange: (code: string) => void
      onSubmit: () => void
      onResend: () => void
    })
  | (Shared & { state: 'locked'; view?: VerificationView | null })
  | (Shared & { state: 'confirmed'; view: ChangeConfirmedView; onDone: () => void })
  | (Shared & { state: 'session-expired'; onSignIn: () => void })

const IDENTITY = {
  'sign-in': {
    heading: 'Welcome back',
    subhead: "Enter your phone number and we'll send you a sign-in code.",
    label: 'Phone',
    placeholder: '(214) 555-0134',
    submit: 'Continue',
  },
  'sign-in-email': {
    heading: 'Welcome back',
    subhead: "Enter your email and we'll send you a sign-in code.",
    label: 'Email',
    placeholder: 'you@example.com',
    submit: 'Continue',
  },
  'change-email': {
    heading: 'Change your email',
    subhead: "We'll send a code to the new address before it takes effect.",
    label: 'New email',
    placeholder: 'new@example.com',
    submit: 'Send code',
  },
  'change-phone': {
    heading: 'Change your phone',
    subhead: "We'll text a code to the new number before it takes effect.",
    label: 'New phone',
    placeholder: '(469) 555-0177',
    submit: 'Send code',
  },
} as const

const isPhoneField = (state: IdentityState): boolean =>
  state === 'sign-in' || state === 'change-phone'

// The one place a countable noun is inflected. Everything else is a fixed
// string from the design.
const attemptsBody = (remaining: number): string =>
  `Check the digits and try again. You have ${remaining} ${
    remaining === 1 ? 'attempt' : 'attempts'
  } left.`

const lockedTitle = (view: VerificationView | null | undefined): string => {
  const minutes = view ? minutesUntil(view.locked_until) : 0
  if (minutes <= 0) return 'Try again later'
  return `Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

const confirmedHeading = (view: ChangeConfirmedView): string =>
  view.factor === 'email' ? 'Email changed' : 'Phone changed'

const confirmedSubhead = (view: ChangeConfirmedView): string => {
  const told = view.factor === 'email' ? 'old address' : 'old number'
  const notice = view.previous_notified ? ` We've let your ${told} know.` : ''
  return `You'll sign in with ${view.next_value} from now on.${notice}`
}

// Where the code screen's one link goes is the PURPOSE, which is the API's.
const codeFooter = (view: VerificationView): { prose: string; label: string; href: string } => {
  if (view.purpose === 'step_up') {
    return { prose: 'Lost access?', label: 'Contact support', href: SUPPORT_HREF }
  }
  if (view.purpose === 'change_email' || view.purpose === 'change_phone') {
    return { prose: 'Changed your mind?', label: 'Cancel', href: '/account' }
  }
  return view.channel === 'sms'
    ? { prose: 'Wrong number?', label: 'Change it', href: '/auth/sign-in' }
    : { prose: 'Wrong email?', label: 'Change it', href: '/auth/sign-in/email' }
}

function Head({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col justify-center gap-1 text-center">
      <h4 id={TITLE_ID}>{title}</h4>
      <p className="micro">{children}</p>
    </div>
  )
}

function FooterRow({ prose, label, href }: { prose: string; label: string; href: string }) {
  return (
    <div className="flex w-full items-center justify-center gap-1">
      <p className="micro">{prose}</p>
      {href.startsWith('mailto:') ? (
        <Link href={href}>{label}</Link>
      ) : (
        <Link asChild>
          <NextLink href={href}>{label}</NextLink>
        </Link>
      )}
    </div>
  )
}

function Alternatives({
  label,
  onGoogle,
  googlePending,
}: {
  label: string
  onGoogle?: () => void
  googlePending?: boolean
}) {
  if (!onGoogle) return null
  return (
    <div className="flex w-full flex-col gap-lg">
      <Divider label={label} />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={onGoogle}
        disabled={googlePending}
      >
        <GoogleLogo />
        Google
      </Button>
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full flex-col gap-lg overflow-hidden">{children}</div>
}

export function AuthForm(props: AuthFormProps) {
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if ('onSubmit' in props) props.onSubmit()
  }

  if (props.state === 'session-expired') {
    return (
      <Panel>
        <Head title="You've been signed out">
          We sign you out after a while of no activity, to keep your account safe.
        </Head>
        <Button className="w-full" onClick={props.onSignIn}>
          Sign in again
        </Button>
      </Panel>
    )
  }

  if (props.state === 'confirmed') {
    return (
      <Panel>
        <Head title={confirmedHeading(props.view)}>{confirmedSubhead(props.view)}</Head>
        <Button className="w-full" onClick={props.onDone}>
          Done
        </Button>
      </Panel>
    )
  }

  if (props.state === 'locked') {
    return (
      <Panel>
        <Head title="Too many attempts">
          For your security we&apos;ve paused sign-in on this account.
        </Head>
        <Button variant="secondary" className="w-full" asChild>
          <a href={SUPPORT_HREF}>Contact support</a>
        </Button>
        <Alert intent="danger" title={lockedTitle(props.view)}>
          If this wasn&apos;t you, someone may have your number. Contact us and we&apos;ll secure
          the account.
        </Alert>
      </Panel>
    )
  }

  if (
    props.state === 'otp' ||
    props.state === 'otp-error' ||
    props.state === 'otp-success' ||
    props.state === 'verify-its-you'
  ) {
    const { state, view, code, onCodeChange, onResend, pending, message } = props
    const footer = codeFooter(view)
    // Which words the code screen wears is the PURPOSE, not the state name: a
    // wrong code during a step-up is still "Verify it's you".
    const stepUp = view.purpose === 'step_up'
    return (
      <form
        className="flex w-full flex-col gap-lg overflow-hidden"
        onSubmit={submit}
        aria-labelledby={TITLE_ID}
      >
        <Head title={stepUp ? "Verify it's you" : 'Enter your code'}>
          {stepUp ? 'We sent a code to ' : `We sent a ${view.code_length}-digit code to `}
          <strong>{view.destination}</strong>.
        </Head>
        <div className="flex w-full flex-col gap-lg">
          <OTPInput
            length={view.code_length}
            value={code}
            onValueChange={onCodeChange}
            invalid={state === 'otp-error'}
            disabled={pending}
            resendIn={secondsUntil(view.resend_at)}
            onResend={onResend}
          />
          {/* NO CAPTCHA SLOT HERE. The widget renders where a verification is
              STARTED - sign-in, sign-up and the two factor changes. A resend
              from this screen is a send inside the pending window, which
              `send_code` accepts without a token. */}
          <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
            Verify
          </Button>
        </div>
        <FooterRow prose={footer.prose} label={footer.label} href={footer.href} />
        {state === 'otp-error' && (
          <Alert intent="danger" title="That code isn't right">
            {message ?? attemptsBody(view.attempts_remaining)}
          </Alert>
        )}
        {state === 'otp-success' && (
          <Alert intent="success" title="Code verified">
            Taking you through now.
          </Alert>
        )}
      </form>
    )
  }

  if (props.state === 'sign-up') {
    const {
      name,
      email,
      phone,
      acceptedTerms,
      onNameChange,
      onEmailChange,
      onPhoneChange,
      onTermsChange,
      pending,
      message,
      onGoogle,
      googlePending,
    } = props
    return (
      <form
        className="flex w-full flex-col gap-lg overflow-hidden"
        onSubmit={submit}
        aria-labelledby={TITLE_ID}
      >
        <Head title="Create your account">
          We&apos;ll send a code to confirm it&apos;s you. No password needed.
        </Head>
        <div className="flex w-full flex-col gap-lg">
          <Input
            label="Name"
            placeholder="Jacob Johnson"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoComplete="name"
            autoFocus
          />
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            type="email"
            autoComplete="email"
          />
          <Input
            label="Phone"
            placeholder="(214) 555-0134"
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            leading={<Phone aria-hidden />}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            invalid={Boolean(message)}
            message={message ?? undefined}
          />
          <div className="flex w-full items-center gap-xs">
            <Checkbox
              id="accepted-terms"
              checked={acceptedTerms}
              onCheckedChange={(next) => onTermsChange(next === true)}
            />
            <label htmlFor="accepted-terms" className="micro">
              I agree to the <NextLink href="/terms-and-conditions">Terms and Conditions</NextLink>{' '}
              and <NextLink href="/privacy-policy">Privacy Policy</NextLink>
            </label>
          </div>
          {props.captcha}
          <Button
            type="submit"
            className="w-full"
            disabled={pending || !acceptedTerms}
            aria-busy={pending}
          >
            Create account
          </Button>
        </div>
        <Alternatives label="or sign up with" onGoogle={onGoogle} googlePending={googlePending} />
        <FooterRow prose="Already have an account?" label="Sign in" href="/auth/sign-in" />
      </form>
    )
  }

  if (props.state !== 'sign-in' && props.state !== 'sign-in-email') {
    if (props.state !== 'change-email' && props.state !== 'change-phone') return null
  }

  const { state, value, onValueChange, pending, message, onGoogle, googlePending } = props
  const copy = IDENTITY[state]
  const phoneField = isPhoneField(state)
  return (
    <form
      className="flex w-full flex-col gap-lg overflow-hidden"
      onSubmit={submit}
      aria-labelledby={TITLE_ID}
    >
      <Head title={copy.heading}>{copy.subhead}</Head>
      <div className="flex w-full flex-col gap-lg">
        <Input
          label={copy.label}
          placeholder={copy.placeholder}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          leading={phoneField ? <Phone aria-hidden /> : undefined}
          type={phoneField ? 'tel' : 'email'}
          inputMode={phoneField ? 'numeric' : 'email'}
          autoComplete={phoneField ? 'tel' : 'email'}
          autoFocus
          invalid={Boolean(message)}
          message={message ?? undefined}
        />
        {props.captcha}
        <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
          {copy.submit}
        </Button>
      </div>
      {(state === 'sign-in' || state === 'sign-in-email') && (
        <>
          <Alternatives
            label="or continue with"
            onGoogle={onGoogle}
            googlePending={googlePending}
          />
          <FooterRow prose="New here?" label="Create an account" href="/auth/sign-up" />
          <FooterRow
            prose={state === 'sign-in' ? 'Prefer email?' : 'Prefer a text?'}
            label="Send the code there"
            href={state === 'sign-in' ? '/auth/sign-in/email' : '/auth/sign-in'}
          />
        </>
      )}
      {(state === 'change-email' || state === 'change-phone') && (
        <FooterRow prose="Changed your mind?" label="Cancel" href="/account" />
      )}
    </form>
  )
}
