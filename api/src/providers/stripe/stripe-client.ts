import '#env'
import http from 'node:http'
import https from 'node:https'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import { requiredEnv } from '#shared/env/required.ts'
import { STRIPE_API_VERSION } from '#providers/stripe/constants.ts'
import Stripe from 'stripe'

const key = requiredEnv('STRIPE_SECRET_KEY')

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

const stripeClient = new Stripe(key, {
  apiVersion: STRIPE_API_VERSION,
  ...(isTestRun() ? { httpClient: immediateWriteHttpClient } : {}),
})

export default stripeClient
