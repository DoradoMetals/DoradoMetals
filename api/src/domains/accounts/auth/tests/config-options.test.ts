import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { auth } from '#accounts/auth/client.ts'

const options = auth.options

test('the email-change approval goes out under the name better-auth reads', () => {
  const changeEmail = options.user.changeEmail

  assert.equal(changeEmail.enabled, true, 'the flow is meant to be on')
  assert.equal(
    typeof changeEmail.sendChangeEmailConfirmation,
    'function',
    'sendChangeEmailConfirmation is the option better-auth reads - without it, ' +
      'update-user.mjs falls through to the emailVerification branch and mails ' +
      'the NEW address rather than asking the old one to approve'
  )
  assert.ok(
    !('sendChangeEmailVerification' in changeEmail),
    'sendChangeEmailVerification is not an option and never was - if it is ' +
      'back, the approval mail is going nowhere again'
  )
})

test('no inert security option pretends to guard impersonation', () => {
  const admin = options.plugins.find((p) => p.id === 'admin')
  assert.ok(admin, 'the admin plugin is mounted')

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

  const anonymousPlugin = options.plugins.find((p) => p.id === 'anonymous')
  assert.ok(anonymousPlugin, 'the anonymous plugin is mounted (ruling 63)')

  const configured = {
    'user.changeEmail': options.user.changeEmail,
    session: { cookieCache: options.session.cookieCache },
    emailAndPassword: options.emailAndPassword,
    emailVerification: options.emailVerification,
    advanced: options.advanced,
    'plugins.anonymous': anonymousPlugin.options,
  }

  const unknown = []
  let checked = 0
  for (const [where, obj] of Object.entries(configured)) {
    for (const key of Object.keys(obj ?? {})) {
      checked += 1
      if (!new RegExp(`\\b${key}\\b`).test(betterAuthSource)) {
        unknown.push(`${where}.${key}`)
      }
    }
  }

  assert.ok(checked > 8, `only ${checked} option(s) checked - too few to mean anything`)
  assert.deepEqual(
    unknown,
    [],
    `${unknown.length} option(s) appear nowhere in better-auth's build, which ` +
      'means nothing reads them and whatever they were meant to do is not happening'
  )
  console.log(`      ${checked} configured option(s) checked against better-auth's build`)
})

test('RULED (90): the five-minute cookie cache stays, and a ban bites at once', () => {
  const cookieCache = options.session.cookieCache

  assert.equal(
    cookieCache.enabled,
    true,
    'ruling 90 keeps the cache. It is what lets better-auth answer a session ' +
      'from the SIGNED COOKIE without verifying a token and reading two rows, ' +
      'and the cookie lives in a browser the server cannot reach - so the cache ' +
      'was never the thing that could be made immediate. Immediacy comes from ' +
      'the freshness read below instead.'
  )
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
    'requireAuth must go through the session seam, not straight to ' +
      'auth.api.getSession - the seam is where the freshness read lives'
  )
  assert.ok(
    !/auth\.api\.getSession/.test(middleware),
    'a second, unchecked path to a session is the finding all over again'
  )
  assert.ok(
    /freshnessOf\(/.test(seam),
    'the seam reads the session row and its user on every authenticated ' +
      'request; without it a revoked session keeps working for five minutes'
  )
  assert.ok(
    /sessionVerdict\(/.test(seam) && /sessionRole\(/.test(seam),
    'ban state AND role both come from that read - the admin plugin only ' +
      'checks `banned` when a session is created, and the cookie carries the ' +
      'role it was signed with, so a demotion would otherwise survive the cache'
  )
  assert.ok(
    /403/.test(middleware),
    'a banned caller is refused with 403, not quietly served'
  )
})
