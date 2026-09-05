process.env.NODE_ENV = "test";

import "#env";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { auth } from "#identity/auth/client.ts";

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
  const { rows } = await query(`SELECT id, role FROM auth.users WHERE email = $1`, [email]);

  if (!rows.length) {
    try {
      await auth.api.signUpEmail({ body: { email, password, name } });
    } catch (err) {
      if (!/refusing to build the real mail transport/.test(String(err?.message))) throw err;
    }
  }

  const after = await query(`SELECT id, role FROM auth.users WHERE email = $1`, [email]);
  if (!after.rows.length) throw new Error(`${email} was not created`);

  await query(
    `UPDATE auth.users SET role = $1, "emailVerified" = true WHERE email = $2`,
    [role, email]
  );

  return { email, id: after.rows[0].id, created: !rows.length };
}

const results = [];
for (const user of Object.values(E2E_USERS)) results.push(await ensure(user));

for (const r of results) {
  console.log(`  ${r.created ? "created" : "already present"}  ${r.email}  ${r.id}`);
}

for (const { email, password } of Object.values(E2E_USERS)) {
  const res = await auth.api.signInEmail({ body: { email, password } });
  if (!res?.user?.id) throw new Error(`${email} exists but cannot sign in`);
  console.log(`  sign-in ok    ${email}`);
}

await pool.end();
