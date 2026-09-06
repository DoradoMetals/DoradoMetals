import { test } from 'vitest'
import assert from 'node:assert/strict'
import errorHandler from '#shared/middleware/errorHandler.ts'
import { NotFound, Forbidden, Conflict, Invalid } from '#shared/errors.ts'
import type { NextFunction, Request, Response } from 'express'

type ErrorBody = {
  success: boolean
  error: {
    message: string
    code?: unknown
    details?: unknown
    stack?: unknown
    where?: unknown
  }
}

function capture<T>(fn: () => T): T {
  const real = console.error
  console.error = () => {}
  try {
    return fn()
  } finally {
    console.error = real
  }
}

function respond(
  err: unknown,
  { nodeEnv }: { nodeEnv?: string } = {}
): { status: number; body: ErrorBody } {
  const previous = process.env.NODE_ENV
  if (nodeEnv !== undefined) process.env.NODE_ENV = nodeEnv

  let status: number | undefined
  let body: ErrorBody | undefined
  const res = {
    status(code: number) {
      status = code
      return this
    },
    json(payload: ErrorBody) {
      body = payload
      return this
    },
  }

  try {
    capture(() =>
      errorHandler(
        err,
        { method: 'GET', originalUrl: '/api/x' } as unknown as Request,
        res as unknown as Response,
        (() => {}) as NextFunction
      )
    )
  } finally {
    if (nodeEnv !== undefined) process.env.NODE_ENV = previous
  }
  assert.ok(status !== undefined, 'errorHandler did not set a status')
  assert.ok(body, 'errorHandler did not send a body')
  return { status, body }
}

type CodedError = Error & { code?: string; statusCode?: number; status?: number }

function postgresError(): CodedError {
  const err: CodedError = new Error('invalid input syntax for type uuid: "not-a-uuid"')
  err.code = '22P02'
  err.name = 'error'
  return err
}

test('an unexpected error does not return its own message', () => {
  const { status, body } = respond(postgresError())

  assert.equal(status, 500)
  assert.equal(body.success, false)
  assert.equal(body.error.message, 'Server error')
  assert.ok(
    !JSON.stringify(body).includes('invalid input syntax'),
    'the underlying error text reached the client'
  )
  assert.ok(!JSON.stringify(body).includes('uuid'), 'the column type reached the client')
})

test('a constraint violation does not return the value that collided', () => {
  const err: CodedError = new Error(
    'duplicate key value violates unique constraint "users_email_key"\n' +
      'DETAIL:  Key (email)=(someone@example.com) already exists.'
  )
  err.code = '23505'

  const { body } = respond(err)
  const json = JSON.stringify(body)
  assert.ok(!json.includes('someone@example.com'), "a customer's email reached the client")
  assert.ok(!json.includes('users_email_key'), 'the constraint name reached the client')
})

test('a deliberately raised 4xx keeps its message', () => {
  const err: CodedError = new Error('Address is not valid')
  err.statusCode = 400

  const { status, body } = respond(err)
  assert.equal(status, 400)
  assert.equal(body.error.message, 'Address is not valid')
})

test('a deliberately raised 404 keeps its message', () => {
  const err: CodedError = new Error('Purchase order not found')
  err.status = 404

  const { status, body } = respond(err)
  assert.equal(status, 404)
  assert.equal(body.error.message, 'Purchase order not found')
})

test('a deliberately raised 5xx is still generic', () => {
  const err: CodedError = new Error('redis connection pool exhausted at 10.0.0.4:6379')
  err.statusCode = 503

  const { status, body } = respond(err)
  assert.equal(status, 503)
  assert.equal(body.error.message, 'Server error')
})

test('the source path is returned in development and never in production', () => {
  const withStack = postgresError()
  withStack.stack =
    'Error: x\n    at Module.retrievePaymentIntent (/home/jtj60/dorado-exchange/api/features/stripe/repo.js:23:5)'

  const dev = respond(withStack, { nodeEnv: 'development' })
  assert.ok(dev.body.error.where, 'dev lost the source path, which is the point of it')

  const prod = respond(withStack, { nodeEnv: 'production' })
  assert.equal(prod.body.error.where, undefined)
  assert.ok(
    !JSON.stringify(prod.body).includes('/home/'),
    'an absolute server path reached the client'
  )
})

test('a NotFound domain error answers 404 and keeps its message', () => {
  const { status, body } = respond(new NotFound('Purchase order 123 not found'))
  assert.equal(status, 404)
  assert.equal(body.error.message, 'Purchase order 123 not found')
})

test('a Forbidden domain error answers 403 and keeps its message', () => {
  const { status, body } = respond(new Forbidden('this order is not yours'))
  assert.equal(status, 403)
  assert.equal(body.error.message, 'this order is not yours')
})

test('a Conflict domain error answers 409 and keeps its message', () => {
  const { status, body } = respond(new Conflict('intent already captured'))
  assert.equal(status, 409)
  assert.equal(body.error.message, 'intent already captured')
})

test('an Invalid domain error answers 422 and keeps its message', () => {
  const { status, body } = respond(new Invalid('this metal is not traded'))
  assert.equal(status, 422)
  assert.equal(body.error.message, 'this metal is not traded')
})

test("a domain error's kind outranks a statusCode also present on the error", () => {
  const err = new NotFound('gone') as NotFound & { statusCode?: number }
  err.statusCode = 418
  const { status } = respond(err)
  assert.equal(status, 404)
})

test('a non-integer statusCode falls back to a plain 500', () => {
  const err: Error & { statusCode?: number } = new Error('Bad Request, sort of')
  err.statusCode = 400.5
  const { status, body } = respond(err)
  assert.equal(status, 500)
  assert.equal(body.error.message, 'Server error')
})

test('a plain Error with no status information answers 500', () => {
  const { status, body } = respond(new Error('boom'))
  assert.equal(status, 500)
  assert.equal(body.error.message, 'Server error')
})

test('a status that is not a number does not crash the response and answers 500', () => {
  const err: Error & { status?: unknown } = new Error('weird carrier client')
  err.status = 'nope'
  const { status, body } = respond(err)
  assert.equal(status, 500)
  assert.equal(body.error.message, 'Server error')
})

test('a status that is an object does not crash the response and answers 500', () => {
  const err: Error & { status?: unknown } = new Error('weird carrier client')
  err.status = {}
  const { status, body } = respond(err)
  assert.equal(status, 500)
  assert.equal(body.error.message, 'Server error')
})

function axiosError(
  opts: {
    status?: number
    transactionId?: string
    errors?: unknown
    message?: string
  } = {}
): unknown {
  return {
    isAxiosError: true,
    message: opts.message ?? 'Request failed with status code 502',
    config: { url: 'https://api.fedex.com/ship', method: 'post', headers: {} },
    response: opts.status
      ? {
          status: opts.status,
          headers: {},
          data: { transactionId: opts.transactionId, errors: opts.errors },
        }
      : undefined,
  }
}

test("an axios error never returns the upstream's own message to the caller", () => {
  const { status, body } = respond(axiosError({ status: 502, transactionId: 'carrier-tx-1' }))
  assert.equal(status, 502)
  assert.equal(body.error.message, 'Upstream carrier request failed')
  assert.equal((body.error as any).carrier_status, 502)
  assert.equal((body.error as any).carrier_transaction_id, 'carrier-tx-1')
  assert.ok(
    !JSON.stringify(body).includes('Request failed with status code'),
    'the raw axios message reached the client'
  )
})

test('an axios error with no response (network failure) still answers 502 with the generic message', () => {
  const { status, body } = respond(axiosError())
  assert.equal(status, 502)
  assert.equal(body.error.message, 'Upstream carrier request failed')
})

test("a carrier 401 does not become this API's own 401", () => {
  const { status, body } = respond(axiosError({ status: 401 }))
  assert.equal(status, 502)
  assert.equal(body.error.message, 'Upstream carrier request failed')
  assert.equal((body.error as any).carrier_status, 401)
})

test("a carrier 403 does not become this API's own 403", () => {
  const { status, body } = respond(axiosError({ status: 403 }))
  assert.equal(status, 502)
  assert.equal(body.error.message, 'Upstream carrier request failed')
  assert.equal((body.error as any).carrier_status, 403)
})
