import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Signs the two e2e accounts in and saves their session, once, before the rest
// of the suite runs. Playwright reuses the saved state per role, so no other
// spec pays the cost of logging in.
//
// AUTHENTICATED THROUGH THE API, NOT THE FORM, and the reason is worth stating
// because it looks like a shortcut and is not.
//
// The sign-in form runs reCAPTCHA before it submits. Driven headlessly the
// submit never fires at all - no sign-in request is made, so it is not a
// credentials problem, it is the anti-bot check refusing a bot, which is
// exactly its job. Defeating it would mean either disabling it for tests, which
// puts a bypass in the app, or fighting it, which makes every authed test flaky
// for reasons unrelated to this codebase.
//
// So this posts to better-auth's own sign-in endpoint with the real password
// and keeps the real session cookie it returns. That is a genuine session
// issued by the real auth system - nothing is faked and no bypass exists in the
// application. What it skips is the anti-bot step, which protects against
// automation rather than authorising anybody.
//
// WHAT THIS COSTS, so it is not discovered later: the login FORM itself is now
// untested. That needs its own spec, tolerant of reCAPTCHA being unpredictable,
// and it should be the only place that pays that price.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");

export const ROLES = {
  admin: { email: "e2e-admin@example.invalid", password: "e2e-Admin-Password-1" },
  customer: { email: "e2e-customer@example.invalid", password: "e2e-Customer-Password-1" },
} as const;

export const statePath = (role: keyof typeof ROLES) =>
  path.join(process.cwd(), "playwright", ".auth", `${role}.json`);

for (const [role, creds] of Object.entries(ROLES)) {
  setup(`authenticate as ${role}`, async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });

    const res = await api.post(`${API}/auth/sign-in/email`, {
      data: { email: creds.email, password: creds.password },
      headers: { "Content-Type": "application/json" },
    });

    expect(
      res.ok(),
      `sign-in failed for ${creds.email} (${res.status()}). Has the seed been run?\n` +
        `  pnpm --filter @dorado/api seed:e2e`
    ).toBeTruthy();

    const state = await api.storageState();
    expect(
      state.cookies.length,
      "sign-in returned no cookies - there is no session to reuse"
    ).toBeGreaterThan(0);

    // Written under the frontend's own origin so the browser sends them: the
    // cookie comes back scoped to the API host, and the app is served from
    // another port.
    const origin = new URL(baseURL ?? "http://localhost:3000");
    const cookies = state.cookies.map((c) => ({ ...c, domain: origin.hostname, path: "/" }));

    fs.mkdirSync(path.dirname(statePath(role as keyof typeof ROLES)), { recursive: true });
    fs.writeFileSync(
      statePath(role as keyof typeof ROLES),
      JSON.stringify({ cookies, origins: [] }, null, 2)
    );

    await api.dispose();
  });
}
