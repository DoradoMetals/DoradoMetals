import { requiredEnv } from '#shared/env/required.ts'
import axios from 'axios'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import { FEDEX_OAUTH_TOKEN_PATH } from '#providers/fedex/constants.ts'

const sandbox = () => process.env.FEDEX_ENV === 'sandbox'

const base = () =>
  sandbox()
    ? (process.env.FEDEX_SANDBOX_API_URL ?? process.env.FEDEX_API_URL)
    : process.env.FEDEX_API_URL

export const accountNumber = () =>
  sandbox() ? process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER : process.env.FEDEX_ACCOUNT_NUMBER

export const trackingAccountNumber = () =>
  sandbox()
    ? process.env.FEDEX_TRACKING_SANDBOX_ACCOUNT_NUMBER
    : process.env.FEDEX_TRACKING_ACCOUNT_NUMBER

export const activeEnvironment = () => (sandbox() ? 'sandbox' : 'production')
export const apiBase = base

async function fetchOAuthToken({
  clientId,
  clientSecret,
}: {
  clientId: string
  clientSecret: string
}) {
  const response = await axios.post(
    base() + FEDEX_OAUTH_TOKEN_PATH,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return response.data.access_token
}

function refuseInTests(what: string) {
  if (!isTestRun()) return
  if ((process.env.FEDEX_ENV ?? 'production') === 'sandbox') return
  throw new Error(
    `refusing to call the LIVE FedEx API (${what}) during a test run.\n` +
      `FEDEX_ENV is "${process.env.FEDEX_ENV ?? 'production'}" - this would be a ` +
      `real request against the real account, buying a real label.\n` +
      `Set FEDEX_ENV=sandbox, or stub the provider.`
  )
}

export async function fetchAccessToken() {
  refuseInTests('fetchAccessToken')
  return fetchOAuthToken({
    clientId: sandbox() ? requiredEnv('FEDEX_SANDBOX_CLIENT_ID') : requiredEnv('FEDEX_CLIENT_ID'),
    clientSecret: sandbox()
      ? requiredEnv('FEDEX_SANDBOX_CLIENT_SECRET')
      : requiredEnv('FEDEX_CLIENT_SECRET'),
  })
}

export async function fetchTrackingToken() {
  refuseInTests('fetchTrackingToken')
  return fetchOAuthToken({
    clientId: sandbox()
      ? requiredEnv('FEDEX_TRACKING_SANDBOX_CLIENT_ID')
      : requiredEnv('FEDEX_TRACKING_CLIENT_ID'),
    clientSecret: sandbox()
      ? requiredEnv('FEDEX_TRACKING_SANDBOX_CLIENT_SECRET')
      : requiredEnv('FEDEX_TRACKING_CLIENT_SECRET'),
  })
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function fedexPost({
  token,
  path,
  payload,
}: {
  token: string
  path: string
  payload: unknown
}) {
  refuseInTests(`POST ${path}`)
  const res = await axios.post(base() + path, payload, { headers: authHeaders(token) })
  return res.data
}

export async function fedexPut({
  token,
  path,
  payload,
}: {
  token: string
  path: string
  payload: unknown
}) {
  refuseInTests(`PUT ${path}`)
  const res = await axios.put(base() + path, payload, { headers: authHeaders(token) })
  return res.data
}
