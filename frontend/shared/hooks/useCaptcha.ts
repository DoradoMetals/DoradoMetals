'use client'

import { useCallback } from 'react'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'

// The token the API's captcha provider verifies. The browser only fetches it;
// whether it passes is the server's decision.
export function useCaptcha() {
  const { executeRecaptcha } = useGoogleReCaptcha()
  return useCallback(
    async (action: string): Promise<string> =>
      executeRecaptcha ? await executeRecaptcha(action) : '',
    [executeRecaptcha]
  )
}
