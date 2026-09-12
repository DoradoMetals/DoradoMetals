import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import type { ChangeConfirmedView, VerificationView } from '@dorado/contracts'

import {
  VerificationProvider,
  useVerification,
  type Verification,
} from '@/shared/providers/VerificationProvider'

const push = vi.fn()
const replace = vi.fn()
const back = vi.fn()

let searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back }),
  usePathname: () => '/',
  useSearchParams: () => searchParams,
}))

const sendCodeMutateAsync = vi.fn()
const signUpMutateAsync = vi.fn()
const verifyCodeMutateAsync = vi.fn()
const stepUpMutateAsync = vi.fn()
const changeEmailMutateAsync = vi.fn()
const changePhoneMutateAsync = vi.fn()
const confirmChangeMutateAsync = vi.fn()

vi.mock('@dorado/client', () => ({
  useSendCode: () => ({
    mutateAsync: sendCodeMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSignUp: () => ({
    mutateAsync: signUpMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useVerifyCode: () => ({
    mutateAsync: verifyCodeMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useStepUp: () => ({
    mutateAsync: stepUpMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useChangeEmail: () => ({
    mutateAsync: changeEmailMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useChangePhone: () => ({
    mutateAsync: changePhoneMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useConfirmChange: () => ({
    mutateAsync: confirmChangeMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSession: () => ({ data: null, isPending: false }),
}))

vi.mock('@/shared/hooks/useCaptcha', () => ({
  useCaptcha: () => ({ widget: null, token: async () => 'captcha-token', reset: () => {} }),
}))

const adoptSession = vi.fn()
const getSession = vi.fn(async () => ({ data: { user: { id: 'u-1', role: 'user' } } }))

vi.mock('@/shared/hooks/auth/authClient', () => ({
  getSession: (...args: unknown[]) => getSession(...(args as [])),
}))

vi.mock('@/shared/hooks/auth/queries', () => ({
  useGoogleSignIn: () => ({ mutate: vi.fn(), isPending: false }),
  useAdoptSession: () => adoptSession,
  useGetSession: () => ({ user: { id: 'u-1', role: 'user', name: 'Test User' }, isPending: false }),
}))

import SignInPage from '@/app/auth/sign-in/page'
import SignInPhonePage from '@/app/auth/sign-in/phone/page'
import SignUpPage from '@/app/auth/sign-up/page'
import VerifyPage from '@/app/auth/verify/page'
import StepUpPage from '@/app/auth/verify/step-up/page'
import LockedPage from '@/app/auth/locked/page'
import SessionExpiredPage from '@/app/auth/session-expired/page'

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

function Seed({
  verification,
  confirmed,
}: {
  verification?: Verification | null
  confirmed?: ChangeConfirmedView | null
}) {
  const { setVerification, setConfirmed } = useVerification()
  useEffect(() => {
    if (verification !== undefined) setVerification(verification)
    if (confirmed !== undefined) setConfirmed(confirmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderPage(
  ui: React.ReactElement,
  seed: { verification?: Verification | null; confirmed?: ChangeConfirmedView | null } = {}
) {
  const utils = render(
    <VerificationProvider>
      <Seed {...seed} />
    </VerificationProvider>
  )
  utils.rerender(<VerificationProvider>{ui}</VerificationProvider>)
  return utils
}

beforeEach(() => {
  searchParams = new URLSearchParams()
  getSession.mockClear()
  push.mockClear()
  replace.mockClear()
  back.mockClear()
  adoptSession.mockClear()
  sendCodeMutateAsync.mockReset()
  signUpMutateAsync.mockReset()
  verifyCodeMutateAsync.mockReset()
  stepUpMutateAsync.mockReset()
  changeEmailMutateAsync.mockReset()
  changePhoneMutateAsync.mockReset()
  confirmChangeMutateAsync.mockReset()
})

describe('/auth/sign-in', () => {
  test('sends an email code and moves to verify', async () => {
    sendCodeMutateAsync.mockResolvedValueOnce(view({ status: 'sent', channel: 'email' }))
    renderPage(<SignInPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jacob@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(sendCodeMutateAsync).toHaveBeenCalledWith({
        channel: 'email',
        email: 'jacob@example.com',
        captcha_token: 'captcha-token',
      })
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/verify'))
  })

  test('a locked view is sent to /auth/locked instead', async () => {
    sendCodeMutateAsync.mockResolvedValueOnce(view({ status: 'locked', channel: 'email' }))
    renderPage(<SignInPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jacob@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/locked'))
  })

  test('?next= travels in the verification, and a foreign one does not', async () => {
    searchParams = new URLSearchParams('next=/admin/orders/abc-123')
    sendCodeMutateAsync.mockResolvedValue(view({ status: 'sent', channel: 'email' }))
    const seen: { value: Verification | null } = { value: null }
    const latest = () => seen.value
    function Spy() {
      seen.value = useVerification().verification
      return null
    }

    const utils = render(
      <VerificationProvider>
        <SignInPage />
        <Spy />
      </VerificationProvider>
    )
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jacob@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(latest()?.next).toBe('/admin/orders/abc-123'))
    utils.unmount()

    searchParams = new URLSearchParams('next=https://evil.example')
    seen.value = null
    render(
      <VerificationProvider>
        <SignInPage />
        <Spy />
      </VerificationProvider>
    )
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jacob@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(latest()?.view).toBeTruthy())
    expect(latest()?.next).toBe(undefined)
  })
})

describe('/auth/sign-in/phone', () => {
  test('sends an sms code and moves to verify', async () => {
    sendCodeMutateAsync.mockResolvedValueOnce(view({ status: 'sent' }))
    renderPage(<SignInPhonePage />)

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '2145550134' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(sendCodeMutateAsync).toHaveBeenCalledWith({
        channel: 'sms',
        phone_number: '+12145550134',
        captcha_token: 'captcha-token',
      })
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/verify'))
  })

  test('a locked view is sent to /auth/locked instead', async () => {
    sendCodeMutateAsync.mockResolvedValueOnce(view({ status: 'locked' }))
    renderPage(<SignInPhonePage />)

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '2145550134' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/locked'))
  })
})

describe('/auth/sign-up', () => {
  test('will not submit until the terms checkbox is checked', () => {
    renderPage(<SignUpPage />)
    expect(screen.getByRole('button', { name: 'Create account' }).hasAttribute('disabled')).toBe(
      true
    )
  })

  test('the phone field is disabled, so sign-up sends name and email only', async () => {
    signUpMutateAsync.mockResolvedValueOnce(view({ status: 'sent', channel: 'email' }))
    renderPage(<SignUpPage />)

    expect(screen.getByLabelText('Phone').hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jacob Johnson' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jacob@example.com' } })
    fireEvent.click(screen.getByRole('checkbox'))

    const submit = screen.getByRole('button', { name: 'Create account' })
    expect(submit.hasAttribute('disabled')).toBe(false)
    fireEvent.click(submit)

    await waitFor(() =>
      expect(signUpMutateAsync).toHaveBeenCalledWith({
        name: 'Jacob Johnson',
        email: 'jacob@example.com',
        phone_number: undefined,
        accepted_terms: true,
        captcha_token: 'captcha-token',
      })
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/verify'))
  })
})

describe('/auth/verify', () => {
  test('with nothing seeded it bounces to sign-in and renders nothing', async () => {
    const { container } = renderPage(<VerifyPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/sign-in'))
    expect(container.textContent).toBe('')
  })

  test('a seeded verification shows the masked destination and a Verify button', () => {
    renderPage(<VerifyPage />, {
      verification: { view: view(), channel: 'sms', phone_number: '+12145550134' },
    })
    expect(screen.getByText('(•••) •••-0134')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy()
  })

  test('a locked view bounces to /auth/locked', async () => {
    renderPage(<VerifyPage />, {
      verification: {
        view: view({ status: 'locked' }),
        channel: 'sms',
        phone_number: '+12145550134',
      },
    })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/locked'))
  })

  test('THE CODE SCREEN CARRIES NO CAPTCHA, and a resend sends no token', async () => {
    sendCodeMutateAsync.mockResolvedValueOnce(view({ resend_at: new Date(NOW).toISOString() }))
    const { container } = renderPage(<VerifyPage />, {
      verification: {
        view: view({ resend_at: new Date(NOW).toISOString() }),
        channel: 'sms',
        phone_number: '+12145550134',
      },
    })

    expect(container.querySelector('[data-testid="turnstile"]')).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))

    await waitFor(() =>
      expect(sendCodeMutateAsync).toHaveBeenCalledWith({
        channel: 'sms',
        phone_number: '+12145550134',
        email: undefined,
      })
    )
  })

  test('AN ACCEPTED CODE LANDS ON THE PAGE IT CAME FROM, never back on sign-in', async () => {
    vi.useFakeTimers()
    try {
      verifyCodeMutateAsync.mockResolvedValueOnce(view({ status: 'verified' }))
      renderPage(<VerifyPage />, {
        verification: {
          view: view(),
          channel: 'sms',
          phone_number: '+12145550134',
          next: '/admin/orders/abc-123',
        },
      })

      fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
      await vi.waitFor(() => expect(verifyCodeMutateAsync).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(2000)

      expect(replace).toHaveBeenCalledWith('/admin/orders/abc-123')
      expect(replace).not.toHaveBeenCalledWith('/auth/sign-in')
      expect(adoptSession).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  test('with nothing asked for, the role decides: an admin lands on /admin', async () => {
    vi.useFakeTimers()
    try {
      getSession.mockResolvedValueOnce({ data: { user: { id: 'u-1', role: 'admin' } } })
      verifyCodeMutateAsync.mockResolvedValueOnce(view({ status: 'verified' }))
      renderPage(<VerifyPage />, {
        verification: { view: view(), channel: 'sms', phone_number: '+12145550134' },
      })

      fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
      await vi.waitFor(() => expect(verifyCodeMutateAsync).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(2000)

      expect(replace).toHaveBeenCalledWith('/admin')
      expect(replace).not.toHaveBeenCalledWith('/auth/sign-in')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a change_email verification confirms through useConfirmChange and lands on settings', async () => {
    confirmChangeMutateAsync.mockResolvedValueOnce({
      factor: 'email',
      next_value: 'new@example.com',
      previous_notified: true,
    } satisfies ChangeConfirmedView)

    renderPage(<VerifyPage />, {
      verification: {
        view: view({
          purpose: 'change_email',
          channel: 'email',
          destination: 'j•••@doradometals.com',
        }),
        channel: 'email',
        email: 'new@example.com',
        next: '/settings/email',
      },
    })

    fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(confirmChangeMutateAsync).toHaveBeenCalledWith({ code: '123456' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/settings/email/confirmed'))
  })
})

describe('/auth/verify/step-up', () => {
  test('with no step-up verification it bounces to /account', async () => {
    renderPage(<StepUpPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'))
  })

  test('a seeded step-up verification shows "Verify it\'s you"', () => {
    renderPage(<StepUpPage />, {
      verification: {
        view: view({ purpose: 'step_up', channel: 'email', destination: 'j•••@doradometals.com' }),
        channel: 'email',
        email: 'jacob@doradometals.com',
      },
    })
    expect(screen.getByText("Verify it's you")).toBeTruthy()
  })
})

describe('/auth/locked', () => {
  test('renders the locked state and reads the cooldown off the seeded view', () => {
    renderPage(<LockedPage />, {
      verification: {
        view: view({ status: 'locked', locked_until: new Date(NOW + 900_000).toISOString() }),
        channel: 'sms',
      },
    })
    expect(screen.getByText('Too many attempts')).toBeTruthy()
    expect(screen.getByText('Try again in 15 minutes')).toBeTruthy()
  })
})

describe('/auth/session-expired', () => {
  test('renders and its button pushes back to sign-in', () => {
    renderPage(<SessionExpiredPage />)
    expect(screen.getByText("You've been signed out")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(push).toHaveBeenCalledWith('/auth/sign-in')
  })
})
