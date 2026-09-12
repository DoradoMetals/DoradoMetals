import axios from 'axios'
import { requiredEnv } from '#shared/env/required.ts'
import { CLOUDFLARE_TURNSTILE_SITEVERIFY_URL } from '#providers/cloudflare/constants.ts'

const SITEVERIFY = CLOUDFLARE_TURNSTILE_SITEVERIFY_URL

export async function verify(token: string, ip: string | null): Promise<boolean> {
  const secret = requiredEnv('TURNSTILE_SECRET_KEY')
  if (!token) return false

  const params = new URLSearchParams()
  params.append('secret', secret)
  params.append('response', token)
  if (ip) params.append('remoteip', ip)

  const response = await axios.post(SITEVERIFY, params)
  return response.data?.success === true
}
