import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import nock from 'nock'

export const CASSETTE_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'tests',
  'cassettes'
)

export const RECORDING = process.env.RECORD_CASSETTES === '1'

const LOOPBACK = /^(127\.0\.0\.1|localhost)(:\d+)?$/

const restoreLoopback = () => {
  nock.enableNetConnect(LOOPBACK)
}

export const SCRUBBED = {
  accessToken: 'SCRUBBED_ACCESS_TOKEN',
  clientId: 'SCRUBBED_CLIENT_ID',
  clientSecret: 'SCRUBBED_CLIENT_SECRET',
  account: 'SCRUBBED_ACCOUNT_NUMBER',
  label: 'U0NSVUJCRURfTEFCRUw=',
  email: 'scrubbed@example.invalid',
  name: 'SCRUBBED NAME',
  phone: '0000000000',
  secret: 'SCRUBBED_SECRET',
  date: 'SCRUBBED_DATE',
  customer: 'cus_SCRUBBED',
  userId: 'SCRUBBED_USER_ID',
  sessionId: 'SCRUBBED_SESSION_ID',
} as const

const FEDEX_ACCOUNT_KEYS = new Set(['accountNumber', 'associatedAccountNumber'])
const FEDEX_DATE_KEYS = new Set([
  'shipDateStamp',
  'packageReadyTime',
  'readyDateTimestamp',
  'customerCloseTime',
  'scheduledDate',
])

function normaliseFedexValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normaliseFedexValue)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (FEDEX_ACCOUNT_KEYS.has(key)) {
        out[key] =
          inner && typeof inner === 'object' ? { value: SCRUBBED.account } : SCRUBBED.account
      } else if (FEDEX_DATE_KEYS.has(key)) {
        out[key] = SCRUBBED.date
      } else {
        out[key] = normaliseFedexValue(inner)
      }
    }
    return out
  }
  return value
}

const OAUTH_BODY = `grant_type=client_credentials&client_id=${SCRUBBED.clientId}&client_secret=${SCRUBBED.clientSecret}`

export function normaliseFedexBody(body: unknown, path?: string): unknown {
  if (path?.includes('/oauth/token')) return OAUTH_BODY
  if (typeof body === 'string') {
    try {
      return JSON.stringify(normaliseFedexValue(JSON.parse(body)))
    } catch {
      return body
    }
  }
  return normaliseFedexValue(body)
}

const STRIPE_VOLATILE: Record<string, string> = {
  customer: SCRUBBED.customer,
  'metadata[user_id]': SCRUBBED.userId,
  'metadata[session_id]': SCRUBBED.sessionId,
}

export function normaliseStripeBody(body: unknown): unknown {
  if (typeof body !== 'string') return body
  const params = new URLSearchParams(body)
  let touched = false
  for (const [key, replacement] of Object.entries(STRIPE_VOLATILE)) {
    if (!params.has(key)) continue
    params.set(key, replacement)
    touched = true
  }
  return touched ? params.toString() : body
}

const SECRET_RESPONSE_KEYS: Record<string, string> = {
  access_token: SCRUBBED.accessToken,
  refresh_token: SCRUBBED.accessToken,
  encodedLabel: SCRUBBED.label,
  emailAddress: SCRUBBED.email,
  email: SCRUBBED.email,
  personName: SCRUBBED.name,
  phoneNumber: SCRUBBED.phone,
}

function scrubValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => scrubValue(v))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, inner] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(inner, k)
    }
    return out
  }
  if (typeof value !== 'string' || key === undefined) return value

  const replacement = SECRET_RESPONSE_KEYS[key]
  if (replacement !== undefined) return replacement

  if (key === 'client_secret' && value.includes('_secret_')) {
    return `${value.split('_secret_')[0]}_secret_${SCRUBBED.secret}`
  }
  return value
}

function scrubStripeCustomer(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubStripeCustomer)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, inner] of Object.entries(record)) {
    out[k] = scrubStripeCustomer(inner)
  }
  if (record.object === 'customer') {
    if ('name' in out) out.name = SCRUBBED.name
    if ('email' in out) out.email = SCRUBBED.email
    if ('description' in out && typeof out.description === 'string') out.description = SCRUBBED.name
  }
  if (record.object === 'billing_details' || record.object === 'shipping') {
    if ('name' in out) out.name = SCRUBBED.name
  }
  return out
}

function decodeResponse(def: RecordedDefinition): unknown {
  const encoding = String(headerValue(def.rawHeaders, 'content-encoding') ?? '').toLowerCase()
  const response = def.response
  if (!encoding || !Array.isArray(response)) return response

  const buffer = Buffer.concat(response.map((chunk) => Buffer.from(String(chunk), 'hex')))
  let decoded: Buffer
  if (encoding.includes('br')) decoded = zlib.brotliDecompressSync(buffer)
  else if (encoding.includes('gzip')) decoded = zlib.gunzipSync(buffer)
  else if (encoding.includes('deflate')) decoded = zlib.inflateSync(buffer)
  else return response

  const text = decoded.toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function headerValue(
  headers: Record<string, string | string[]> | undefined,
  name: string
): string | string[] | undefined {
  if (!headers) return undefined
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value
  }
  return undefined
}

type RecordedDefinition = nock.Definition & {
  response?: unknown
  responseIsBinary?: boolean
  filteringRequestBody?: (body: string, recorded: unknown) => string
}

const isLoopback = (scope: string | RegExp) =>
  typeof scope === 'string' && /(127\.0\.0\.1|localhost)/.test(scope)

export function scrub(defs: RecordedDefinition[]): RecordedDefinition[] {
  return defs
    .filter((def) => !isLoopback(def.scope))
    .map((def) => {
      const isFedex = String(def.scope).includes('fedex.com')
      const decoded = decodeResponse(def)
      const scrubbed = scrubStripeCustomer(scrubValue(decoded))

      const contentType = headerValue(def.rawHeaders, 'content-type')
      return {
        scope: def.scope,
        method: def.method,
        path: def.path,
        body: isFedex
          ? (normaliseFedexBody(def.body, String(def.path)) as nock.Definition['body'])
          : (normaliseStripeBody(def.body) as nock.Definition['body']),
        status: def.status,
        response: scrubbed,
        rawHeaders: contentType
          ? { 'content-type': Array.isArray(contentType) ? contentType[0]! : contentType }
          : { 'content-type': 'application/json' },
      } as RecordedDefinition
    })
}

function applyMatchers(def: RecordedDefinition): void {
  const isFedex = String(def.scope).includes('fedex.com')
  def.filteringRequestBody = (body: string) => {
    const normalised = isFedex
      ? normaliseFedexBody(body, String(def.path))
      : normaliseStripeBody(body)
    return typeof normalised === 'string' ? normalised : JSON.stringify(normalised)
  }
}

// Two cassettes are HAND-WRITTEN, not recorded: they describe states the
// sandbox will not produce on demand - an intent Stripe reports as
// `processing`, and an intent already canceled under a fixed id. `test:record`
// runs nock.back in "update" mode, which DELETES a fixture and re-records it
// from whatever the sandbox says now; aimed at these two it replaces the state
// under test with a plain resource_missing 404, and the assertion that depends
// on it stops meaning anything. The Stripe 22 pass walked into exactly that and
// had to restore one by hand. So a recording run SKIPS them - they replay in
// every lane, a recording one included.
export const SYNTHETIC = new Set([
  'stripe/cancel-intent-transient-error.json',
  'stripe/self-heal-stale-intent.json',
])

let modeSet = false

function ensureMode(): void {
  if (modeSet) return
  nock.back.fixtures = CASSETTE_DIR
  nock.back.setMode(RECORDING ? 'update' : 'lockdown')
  modeSet = true
  restoreLoopback()
}

export async function withCassette<T>(name: string, fn: () => Promise<T>): Promise<T> {
  ensureMode()

  const synthetic = SYNTHETIC.has(name)
  if (RECORDING && synthetic) nock.back.setMode('lockdown')

  const fixture = path.join(CASSETTE_DIR, name)
  if ((!RECORDING || synthetic) && !fs.existsSync(fixture)) {
    throw new Error(
      `nock.back lockdown: no cassette at ${fixture}.\n` +
        `Nothing will answer this scenario's requests and nothing may reach the ` +
        `network. Record it with:\n` +
        `  pnpm --filter @dorado/api test:record`
    )
  }

  const { nockDone } = await nock.back(name, {
    before: applyMatchers,
    afterRecord: scrub as (defs: nock.Definition[]) => nock.Definition[],
    recorder: {
      enable_reqheaders_recording: false,
    },
  })
  restoreLoopback()

  try {
    return await fn()
  } finally {
    nockDone()
    nock.cleanAll()
    restoreLoopback()
    if (RECORDING && synthetic) nock.back.setMode('update')
  }
}
