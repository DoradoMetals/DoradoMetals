import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { auth } from '#accounts/auth/client.ts'
import { MAX_ATTEMPTS, OTP_EXPIRES_SECONDS, OTP_LENGTH } from '#accounts/auth/rules.ts'

const options = auth.options as unknown as Record<string, unknown>
const plugins = auth.options.plugins as unknown as Array<Record<string, unknown>>
const pluginBy = (id: string) => plugins.find((p) => p.id === id)
const optionsOf = (id: string) => (pluginBy(id)?.options ?? {}) as Record<string, unknown>

test('there is no password anywhere in the config', () => {
  assert.equal(
    options.emailAndPassword,
    undefined,
    'the credential provider is gone: every route ends in a code, so a password ' +
      'is a second way in that nothing in the design accounts for'
  )
  assert.equal(options.emailVerification, undefined, 'a verify-link flow has no place left')
  assert.equal(
    (options.user as Record<string, unknown>).changeEmail,
    undefined,
    'a factor change is our own flow now - the code goes to the OTHER factor'
  )
  assert.equal(
    pluginBy('magic-link'),
    undefined,
    'a magic link is a second passwordless mechanism with no design frame (ruling 91)'
  )
})

test('what the cutover keeps is still mounted', () => {
  for (const id of ['admin', 'anonymous', 'stripe', 'phone-number', 'email-otp']) {
    assert.ok(pluginBy(id), `the ${id} plugin is not mounted`)
  }
  assert.ok(
    (options.socialProviders as Record<string, unknown>).google,
    'Google stays (ruling 91)'
  )
  assert.equal(
    ((options.advanced as Record<string, Record<string, unknown>>).database ?? {}).generateId,
    false,
    'the database creates ids'
  )
  assert.ok(
    (options.databaseHooks as Record<string, unknown>).user,
    'the role fill is a database hook'
  )
})

test('emailOTP refuses to mint an account for an unknown address', () => {
  assert.equal(
    optionsOf('email-otp').disableSignUp,
    true,
    'without it /sign-in/email-otp creates an account for any unknown email, which ' +
      'both leaks whether the address is known and mints accounts with no phone'
  )
})

test('the phone columns are the ones the database already has', () => {
  const fields = (
    pluginBy('phone-number')?.schema as Record<string, Record<string, Record<string, unknown>>>
  ).user.fields
  assert.equal(
    (fields.phoneNumber as Record<string, unknown>).fieldName,
    'phone_number',
    'better-auth would otherwise write a camelCase column of its own invention'
  )
  assert.equal(
    (fields.phoneNumberVerified as Record<string, unknown>).fieldName,
    'phone_number_verified'
  )
})

test("better-auth's own attempt ceiling sits ABOVE ours on both plugins", () => {
  for (const id of ['phone-number', 'email-otp']) {
    const allowed = optionsOf(id).allowedAttempts as number
    assert.ok(
      typeof allowed === 'number' && allowed > MAX_ATTEMPTS,
      `${id} allows ${allowed} attempts against our ${MAX_ATTEMPTS} - if the plugin ` +
        'locks first, auth.otp_throttles stops being what the Locked screen reports'
    )
  }
})

test('both plugins mint the code the design describes', () => {
  for (const id of ['phone-number', 'email-otp']) {
    assert.equal(optionsOf(id).otpLength, OTP_LENGTH, `${id} code length`)
    assert.equal(optionsOf(id).expiresIn, OTP_EXPIRES_SECONDS, `${id} expiry`)
  }
  assert.equal(
    typeof optionsOf('phone-number').sendOTP,
    'function',
    'the phone code has no carrier without it'
  )
  assert.equal(typeof optionsOf('email-otp').sendVerificationOTP, 'function')
  assert.equal(
    typeof optionsOf('phone-number').phoneNumberValidator,
    'function',
    'a non-US number must be refused before anything is minted'
  )
  assert.ok(
    optionsOf('phone-number').signUpOnVerification,
    'the sign-up verify is what creates the user'
  )
})

test('no inert security option pretends to guard impersonation', () => {
  assert.ok(pluginBy('admin'), 'the admin plugin is mounted')

  const source = fs
    .readFileSync(new URL('../client.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert.ok(
    /\bbetterAuth\b/.test(source),
    'the strip left no code behind - a check reading nothing accepts everything'
  )
  assert.ok(
    !/\bcanImpersonate\b/.test(source),
    "canImpersonate enforces nothing - impersonation is gated by the plugin's " +
      'own adminMiddleware and hasPermission check, with adminRoles defaulting ' +
      'to ["admin"]'
  )
  assert.ok(
    !/password/i.test(source),
    'the word password should not appear in the auth config at all any more'
  )
})

const betterAuthSource = (() => {
  const root = path.join(process.cwd(), 'node_modules', 'better-auth', 'dist')
  let text = ''
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.mjs') || e.name.endsWith('.d.mts')) {
        text += fs.readFileSync(full, 'utf8')
      }
    }
  }
  walk(root)
  return text
})()

test('every option this codebase sets is one better-auth has heard of', () => {
  assert.ok(
    betterAuthSource.length > 100_000,
    `only ${betterAuthSource.length} bytes of better-auth read - the walk is wrong, ` +
      'and a check that reads nothing accepts everything'
  )

  const configured = {
    user: options.user,
    session: { cookieCache: (options.session as Record<string, unknown>).cookieCache },
    advanced: options.advanced,
    'plugins.anonymous': optionsOf('anonymous'),
    'plugins.phone-number': optionsOf('phone-number'),
    'plugins.email-otp': optionsOf('email-otp'),
  }

  const unknown = []
  let checked = 0
  for (const [where, obj] of Object.entries(configured)) {
    for (const key of Object.keys((obj ?? {}) as Record<string, unknown>)) {
      checked += 1
      if (!new RegExp(`\\b${key}\\b`).test(betterAuthSource)) {
        unknown.push(`${where}.${key}`)
      }
    }
  }

  assert.ok(checked > 15, `only ${checked} option(s) checked - too few to mean anything`)
  assert.deepEqual(
    unknown,
    [],
    `${unknown.length} option(s) appear nowhere in better-auth's build, which ` +
      'means nothing reads them and whatever they were meant to do is not happening'
  )
})

test('RULED (90): the five-minute cookie cache stays, and a ban bites at once', () => {
  const cookieCache = (options.session as Record<string, Record<string, unknown>>).cookieCache

  assert.equal(cookieCache.enabled, true, 'ruling 90 keeps the cache')
  assert.equal(cookieCache.maxAge, 5 * 60, 'the window a cached PAYLOAD survives, in seconds')

  const seam = fs.readFileSync(new URL('../session.ts', import.meta.url), 'utf8')
  const middleware = fs.readFileSync(
    new URL('../../../../shared/middleware/authMiddleware.ts', import.meta.url),
    'utf8'
  )

  assert.ok(
    /\bbetterAuth\b|\bsessions\b/.test(seam) && /requireAuth/.test(middleware),
    'both files read as source - a check that reads nothing accepts everything'
  )
  assert.ok(
    /sessions\.current\(/.test(middleware),
    'requireAuth must go through the session seam, not straight to auth.api.getSession'
  )
  assert.ok(
    !/auth\.api\.getSession/.test(middleware),
    'a second, unchecked path to a session is the finding all over again'
  )
  assert.ok(/freshnessOf\(/.test(seam), 'the seam reads the session row on every request')
  assert.ok(
    /sessionVerdict\(/.test(seam) && /sessionRole\(/.test(seam),
    'ban state AND role both come from that read'
  )
  assert.ok(/403/.test(middleware), 'a banned caller is refused with 403, not quietly served')
})
