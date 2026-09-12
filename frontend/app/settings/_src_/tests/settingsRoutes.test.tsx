// The four /settings auth-adjacent route pages, rendered.
//
// email and phone wrap their content in ProtectedPage (useGetSession), which
// shows "Loading..." until its own effect settles - so these tests await the
// real content rather than asserting on the first paint. The two *_/confirmed
// pages read the VerificationProvider's `confirmed` value the same way the
// /auth pages read `verification` - seeded through the same double-render
// pattern (see authRoutes.test.tsx for why a single render races the page's
// own "nothing seeded, bounce" effect).
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import type { ChangeConfirmedView, VerificationView } from '@dorado/contracts'

import { VerificationProvider, useVerification } from '@/shared/providers/VerificationProvider'

const push = vi.fn()
const replace = vi.fn()
const back = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const changeEmailMutateAsync = vi.fn()
const changePhoneMutateAsync = vi.fn()
const stepUpMutateAsync = vi.fn()

vi.mock('@dorado/client', () => ({
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
  useStepUp: () => ({
    mutateAsync: stepUpMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSendCode: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useSignUp: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useVerifyCode: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useConfirmChange: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useSession: () => ({ data: null, isPending: false }),
}))

vi.mock('@/shared/hooks/useCaptcha', () => ({
  useCaptcha: () => ({ widget: null, token: async () => 'captcha-token', reset: () => {} }),
}))

vi.mock('@/shared/hooks/auth/queries', () => ({
  useGoogleSignIn: () => ({ mutate: vi.fn(), isPending: false }),
  useAdoptSession: () => vi.fn(),
  useGetSession: () => ({ user: { id: 'u-1', role: 'user', name: 'Test User' }, isPending: false }),
}))

import ChangeEmailPage from '@/app/settings/email/page'
import EmailConfirmedPage from '@/app/settings/email/confirmed/page'
import ChangePhonePage from '@/app/settings/phone/page'
import PhoneConfirmedPage from '@/app/settings/phone/confirmed/page'

const NOW = Date.now()

const view = (over: Partial<VerificationView> = {}): VerificationView => ({
  purpose: 'change_email',
  channel: 'email',
  destination: 'j•••@doradometals.com',
  code_length: 6,
  expires_at: new Date(NOW + 600_000).toISOString(),
  resend_at: new Date(NOW + 24_000).toISOString(),
  attempts_remaining: 4,
  locked_until: null,
  status: 'sent',
  ...over,
})

function Seed({ confirmed }: { confirmed?: ChangeConfirmedView | null }) {
  const { setConfirmed } = useVerification()
  useEffect(() => {
    if (confirmed !== undefined) setConfirmed(confirmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderPage(ui: React.ReactElement, seed: { confirmed?: ChangeConfirmedView | null } = {}) {
  const utils = render(
    <VerificationProvider>
      <Seed {...seed} />
    </VerificationProvider>
  )
  utils.rerender(<VerificationProvider>{ui}</VerificationProvider>)
  return utils
}

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
  back.mockClear()
  changeEmailMutateAsync.mockReset()
  changePhoneMutateAsync.mockReset()
  stepUpMutateAsync.mockReset()
})

describe('/settings/email', () => {
  test('renders the change-email state once the session check settles', async () => {
    renderPage(<ChangeEmailPage />)
    expect(await screen.findByText('Change your email')).toBeTruthy()
    expect(screen.getByLabelText('New email')).toBeTruthy()
  })

  test('submitting calls useChangeEmail and moves to verify', async () => {
    changeEmailMutateAsync.mockResolvedValueOnce(view({ status: 'sent' }))
    renderPage(<ChangeEmailPage />)

    const input = await screen.findByLabelText('New email')
    fireEvent.change(input, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await waitFor(() =>
      expect(changeEmailMutateAsync).toHaveBeenCalledWith({ email: 'new@example.com' })
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/verify'))
  })

  test('a step_up_required rejection steps up instead of failing', async () => {
    changeEmailMutateAsync.mockRejectedValueOnce(new Error('step_up_required'))
    stepUpMutateAsync.mockResolvedValueOnce(view({ purpose: 'step_up', status: 'sent' }))
    renderPage(<ChangeEmailPage />)

    const input = await screen.findByLabelText('New email')
    fireEvent.change(input, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await waitFor(() => expect(stepUpMutateAsync).toHaveBeenCalled())
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/verify/step-up'))
  })
})

describe('/settings/phone', () => {
  test('renders the change-phone state once the session check settles', async () => {
    renderPage(<ChangePhonePage />)
    expect(await screen.findByText('Change your phone')).toBeTruthy()
    expect(screen.getByLabelText('New phone')).toBeTruthy()
  })

  test('submitting calls useChangePhone and moves to verify', async () => {
    changePhoneMutateAsync.mockResolvedValueOnce(view({ status: 'sent', channel: 'sms' }))
    renderPage(<ChangePhonePage />)

    const input = await screen.findByLabelText('New phone')
    fireEvent.change(input, { target: { value: '2145550134' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await waitFor(() =>
      expect(changePhoneMutateAsync).toHaveBeenCalledWith({ phone_number: '+12145550134' })
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/verify'))
  })

  test('a step_up_required rejection steps up instead of failing', async () => {
    changePhoneMutateAsync.mockRejectedValueOnce(new Error('step_up_required'))
    stepUpMutateAsync.mockResolvedValueOnce(
      view({ purpose: 'step_up', status: 'sent', channel: 'sms' })
    )
    renderPage(<ChangePhonePage />)

    const input = await screen.findByLabelText('New phone')
    fireEvent.change(input, { target: { value: '2145550134' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await waitFor(() => expect(stepUpMutateAsync).toHaveBeenCalled())
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/verify/step-up'))
  })
})

describe('/settings/email/confirmed', () => {
  test('with nothing confirmed it bounces to /account', async () => {
    renderPage(<EmailConfirmedPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'))
  })

  test('a seeded confirmation shows the new value and a Done button', () => {
    renderPage(<EmailConfirmedPage />, {
      confirmed: { factor: 'email', next_value: 'new@example.com', previous_notified: true },
    })
    expect(screen.getByText('Email changed')).toBeTruthy()
    expect(screen.getByText(/new@example\.com/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })
})

describe('/settings/phone/confirmed', () => {
  test('with nothing confirmed it bounces to /account', async () => {
    renderPage(<PhoneConfirmedPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'))
  })

  test('a seeded confirmation shows the new value and a Done button', () => {
    renderPage(<PhoneConfirmedPage />, {
      confirmed: { factor: 'phone', next_value: '+12145550134', previous_notified: false },
    })
    expect(screen.getByText('Phone changed')).toBeTruthy()
    expect(screen.getByText(/\+12145550134/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })
})
