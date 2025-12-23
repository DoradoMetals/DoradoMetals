import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { useVerifyRecaptcha } from '@/lib/queries/useRecaptcha'

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
