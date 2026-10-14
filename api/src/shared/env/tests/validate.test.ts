import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  REQUIRED_ENV_NAMES,
  PRODUCTION_ONLY_ENV_NAMES,
  missingEnvNames,
  mailRedirectUnsafe,
} from '#shared/env/validate.ts'

const fullEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {}
  for (const name of REQUIRED_ENV_NAMES) env[name] = 'x'
  for (const name of PRODUCTION_ONLY_ENV_NAMES) env[name] = 'x'
  return env
}

test('nothing is missing when every required name is set', () => {
  assert.deepEqual(missingEnvNames(fullEnv()), [])
})

test('each required name is reported missing on its own', () => {
  for (const name of REQUIRED_ENV_NAMES) {
    const env = fullEnv()
    delete env[name]
    assert.deepEqual(missingEnvNames(env), [name])
  }
})

test('an empty string counts as missing, not as a value', () => {
  const env = fullEnv()
  env.DATABASE_URL = ''
  assert.deepEqual(missingEnvNames(env), ['DATABASE_URL'])
})

test('production-only names are not required outside production', () => {
  const env = fullEnv()
  delete env.NODE_ENV
  for (const name of PRODUCTION_ONLY_ENV_NAMES) delete env[name]
  assert.deepEqual(missingEnvNames(env), [])
})

test('production-only names are required when NODE_ENV=production', () => {
  const env = fullEnv()
  env.NODE_ENV = 'production'
  for (const name of PRODUCTION_ONLY_ENV_NAMES) delete env[name]
  assert.deepEqual(missingEnvNames(env), PRODUCTION_ONLY_ENV_NAMES)
})

test('missing names are reported in declared order, not sorted', () => {
  const env = fullEnv()
  delete env.STRIPE_SECRET_KEY
  delete env.DATABASE_URL
  assert.deepEqual(missingEnvNames(env), ['DATABASE_URL', 'STRIPE_SECRET_KEY'])
})

test('MAIL_REDIRECT_TO outside production is safe', () => {
  const env = fullEnv()
  delete env.NODE_ENV
  env.MAIL_REDIRECT_TO = 'jacob@dorado.test'
  assert.equal(mailRedirectUnsafe(env), false)
})

test('MAIL_REDIRECT_TO with NODE_ENV=production is unsafe', () => {
  const env = fullEnv()
  env.NODE_ENV = 'production'
  env.MAIL_REDIRECT_TO = 'jacob@dorado.test'
  assert.equal(mailRedirectUnsafe(env), true)
})

test('production with no MAIL_REDIRECT_TO set is safe', () => {
  const env = fullEnv()
  env.NODE_ENV = 'production'
  delete env.MAIL_REDIRECT_TO
  assert.equal(mailRedirectUnsafe(env), false)
})
