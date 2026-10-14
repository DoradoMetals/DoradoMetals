# Frontend conventions

Next.js best practice: a feature's code lives with its page folder. Folders that
start with one underscore are private to routing, so Next never serves them.
Do not add a trailing underscore (`_components_`); `_components` is enough. The
old `_src_` folder is gone.

## Route folder

```
frontend/app/<area>/<route>/
  page.tsx layout.tsx loading.tsx error.tsx   routing files, thin
  _components/   feature components, with an index.ts
  _api/          queries.ts and mutations.ts, with an index.ts
  _lib/          pure helpers and formatters, with an index.ts. Never money.
  tests/         unit tests and *.e2e.ts for this route
```

- `@dorado/components` holds only designed, shared components (a Figma design
  Jacob approved). A component only one route uses stays in that route's
  `_components/`.
- Endpoints, keys and raw hooks stay in `@dorado/client`. `_api/queries.ts` and
  `_api/mutations.ts` compose them: `select`, key choice, invalidation,
  optimistic updates. A route never calls `fetch` or an endpoint.
- Code shared by two routes of one area goes to `app/<area>/_components`,
  `app/<area>/_lib`. Code shared across areas goes to `frontend/shared/<kind>/`
  (`ui hooks utils providers tests`).
- A component lives in the most specific feature folder that holds every one
  of its users (Jacob, 2026-10-14). A spots-only component lives under
  `spots/_components/` even when the metal page under `spots/[metal]` is its
  second user; it rises to the area's `_components/` only when a sibling route
  (rates) uses it too. Nothing feature-specific sits one level up for
  convenience.
- Pages stay thin: read params, render one component from `_components/`.
- Every route has `error.tsx` and `loading.tsx` (ruling 83), or inherits a
  correct one from its area.
- Shapes come from `@dorado/contracts`. The frontend computes no money.

## TanStack Query

- Query keys live in `packages/client/src/keys.ts`, one object, one entry per
  resource: `keys.<resource>.all()` is the invalidation root, then
  `keys.<resource>.<what>(...args)` returns `['<resource>', '<what>', ...args] as const`.
  Invalidate the root to drop a resource, a leaf to drop one read. Never write a
  key array by hand in the app.
- `shared/providers/QueryProvider.tsx` sets: `staleTime` 5 minutes, `retry` twice
  but never on a 4xx `ApiError`, no mutation retry, devtools in development only,
  and one `QueryClient` per provider mount (`useState`).
- `@tanstack/eslint-plugin-query` (`flat/recommended`) runs in `pnpm --filter
  @dorado/frontend lint`.

## Protected routes

Two layers. `frontend/proxy.ts` (Next 16, was middleware) redirects a request with
no better-auth session cookie on `/admin/**` and `/account/**` to
`/auth/sign-in?next=<path+query>`. The cookie names live in one place,
`shared/utils/sessionCookie.ts` (`better-auth.session_token` and its
`__Secure-` form). The proxy checks presence only. `ProtectedPage` in the client
checks the role, because roles need the session body. A new guarded prefix is
added to the proxy `matcher` and to `protectedRoutes` in
`shared/types/routes.ts`.

The proxy sees the cookie only when the API sets it for the frontend's host. The
API sets `AUTH_COOKIE_DOMAIN` (`.doradometals.com` on staging and production) as
better-auth's `crossSubDomainCookies` domain, so `www`/`uat` and the `api`/`uat-api`
hosts share the session cookie. The API refuses to start in production without it.
Leave it unset locally: `localhost` shares cookies across ports.
