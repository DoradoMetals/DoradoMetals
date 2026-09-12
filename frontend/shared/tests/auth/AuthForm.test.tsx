import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ChangeConfirmedView, VerificationView } from '@dorado/contracts'

import { AuthForm } from '@/shared/ui/auth/AuthForm'

const NOW = Date.now()

const view = (over: Partial<VerificationView> = {}): VerificationView => ({
  purpose: 'sign_in',
  channel: 'sms',
  destination: '(•••) •••-0134',
  code_length: 6,
  expires_at: new Date(NOW + 600_000).toISOString(),
  resend_at: new Date(NOW + 24_000).toISOString(),
  attempts_remaining: 4,
  locked_until: null,
  status: 'sent',
  ...over,
})

const noop = () => {}

describe('sign in', () => {
  test('is phone first, and offers email as the equal fallback', () => {
    render(
      <AuthForm state="sign-in" value="" onValueChange={noop} onSubmit={noop} onGoogle={noop} />
    )
    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(
      screen.getByText("Enter your phone number and we'll send you a sign-in code.")
    ).toBeTruthy()
    expect(screen.getByLabelText('Phone')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByText('or continue with')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Google' })).toBeTruthy()
    expect(screen.getByText('Prefer email?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Send the code there' }).getAttribute('href')).toBe(
      '/auth/sign-in/email'
    )
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
      '/auth/sign-up'
    )
  })

  test('carries no Apple or Facebook button - the marks do not exist yet', () => {
    render(
      <AuthForm state="sign-in" value="" onValueChange={noop} onSubmit={noop} onGoogle={noop} />
    )
    expect(screen.queryByRole('button', { name: 'Apple' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Facebook' })).toBeNull()
  })
})

describe('sign in by email', () => {
  test('is the same screen keyed to email, offering the text back', () => {
    render(
      <AuthForm
        state="sign-in-email"
        value=""
        onValueChange={noop}
        onSubmit={noop}
        onGoogle={noop}
      />
    )
    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(screen.getByText("Enter your email and we'll send you a sign-in code.")).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByText('Prefer a text?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Send the code there' }).getAttribute('href')).toBe(
      '/auth/sign-in'
    )
  })
})

describe('sign up', () => {
  const signUp = (acceptedTerms = false) =>
    render(
      <AuthForm
        state="sign-up"
        name=""
        email=""
        phone=""
        acceptedTerms={acceptedTerms}
        onNameChange={noop}
        onEmailChange={noop}
        onPhoneChange={noop}
        onTermsChange={noop}
        onSubmit={noop}
        onGoogle={noop}
      />
    )

  test('asks for a name, an email and a phone, and says no password is needed', () => {
    signUp()
    expect(screen.getByText('Create your account')).toBeTruthy()
    expect(
      screen.getByText("We'll send a code to confirm it's you. No password needed.")
    ).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Phone')).toBeTruthy()
    expect(screen.getByText('or sign up with')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/auth/sign-in')
  })

  test('will not submit until the terms are accepted', () => {
    signUp(false)
    expect(screen.getByRole('button', { name: 'Create account' }).hasAttribute('disabled')).toBe(
      true
    )
  })

  test('submits once they are', () => {
    signUp(true)
    expect(screen.getByRole('button', { name: 'Create account' }).hasAttribute('disabled')).toBe(
      false
    )
  })
})

describe('the code screen', () => {
  const code = (
    over: Partial<VerificationView> = {},
    state: 'otp' | 'otp-error' | 'otp-success' | 'verify-its-you' = 'otp'
  ) =>
    render(
      <AuthForm
        state={state}
        view={view(over)}
        code=""
        onCodeChange={noop}
        onSubmit={noop}
        onResend={noop}
      />
    )

  test('names the masked destination and the code length from the view', () => {
    code({ code_length: 6 })
    expect(screen.getByText('Enter your code')).toBeTruthy()
    expect(screen.getByText(/We sent a 6-digit code to/)).toBeTruthy()
    expect(screen.getByText('(•••) •••-0134')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy()
  })

  test('offers the way back that fits the channel', () => {
    code({ channel: 'sms' })
    expect(screen.getByText('Wrong number?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Change it' }).getAttribute('href')).toBe(
      '/auth/sign-in'
    )
  })

  test('an email code offers the email screen back', () => {
    code({ channel: 'email', destination: 'j•••@doradometals.com' })
    expect(screen.getByText('Wrong email?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Change it' }).getAttribute('href')).toBe(
      '/auth/sign-in/email'
    )
  })

  test('a change offers cancel, not a new destination', () => {
    code({ purpose: 'change_email', channel: 'sms' })
    expect(screen.getByText('Changed your mind?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/account')
  })
})

describe("verify it's you", () => {
  test('is the same screen with the step-up words and a support escape', () => {
    render(
      <AuthForm
        state="verify-its-you"
        view={view({ purpose: 'step_up', channel: 'email', destination: 'j•••@doradometals.com' })}
        code=""
        onCodeChange={noop}
        onSubmit={noop}
        onResend={noop}
      />
    )
    expect(screen.getByText("Verify it's you")).toBeTruthy()
    expect(screen.getByText(/We sent a code to/)).toBeTruthy()
    expect(screen.getByText('j•••@doradometals.com')).toBeTruthy()
    expect(screen.getByText('Lost access?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contact support' }).getAttribute('href')).toBe(
      'mailto:support@doradometals.com'
    )
  })
})

describe('a wrong code', () => {
  test('counts the attempts the API left, and never one it worked out itself', () => {
    render(
      <AuthForm
        state="otp-error"
        view={view({ status: 'invalid', attempts_remaining: 4 })}
        code="123456"
        onCodeChange={noop}
        onSubmit={noop}
        onResend={noop}
      />
    )
    expect(screen.getByText("That code isn't right")).toBeTruthy()
    expect(
      screen.getByText('Check the digits and try again. You have 4 attempts left.')
    ).toBeTruthy()
  })

  test('inflects the last one', () => {
    render(
      <AuthForm
        state="otp-error"
        view={view({ status: 'invalid', attempts_remaining: 1 })}
        code="123456"
        onCodeChange={noop}
        onSubmit={noop}
        onResend={noop}
      />
    )
    expect(
      screen.getByText('Check the digits and try again. You have 1 attempt left.')
    ).toBeTruthy()
  })

  test('a change confirm has no attempts to report, so the API’s words stand', () => {
    render(
      <AuthForm
        state="otp-error"
        view={view({ purpose: 'change_email' })}
        code="123456"
        onCodeChange={noop}
        onSubmit={noop}
        onResend={noop}
        message="that code is not right"
      />
    )
    expect(screen.getByText('that code is not right')).toBeTruthy()
  })
})

describe('a verified code', () => {
  test('says so, and says what happens next', () => {
    render(
      <AuthForm
        state="otp-success"
        view={view({ status: 'verified' })}
        code="123456"
        onCodeChange={noop}
        onSubmit={noop}
        onResend={noop}
      />
    )
    expect(screen.getByText('Code verified')).toBeTruthy()
    expect(screen.getByText('Taking you through now.')).toBeTruthy()
  })
})

describe('locked', () => {
  test('reads the cooldown off locked_until, not off a constant in the browser', () => {
    render(
      <AuthForm
        state="locked"
        view={view({ status: 'locked', locked_until: new Date(NOW + 900_000).toISOString() })}
      />
    )
    expect(screen.getByText('Too many attempts')).toBeTruthy()
    expect(screen.getByText("For your security we've paused sign-in on this account.")).toBeTruthy()
    expect(screen.getByText('Try again in 15 minutes')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contact support' }).getAttribute('href')).toBe(
      'mailto:support@doradometals.com'
    )
  })

  test('says nothing it cannot know when there is no cooldown to read', () => {
    render(<AuthForm state="locked" view={null} />)
    expect(screen.getByText('Try again later')).toBeTruthy()
  })
})

describe('confirmed', () => {
  const confirmed = (over: Partial<ChangeConfirmedView> = {}): ChangeConfirmedView => ({
    factor: 'email',
    next_value: 'new@example.com',
    previous_notified: true,
    ...over,
  })

  test('states the new value - the one unmasked value in the surface - and that the old was told', () => {
    render(<AuthForm state="confirmed" view={confirmed()} onDone={noop} />)
    expect(screen.getByText('Email changed')).toBeTruthy()
    expect(
      screen.getByText(
        "You'll sign in with new@example.com from now on. We've let your old address know."
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })

  test('does not claim the old value was told when the API says it was not', () => {
    render(
      <AuthForm state="confirmed" view={confirmed({ previous_notified: false })} onDone={noop} />
    )
    expect(screen.getByText("You'll sign in with new@example.com from now on.")).toBeTruthy()
  })

  test('a phone change says phone', () => {
    render(
      <AuthForm
        state="confirmed"
        view={confirmed({ factor: 'phone', next_value: '+14695550177' })}
        onDone={noop}
      />
    )
    expect(screen.getByText('Phone changed')).toBeTruthy()
    expect(screen.getByText(/We've let your old number know\./)).toBeTruthy()
  })
})

describe('the two change screens', () => {
  test('change email asks only for the new address, and never states the old one', () => {
    render(<AuthForm state="change-email" value="" onValueChange={noop} onSubmit={noop} />)
    expect(screen.getByText('Change your email')).toBeTruthy()
    expect(
      screen.getByText("We'll send a code to the new address before it takes effect.")
    ).toBeTruthy()
    expect(screen.getByLabelText('New email')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy()
    expect(screen.getByText('Changed your mind?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/account')
  })

  test('change phone is the same screen for the other factor', () => {
    render(<AuthForm state="change-phone" value="" onValueChange={noop} onSubmit={noop} />)
    expect(screen.getByText('Change your phone')).toBeTruthy()
    expect(
      screen.getByText("We'll text a code to the new number before it takes effect.")
    ).toBeTruthy()
    expect(screen.getByLabelText('New phone')).toBeTruthy()
  })

  test('neither offers a social button - a change is not a sign-in', () => {
    render(<AuthForm state="change-email" value="" onValueChange={noop} onSubmit={noop} />)
    expect(screen.queryByRole('button', { name: 'Google' })).toBeNull()
  })
})

describe('session expired', () => {
  test('explains the inactivity and offers the way back', () => {
    const onSignIn = vi.fn()
    render(<AuthForm state="session-expired" onSignIn={onSignIn} />)
    expect(screen.getByText("You've been signed out")).toBeTruthy()
    expect(
      screen.getByText('We sign you out after a while of no activity, to keep your account safe.')
    ).toBeTruthy()
    screen.getByRole('button', { name: 'Sign in again' }).click()
    expect(onSignIn).toHaveBeenCalled()
  })
})
