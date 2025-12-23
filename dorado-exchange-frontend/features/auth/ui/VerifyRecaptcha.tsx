import { useVerifyRecaptcha } from '@/features/auth/queries'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'

export function verifyRecaptcha(action: string) {
  const { executeRecaptcha } = useGoogleReCaptcha()
  const verify = useVerifyRecaptcha()

  const run = async (): Promise<boolean> => {
    if (!executeRecaptcha) {
      console.warn('reCAPTCHA not ready')
      return false
    }
    const token = await executeRecaptcha(action)
    const isHuman = await verify.mutateAsync(token)
    return Boolean(isHuman)
  }

  return { run, isPending: verify.isPending }
}
