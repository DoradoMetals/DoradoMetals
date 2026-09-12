import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { domainDirs, sourceRoot, wildcardRoots } from './lib/layout.ts'

const API_ROOT = process.env.ROUTE_GUARDS_ROOT
  ? process.env.ROUTE_GUARDS_ROOT.replace(/\/?$/, '/')
  : new URL('..', import.meta.url).pathname
const ROOT = sourceRoot(API_ROOT)

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const Q = String.fromCharCode(34)
  const app = (mounts: string) =>
    `import ordersRoutes from ${Q}#orders/routes.ts${Q};\n` +
    `import { purchaseOrderRoutes, api } from ${Q}#orders/creates.routes.ts${Q};\n` +
    mounts
  const MOUNTS =
    'app.use("/api/orders", ordersRoutes);\n' +
    'app.use("/api/purchase_orders", purchaseOrderRoutes);\n' +
    'app.use("/api/sales_orders", api);\n'
  const creates = `export const purchaseOrderRoutes = express.Router();
export const api = express.Router();
purchaseOrderRoutes.delete("/purge_cancelled", requireAdmin, purge);
purchaseOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createReview);
api.post("/create_review", requireUser, requireOwnOrder, createReview);
`
  const manifest = { 'package.json': JSON.stringify({ imports: { '#orders/*': './orders/*' } }) }
  const base = (over: Record<string, string> = {}): Record<string, string> => ({
    ...manifest,
    'app.ts': app(MOUNTS),
    'orders/routes.ts':
      'const router = express.Router();\nrouter.get("/", requireUser, list);\nexport default router;\n',
    'orders/creates.routes.ts': creates,
    ...over,
  })
  const CONTROLS = JSON.stringify({
    'DELETE /api/purchase_orders/purge_cancelled': 'requireAdmin',
    'POST /api/purchase_orders/create_review': 'requireUser',
    'POST /api/sales_orders/create_review': 'requireUser',
  })
  const env = { ROUTE_GUARDS_FLOOR: '4', ROUTE_GUARDS_CONTROLS: CONTROLS }
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: 'all four assumptions at once: .routes.ts, named import, two routers, a router called `api`',
        rootEnv: 'ROUTE_GUARDS_ROOT',
        env,
        files: base(),
        expect: 'pass',
        mustPrint: '4 route(s)',
      },
      {
        name: 'a `<x>.routes.ts` file going unscanned is caught by the controls (D120 assumption 1)',
        rootEnv: 'ROUTE_GUARDS_ROOT',
        env: { ROUTE_GUARDS_FLOOR: '1', ROUTE_GUARDS_CONTROLS: CONTROLS },
        files: (() => {
          const f = base()
          f['orders/creates.ts'] = f['orders/creates.routes.ts']
          delete f['orders/creates.routes.ts']
          return f
        })(),
        expect: 'fail',
        mustPrint: 'not in the census at all',
      },
      {
        name: 'an unresolvable app.use is a failure, not a skip (D120 assumption 2)',
        rootEnv: 'ROUTE_GUARDS_ROOT',
        env,
        files: base({ 'app.ts': app(MOUNTS + 'app.use("/api/ghost", mysteryRouter);\n') }),
        expect: 'fail',
        mustPrint: 'could not be resolved to a routes file',
      },
      {
        name: 'a router named nothing like `router` still contributes (D120 assumption 3, generalised)',
        rootEnv: 'ROUTE_GUARDS_ROOT',
        env: {
          ROUTE_GUARDS_FLOOR: '4',
          ROUTE_GUARDS_CONTROLS: JSON.stringify({
            'POST /api/sales_orders/create_review': 'requireUser',
          }),
        },
        files: base(),
        expect: 'pass',
        mustPrint: '4 route(s)',
      },
      {
        name: 'the route floor fires when the census shrinks',
        rootEnv: 'ROUTE_GUARDS_ROOT',
        env: { ROUTE_GUARDS_FLOOR: '999', ROUTE_GUARDS_CONTROLS: CONTROLS },
        files: base(),
        expect: 'fail',
        mustPrint: 'not that the API shrank',
      },
      {
        name: 'a control present but with its guard unparsed still fails',
        rootEnv: 'ROUTE_GUARDS_ROOT',
        env: {
          ROUTE_GUARDS_FLOOR: '4',
          ROUTE_GUARDS_CONTROLS: JSON.stringify({
            'DELETE /api/purchase_orders/purge_cancelled': 'requireUser',
          }),
        },
        files: base(),
        expect: 'fail',
        mustPrint: 'guard was not parsed',
      },
      {
        name: 'a missing app.ts is a broken scan, not an empty API',
        rootEnv: 'ROUTE_GUARDS_ROOT',
        env,
        files: { ...manifest, 'orders/routes.ts': 'const router = express.Router();\n' },
        expect: 'fail',
        mustPrint: 'the scan is broken',
      },
    ],
  })
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/(^|\.)routes\.(js|ts)$/.test(name)) out.push(p)
  }
  return out
}

const DOMAINS = domainDirs(API_ROOT)
const ALIAS = wildcardRoots(API_ROOT)
const DOMAIN_DIRS = DOMAINS.map((d) => join(ROOT, d)).filter((d) => existsSync(d))
if (!existsSync(join(ROOT, 'app.ts')) || !DOMAIN_DIRS.length) {
  console.error(
    `route-guards cannot read ${join(ROOT, 'app.ts')} or any of ${DOMAINS.join(', ')} - ` +
      `the scan is broken, and a census that cannot open the app must not report one`
  )
  process.exit(2)
}
const routeFilesOf = () => DOMAIN_DIRS.flatMap((d) => walk(d))
const appSrc = readFileSync(join(ROOT, 'app.ts'), 'utf8')
const importedAs = new Map<string, string>()
const routerImports = (src: string): Map<string, string> => {
  const out = new Map<string, string>()
  const def = /import\s+(\w+)\s+from\s+["']#([^/"']+)\/([^"']+?)\.(?:js|ts)["']/g
  let m
  while ((m = def.exec(src))) {
    const dir = ALIAS[m[2]]
    if (!dir || !DOMAINS.includes(dir)) continue
    if (/(^|[\/.])routes$/.test(m[3])) out.set(m[1], `${dir}/${m[3]}`)
  }
  const named = /import\s+\{([^}]+)\}\s+from\s+["']#([^/"']+)\/([^"']+?)\.(?:js|ts)["']/g
  while ((m = named.exec(src))) {
    const dir = ALIAS[m[2]]
    if (!dir || !DOMAINS.includes(dir) || !/routes$/.test(m[3])) continue
    for (const raw of m[1].split(',')) {
      const parts = raw.trim().split(/\s+as\s+/)
      const exported = parts[0].trim()
      const local = (parts[1] ?? parts[0]).trim()
      if (exported) out.set(local, `${dir}/${m[3]}::${exported}`)
    }
  }
  return out
}
for (const [local, key] of routerImports(appSrc)) importedAs.set(local, key)
const exportedRouterNames = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*express\.Router\(/g)) {
    out.add(m[1])
  }
  return out
}

const routerVarsIn = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const m of src.matchAll(
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*express\.Router\(/g
  )) {
    out.add(m[1])
  }
  return out
}
const routerKey = (fileKey: string, src: string, varName: string) =>
  exportedRouterNames(src).has(varName) ? `${fileKey}::${varName}` : fileKey

const mountOf = new Map<string, string>()
const unresolvedMounts: string[] = []
{
  const re = /app\.use\(\s*["'](\/api[^"']*)["']\s*,\s*(\w+)\s*\)/g
  let m
  while ((m = re.exec(appSrc))) {
    const file = importedAs.get(m[2])
    if (file) mountOf.set(file, m[1])
    else unresolvedMounts.push(`${m[1]} -> ${m[2]}`)
  }
}

{
  const routeFiles = routeFilesOf()
  const nested = new Map<string, { at: string; childKey: string }[]>()
  for (const file of routeFiles) {
    const src = readFileSync(file, 'utf8')
    const imports = routerImports(src)
    let m
    const ure = /(\w+)\s*\.\s*use\(\s*["']([^"']*)["']\s*,\s*(\w+)\s*\)/g
    while ((m = ure.exec(src))) {
      const childKey = imports.get(m[3])
      if (!childKey) continue
      const key = routerKey(relative(ROOT, file).replace(/\.(js|ts)$/, ''), src, m[1])
      if (!nested.has(key)) nested.set(key, [])
      nested.get(key)!.push({ at: m[2], childKey })
    }
  }
  let changed = true
  let guard = 0
  while (changed && guard++ < 20) {
    changed = false
    for (const [parentKey, children] of nested) {
      const parentMount = mountOf.get(parentKey)
      if (parentMount === undefined) continue
      for (const { at, childKey } of children) {
        if (mountOf.has(childKey)) continue
        mountOf.set(childKey, `${parentMount}${at}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1'))
        changed = true
      }
    }
  }
}

export type Route = {
  file: string
  mount: string | null
  url: string | null
  verb: string
  path: string
  guards: string[]
  handler: string
}

const routes: Route[] = []
for (const file of routeFilesOf()) {
  const src = readFileSync(file, 'utf8')
  const routerVars = routerVarsIn(src)
  const re = /(\w+)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\3\s*,([^)]*)\)/g
  let m
  while ((m = re.exec(src))) {
    const [, routerVar, verb, , path, rest] = m
    if (!routerVars.has(routerVar) && routerVar !== 'app') continue
    const names = rest
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const handler = names[names.length - 1]
    const guards = names.slice(0, -1)
    const rel = relative(ROOT, file)
    const key = routerKey(rel.replace(/\.(js|ts)$/, ''), src, routerVar)
    routes.push({
      file: rel,
      mount: mountOf.get(key) ?? null,
      url: mountOf.has(key)
        ? (mountOf.get(key) + path).replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
        : null,
      verb: verb.toUpperCase(),
      path,
      guards,
      handler,
    })
  }
}

const admin = routes.filter((r) => r.guards.some((g) => /requireAdmin/.test(g)))
const user = routes.filter(
  (r) =>
    r.guards.some((g) => /requireUser/.test(g)) && !r.guards.some((g) => /requireAdmin/.test(g))
)
const open = routes.filter((r) => !r.guards.length)

export const allRoutes = routes
export const adminRoutes = admin

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '\0')
if (isMain) {
  if (!routes.length) {
    console.error('route-guards resolved no routes at all - the scan is not working')
    process.exit(2)
  }

  const ROUTE_FLOOR = Number(process.env.ROUTE_GUARDS_FLOOR ?? 115)
  if (routes.length < ROUTE_FLOOR) {
    console.error(
      `route-guards found ${routes.length} route(s), expected at least ${ROUTE_FLOOR}. ` +
        `Six routes once left this census without a word; a count that falls means ` +
        `the parser stopped understanding an idiom, not that the API shrank.`
    )
    process.exit(2)
  }

  const KNOWN_ROUTES: Record<string, string> = process.env.ROUTE_GUARDS_CONTROLS
    ? JSON.parse(process.env.ROUTE_GUARDS_CONTROLS)
    : {
        'POST /api/orders': 'requireUser',
        'POST /api/orders/admin': 'requireAdmin',
        'GET /api/payments/details/:id/bank': 'requireAdmin',
        'GET /api/sms': 'requireAdmin',
        'GET /api/sms/:id': 'requireAdmin',
        'POST /api/calls/token': 'requireAdmin',
        'POST /api/calls/presence': 'requireAdmin',
        'GET /api/calls/:id': 'requireAdmin',
        'GET /api/customers/:id/timeline': 'requireAdmin',
      }
  const byUrl = new Map(routes.filter((r) => r.url).map((r) => [`${r.verb} ${r.url}`, r]))
  const missing: string[] = []
  for (const [key, guard] of Object.entries(KNOWN_ROUTES)) {
    const r = byUrl.get(key)
    if (!r) missing.push(`${key} - not in the census at all`)
    else if (!r.guards.some((g) => new RegExp(guard).test(g)))
      missing.push(
        `${key} - present, but its ${guard} guard was not parsed (saw: ${r.guards.join(',') || 'none'})`
      )
  }
  if (missing.length) {
    console.error(`\n${missing.length} known-present control route(s) are missing from the census:`)
    for (const m of missing) console.error(`  x ${m}`)
    console.error(
      'These are the routes that once vanished silently. If one was genuinely ' +
        'removed, take it out of KNOWN_ROUTES deliberately, in the commit that ' +
        'removes it.'
    )
    process.exit(2)
  }

  if (unresolvedMounts.length) {
    console.error(
      `\n${unresolvedMounts.length} app.use mount(s) could not be resolved to a routes file:`
    )
    for (const u of unresolvedMounts) console.error(`  ✖ ${u}`)
    console.error(
      'Every route behind an unresolved mount is MISSING from this census, ' +
        'which is a security audit. Fix the import parsing or the mount.'
    )
    process.exit(2)
  }

  const unmounted = routes.filter((r) => !r.url)
  if (unmounted.length) {
    console.log(`${unmounted.length} route(s) whose mount could not be resolved:`)
    for (const r of unmounted) console.log(`  ${r.verb} ${r.path}  ${r.file}`)
  }

  console.log(
    `${routes.length} route(s): ${admin.length} requireAdmin, ${user.length} requireUser, ${open.length} unguarded`
  )

  if (process.argv.includes('--list')) {
    const groups: [string, Route[]][] = [
      ['ADMIN', admin],
      ['USER', user],
      ['UNGUARDED', open],
    ]
    for (const group of groups) {
      console.log(`\n== ${group[0]} ==`)
      for (const r of group[1])
        console.log(
          `  ${r.verb.padEnd(6)} ${(r.url ?? r.path).padEnd(46)} ${r.guards.join(',') || '-'}`
        )
    }
  }
}
