// Creates the two accounts the Playwright suite signs in as.
//
// WHY THESE EXIST AT ALL. Every authed flow - the account page, checkout, and
// the whole of /admin including impersonation and purchase-order creation -
// needs a real session. The alternative was a test-only auth bypass, and that
// was rejected: a bypass that ever ships is catastrophic on an app holding
// customers' bank details, and "it is guarded by NODE_ENV" is exactly the guard
// that gets loosened to make a build green. These log in through the real form
// with a real password, the way a person does.
//
// IDEMPOTENT. Run it as often as you like; it creates what is missing and
// leaves what exists alone. It never touches an account it did not create -
// every write is scoped to the two addresses below.
//
// THESE COMMIT. better-auth writes exchange through its OWN pool, so the pinned
// transaction the API suite uses cannot contain it. That is accepted: the rows
// are additive, they belong to nobody, and the addresses are @example.invalid
// which is reserved by RFC 2606 and can never receive mail.
//
// NO MAIL LEAVES. better-auth is configured with sendOnSignUp, so this runs
// with NODE_ENV=test, under which features/emails/utils/sendEmail refuses to
// construct the real transport at all. A send is not merely suppressed, it is
// impossible.
process.env.NODE_ENV = "test";

import "#env";
import pool from "#db";
import query from "#shared/db/query.js";
import { auth } from "#features/auth/client.js";

export const E2E_USERS = {
  admin: {
    email: "e2e-admin@example.invalid",
    password: "e2e-Admin-Password-1",
    name: "E2E Admin",
    role: "admin",
  },
  customer: {
    email: "e2e-customer@example.invalid",
    password: "e2e-Customer-Password-1",
    name: "E2E Customer",
    role: "user",
  },
};

async function ensure({ email, password, name, role }) {
  const { rows } = await query(`SELECT id, role FROM exchange.users WHERE email = $1`, [email]);

  if (!rows.length) {
    try {
      await auth.api.signUpEmail({ body: { email, password, name } });
    } catch (err) {
      // better-auth creates the row and THEN sends the verification email, so a
      // refusal from the mail guard leaves a usable account behind. Anything
      // else is a real failure and must not be swallowed.
      if (!/refusing to build the real mail transport/.test(String(err?.message))) throw err;
    }
  }

  const after = await query(`SELECT id, role FROM exchange.users WHERE email = $1`, [email]);
  if (!after.rows.length) throw new Error(`${email} was not created`);

  // Role and verification are set directly: better-auth has no API for either,
  // and an unverified account cannot complete some flows. Scoped to this one
  // address, so nothing else can be affected.
  await query(
    `UPDATE exchange.users SET role = $1, "emailVerified" = true WHERE email = $2`,
    [role, email]
  );

  return { email, id: after.rows[0].id, created: !rows.length };
}

const results = [];
for (const user of Object.values(E2E_USERS)) results.push(await ensure(user));

for (const r of results) {
  console.log(`  ${r.created ? "created" : "already present"}  ${r.email}  ${r.id}`);
}

// Proves the accounts are usable, not merely present - a row with an unusable
// password hash would pass every check above and fail every test.
for (const { email, password } of Object.values(E2E_USERS)) {
  const res = await auth.api.signInEmail({ body: { email, password } });
  if (!res?.user?.id) throw new Error(`${email} exists but cannot sign in`);
  console.log(`  sign-in ok    ${email}`);
}

await pool.end();
