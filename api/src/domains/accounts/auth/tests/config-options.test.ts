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

test('UNDECIDED, pinned as it stands: a ban bites only after the cookie cache expires', () => {
  const cookieCache = options.session.cookieCache

  assert.equal(
    cookieCache.enabled,
    true,
    'this is finding 35 and it is a decision Jacob has not made. With cookieCache ' +
      'on, better-auth answers the session route from the SIGNED COOKIE with no ' +
      'database read, and the admin plugin only checks `banned` at sign-in - so a ' +
      'ban, a revoked session and a demotion from admin all keep working until the ' +
      'cached payload expires. Changing this without a ruling is not the fix.'
  )
  assert.equal(cookieCache.maxAge, 5 * 60, 'the window a stale session survives, in seconds')

  const source = fs.readFileSync(new URL('../../../../shared/middleware/authMiddleware.ts', import.meta.url), 'utf8')
  assert.ok(
    !/\bbanned\b/.test(source),
    'requireAuth still never looks at `banned`; if that changed, the decision was ' +
      'taken and this pin should move with it'
  )
})
