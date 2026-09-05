import '#env'
import http from 'node:http'
import https from 'node:https'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY ?? ''

if (isTestRun() && key.startsWith('sk_live')) {
  throw new Error(
    'refusing to build a Stripe client with a LIVE key during a test run.\n' +
      'A test reaching this would charge a real card. Use a test key ' +
      '(sk_test_...) in the environment the suite runs in.'
  )
}

type NodeResponse = import('node:http').IncomingMessage

function makeTimeoutError(): Error {
  const err = new TypeError('ETIMEDOUT') as Error & { code?: string }
  err.code = 'ETIMEDOUT'
  return err
}

function immediateWriteResponse(res: NodeResponse): Stripe.HttpClientResponse {
  return {
    getStatusCode: () => res.statusCode ?? 0,
    getHeaders: () => (res.headers as Record<string, string>) ?? {},
    getRawResponse: () => res,
    toStream: (streamCompleteCallback: () => void) => {
      res.once('end', streamCompleteCallback)
      return res
    },
    toJSON: () =>
      new Promise((resolve, reject) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.once('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      }),
  }
}

// Stripe 22 made HttpClient/HttpClientResponse non-generic interfaces
// (HttpClientInterface / HttpClientResponseInterface). The five methods and
// makeRequest's eight arguments are unchanged, so the body below is v18's.
const immediateWriteHttpClient: Stripe.HttpClient = {
  getClientName: () => 'node-immediate-write',
  makeRequest(host, port, path, method, headers, requestData, protocol, timeout) {
    const client = protocol === 'http' ? http : https
    return new Promise((resolve, reject) => {
      const req = client.request({
        host,
        port,
        path,
        method,
        headers: headers as Record<string, string>,
      })
      req.setTimeout(timeout, () => req.destroy(makeTimeoutError()))
      req.on('response', (res) => resolve(immediateWriteResponse(res)))
      req.on('error', reject)
      req.write(requestData ?? '')
      req.end()
    })
  },
}

// The money path pins its API version rather than inheriting whatever the SDK
// happens to default to. `Stripe.LatestApiVersion` is a literal type equal to
// the version THIS SDK ships (22.6.1 -> "2026-08-26.dahlia"), so a future SDK
// bump that moves the wire format fails to compile here instead of changing
// what Stripe sends back at runtime. D203 deferred this upgrade precisely to
// stop that drift arriving unannounced.
const API_VERSION: Stripe.LatestApiVersion = '2026-08-26.dahlia'

const stripeClient = new Stripe(key, {
  apiVersion: API_VERSION,
  ...(isTestRun() ? { httpClient: immediateWriteHttpClient } : {}),
})

export default stripeClient
