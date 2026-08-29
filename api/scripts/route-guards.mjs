// Every route the API mounts, and the middleware standing in front of it.
//
// Written because the authorization question is "who can reach this", and that
// is answered by the route table rather than by any single test. A route with
// only a happy-path test proves the handler works and says nothing about the
// guard - which is how get_payout_details, the endpoint that returns plaintext
// bank details, came to have no assertion that it was admin-only (00a0853b).
//
// AND IT SILENTLY DROPPED SIX ROUTES WHILE EXITING 0 (D120). Three hardcoded
// assumptions, each true of the shape the code happened to have: the exact
// filename `routes.ts`, DEFAULT imports only, and a router variable literally
// named `router`. Any ONE of them made six routes vanish from an AUTHORIZATION
// audit - `DELETE /api/purchase_orders/purge_cancelled` and both
// `create_review` paths among them - while the run reported success.
//
// A test with the IDENTICAL bug (`shared/http/endpoints.test.js`, same
// hardcoded filename) FAILED LOUDLY. Same defect, opposite consequence, because
// one is an ASSERTION and the other is a REPORT: an assertion that cannot see
// its subject fails; a report that cannot see its subject prints a smaller
// number and exits 0 (D135).
//
// So this file now asserts about its own coverage. There is a literal floor,
// and - because a floor alone is blind to PARTIAL breakage - a set of
// KNOWN_ROUTES that must each be present by URL. They are deliberately the very
// routes D120 lost, plus the endpoint that returns plaintext bank details:
// if the census cannot see those, it cannot see anything and must say so.
//
// *** WHAT IT CANNOT SEE. Four assumptions have already been found in this file
// (three by D120, one - the router's NAME - by the guard-hardening pass), so the
// remaining ones are written down rather than waited for: ***
//   - BLANKET MIDDLEWARE. `router.use(requireUser)` with no path guards every
//     route on that router, and this attributes guards PER ROUTE from the
//     handler's own argument list. Such a route would be reported UNGUARDED.
//     Checked at the time of writing: no file does this. The failure would be a
//     false alarm rather than a false clean, which is the safe direction.
//   - A GUARD BEHIND A HELPER: `router.get("/x", ...adminOnly, handler)` or a
//     middleware array built elsewhere. The names in the census are the text at
//     the call site.
//   - A ROUTE REGISTERED IN A LOOP or from a table of paths.
//   - A ROUTE WHOSE PATH IS NOT A LITERAL. The regex requires a quoted path.
//   - WHAT A GUARD ACTUALLY DOES. This is a census of NAMES. That `requireAdmin`
//     is in front of an endpoint is not proof that it checks admin - that is
//     features/authorization/admin-routes.test.js's job, and it consumes this
//     table, which is why a route missing from here is missing from that too.
//
//   pnpm --filter @dorado/api audit:routes
//   node scripts/route-guards.mjs --self-test
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.env.ROUTE_GUARDS_ROOT
  ? process.env.ROUTE_GUARDS_ROOT.replace(/\/?$/, "/")
  : new URL("..", import.meta.url).pathname;

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test.mjs");
  const Q = String.fromCharCode(34);
  // THE FIXTURE IS D120'S OWN SHAPE: a `<x>.routes.ts` file, imported by NAME,
  // declaring TWO routers, one of them named nothing like "router". Each of the
  // four assumptions this file has held at one time or another is exercised by
  // it, and each case below breaks exactly one.
  const app = (mounts) =>
    `import ordersRoutes from ${Q}#features/orders/routes.ts${Q};\n` +
    `import { purchaseOrderRoutes, api } from ${Q}#features/orders/creates.routes.ts${Q};\n` +
    mounts;
  const MOUNTS =
    'app.use("/api/orders", ordersRoutes);\n' +
    'app.use("/api/purchase_orders", purchaseOrderRoutes);\n' +
    'app.use("/api/sales_orders", api);\n';
  const creates = `export const purchaseOrderRoutes = express.Router();
export const api = express.Router();
purchaseOrderRoutes.delete("/purge_cancelled", requireAdmin, purge);
purchaseOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createReview);
api.post("/create_review", requireUser, requireOwnOrder, createReview);
`;
  const base = (over = {}) => ({
    "app.js": app(MOUNTS),
    "features/orders/routes.ts":
      "const router = express.Router();\nrouter.get(\"/\", requireUser, list);\nexport default router;\n",
    "features/orders/creates.routes.ts": creates,
    ...over,
  });
  const CONTROLS = JSON.stringify({
    "DELETE /api/purchase_orders/purge_cancelled": "requireAdmin",
    "POST /api/purchase_orders/create_review": "requireUser",
    "POST /api/sales_orders/create_review": "requireUser",
  });
  const env = { ROUTE_GUARDS_FLOOR: "4", ROUTE_GUARDS_CONTROLS: CONTROLS };
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "all four assumptions at once: .routes.ts, named import, two routers, a router called `api`",
        rootEnv: "ROUTE_GUARDS_ROOT", env,
        files: base(), expect: "pass", mustPrint: "4 route(s)",
      },
      {
        name: "a `<x>.routes.ts` file going unscanned is caught by the controls (D120 assumption 1)",
        // Floor deliberately at 1 so the CONTROLS are the only thing that can
        // fire. With the floor at 4 this case passed on the floor instead, and
        // would have proved nothing about partial breakage - which is the exact
        // failure a floor alone cannot see.
        rootEnv: "ROUTE_GUARDS_ROOT",
        env: { ROUTE_GUARDS_FLOOR: "1", ROUTE_GUARDS_CONTROLS: CONTROLS },
        files: (() => { const f = base(); f["features/orders/creates.ts"] = f["features/orders/creates.routes.ts"]; delete f["features/orders/creates.routes.ts"]; return f; })(),
        expect: "fail", mustPrint: "not in the census at all",
      },
      {
        name: "an unresolvable app.use is a failure, not a skip (D120 assumption 2)",
        rootEnv: "ROUTE_GUARDS_ROOT", env,
        files: base({ "app.js": app(MOUNTS + 'app.use("/api/ghost", mysteryRouter);\n') }),
        expect: "fail", mustPrint: "could not be resolved to a routes file",
      },
      {
        name: "a router named nothing like `router` still contributes (D120 assumption 3, generalised)",
        rootEnv: "ROUTE_GUARDS_ROOT",
        env: { ROUTE_GUARDS_FLOOR: "4", ROUTE_GUARDS_CONTROLS: JSON.stringify({ "POST /api/sales_orders/create_review": "requireUser" }) },
        files: base(), expect: "pass", mustPrint: "4 route(s)",
      },
      {
        name: "the route floor fires when the census shrinks",
        rootEnv: "ROUTE_GUARDS_ROOT",
        env: { ROUTE_GUARDS_FLOOR: "999", ROUTE_GUARDS_CONTROLS: CONTROLS },
        files: base(), expect: "fail", mustPrint: "not that the API shrank",
      },
      {
        name: "a control present but with its guard unparsed still fails",
        rootEnv: "ROUTE_GUARDS_ROOT",
        env: { ROUTE_GUARDS_FLOOR: "4", ROUTE_GUARDS_CONTROLS: JSON.stringify({ "DELETE /api/purchase_orders/purge_cancelled": "requireUser" }) },
        files: base(), expect: "fail", mustPrint: "guard was not parsed",
      },
      {
        name: "a missing app.js is a broken scan, not an empty API",
        rootEnv: "ROUTE_GUARDS_ROOT", env,
        files: { "features/orders/routes.ts": "const router = express.Router();\n" },
        expect: "fail", mustPrint: "the scan is broken",
      },
    ],
  });
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    // `routes.ts` AND `<something>.routes.ts`. Wave 5A dissolved
    // features/purchase-orders and features/sales-orders into features/orders,
    // and the two legacy create namespaces they mounted became
    // features/orders/creates.routes.ts - one file declaring TWO routers,
    // because /api/purchase_orders and /api/sales_orders are two mounts and
    // ruling 13 says a URL does not move when a file does. This walk matched
    // the exact filename `routes.ts` only, so that file was not scanned at
    // all: six routes left the security census and the exit code stayed 0.
    // Third time this class of silence has been recorded here.
    else if (/(^|\.)routes\.(js|ts)$/.test(name)) out.push(p);
  }
  return out;
}

// Where each routes module is mounted, read from app.js rather than assumed -
// the prefix is not derivable from the folder name (features/refiners mounts at
// /api/suppliers, features/media at /api/images, features/checkout at /api/cart).
if (!existsSync(join(ROOT, "app.js")) || !existsSync(join(ROOT, "features"))) {
  console.error(
    `route-guards cannot read ${join(ROOT, "app.js")} or ${join(ROOT, "features")} - ` +
      `the scan is broken, and a census that cannot open the app must not report one`
  );
  process.exit(2);
}
const appSrc = readFileSync(join(ROOT, "app.js"), "utf8");
//
// KEYED WITHOUT THE EXTENSION, on both sides. This once hardcoded `.js`, so
// the moment routes.js became routes.ts every mount resolved to null and every
// url with it - silently, because the guard counts read only the middleware
// names and would have stayed at 132.
//
// A key is `<file-without-extension>` for a DEFAULT export and
// `<file-without-extension>::<name>` for a NAMED one. A file may declare more
// than one router - see creates.routes.ts - so the file alone is not the unit.
const importedAs = new Map();
const routerImports = (src) => {
  const out = new Map();
  const def = /import\s+(\w+)\s+from\s+["']#features\/([^"']+?)\.(?:js|ts)["']/g;
  let m;
  while ((m = def.exec(src))) {
    if (/(^|\/)routes$/.test(m[2])) out.set(m[1], `features/${m[2]}`);
  }
  const named = /import\s+\{([^}]+)\}\s+from\s+["']#features\/([^"']+?)\.(?:js|ts)["']/g;
  while ((m = named.exec(src))) {
    if (!/routes$/.test(m[2])) continue;
    for (const raw of m[1].split(",")) {
      const parts = raw.trim().split(/\s+as\s+/);
      const exported = parts[0].trim();
      const local = (parts[1] ?? parts[0]).trim();
      if (exported) out.set(local, `features/${m[2]}::${exported}`);
    }
  }
  return out;
};
for (const [local, key] of routerImports(appSrc)) importedAs.set(local, key);
// Which key a router VARIABLE in a file answers to. A file with one router
// exports it as default and answers to the file key; a file with several
// exports them by name and each answers to `<file>::<name>`.
const exportedRouterNames = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*express\.Router\(/g)) {
    out.add(m[1]);
  }
  return out;
};

// EVERY identifier in a file that IS a router, declared or exported. The route
// scan below used to decide this by NAME - `/[Rr]out/.test(varName)` - which is
// the same class of hardcoded assumption as the three D120 found, just one
// nobody had tripped yet: a router called `api`, or `r`, contributes nothing and
// says nothing. Read it from the assignment instead, so the census depends on
// what the code IS rather than on what it happens to be called.
const routerVarsIn = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*express\.Router\(/g)) {
    out.add(m[1]);
  }
  return out;
};
const routerKey = (fileKey, src, varName) =>
  exportedRouterNames(src).has(varName) ? `${fileKey}::${varName}` : fileKey;

const mountOf = new Map();
const unresolvedMounts = [];
{
  const re = /app\.use\(\s*["'](\/api[^"']*)["']\s*,\s*(\w+)\s*\)/g;
  let m;
  while ((m = re.exec(appSrc))) {
    const file = importedAs.get(m[2]);
    // A MOUNT THAT CANNOT BE RESOLVED IS A FAILURE, NOT A SKIP. This used to
    // be `if (file)` and nothing else: an app.use whose identifier did not
    // match the import regex simply vanished, taking its routes out of the
    // census with no message and no non-zero exit. That is how a named-export
    // router removed six routes from a security audit unnoticed.
    if (file) mountOf.set(file, m[1]);
    else unresolvedMounts.push(`${m[1]} -> ${m[2]}`);
  }
}

// NESTED MOUNTS, resolved transitively (ruling 26c). A parent's routes.ts now
// MOUNTS its children rather than declaring their paths -
// features/orders/routes.ts does `router.use("/", itemRoutes)` and
// features/fulfillments/routes.ts does `router.use("/methods", methodRoutes)` -
// so a child's prefix is the parent's mount plus the segment the parent mounted
// it at, and it is not in app.js at all.
//
// WITHOUT THIS every child router resolved to `mount: null` and `url: null`,
// exactly the silent-null failure this file already records once (the .js/.ts
// rename). The guards were still reported, so the count stayed right and the
// URLs quietly went missing - which is the failure mode worth naming twice.
{
  const routeFiles = walk(join(ROOT, "features"));
  // file key -> [{ at, childKey }]
  const nested = new Map();
  for (const file of routeFiles) {
    const src = readFileSync(file, "utf8");
    const imports = routerImports(src);
    let m;
    const ure = /(\w+)\s*\.\s*use\(\s*["']([^"']*)["']\s*,\s*(\w+)\s*\)/g;
    while ((m = ure.exec(src))) {
      const childKey = imports.get(m[3]);
      if (!childKey) continue;
      const key = routerKey(relative(ROOT, file).replace(/\.(js|ts)$/, ""), src, m[1]);
      if (!nested.has(key)) nested.set(key, []);
      nested.get(key).push({ at: m[2], childKey });
    }
  }
  // Fixpoint, so a child of a child resolves too. Bounded by the number of
  // edges: nothing can gain a mount twice, so this terminates.
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    for (const [parentKey, children] of nested) {
      const parentMount = mountOf.get(parentKey);
      if (parentMount === undefined) continue;
      for (const { at, childKey } of children) {
        if (mountOf.has(childKey)) continue;
        mountOf.set(
          childKey,
          `${parentMount}${at}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1")
        );
        changed = true;
      }
    }
  }
}

const routes = [];
for (const file of walk(join(ROOT, "features"))) {
  const src = readFileSync(file, "utf8");
  // <router>.<verb>( "<path>" , <middleware list> , <handler> )
  //
  // The router variable used to be hardcoded as the literal name `router`,
  // which is fine while every file declares exactly one - and silently drops
  // every route in a file that declares two, which creates.routes.ts does.
  const routerVars = routerVarsIn(src);
  const re =
    /(\w+)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\3\s*,([^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, routerVar, verb, , path, rest] = m;
    if (!routerVars.has(routerVar) && routerVar !== "app") continue;
    const names = rest.split(",").map((s) => s.trim()).filter(Boolean);
    const handler = names[names.length - 1];
    const guards = names.slice(0, -1);
    const rel = relative(ROOT, file);
    const key = routerKey(rel.replace(/\.(js|ts)$/, ""), src, routerVar);
    routes.push({
      file: rel,
      mount: mountOf.get(key) ?? null,
      // The trailing-slash trim exists for root-path routes: GET "/" on a
      // router mounted at /api/orders is /api/orders, not /api/orders/ -
      // Express treats them alike, and the frontend spells the former.
      url: mountOf.has(key)
        ? (mountOf.get(key) + path).replace(/\/+/g, "/").replace(/(.)\/$/, "$1")
        : null,
      verb: verb.toUpperCase(),
      path,
      guards,
      handler,
    });
  }
}

const admin = routes.filter((r) => r.guards.some((g) => /requireAdmin/.test(g)));
const user = routes.filter(
  (r) => r.guards.some((g) => /requireUser/.test(g)) && !r.guards.some((g) => /requireAdmin/.test(g))
);
const open = routes.filter((r) => !r.guards.length);

export const allRoutes = routes;
export const adminRoutes = admin;

// Quiet when imported - features/authorization/admin-routes.test.js consumes
// the table, and a test suite should not have a scanner's output in it.
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  if (!routes.length) {
    console.error("route-guards resolved no routes at all - the scan is not working");
    process.exit(2);
  }

  // THE FLOOR. 125 routes today. A census is a security instrument; a smaller
  // number is a broken walk until proven otherwise, and proving otherwise means
  // lowering this on the same commit that deletes the routes.
  const ROUTE_FLOOR = Number(process.env.ROUTE_GUARDS_FLOOR ?? 115);
  if (routes.length < ROUTE_FLOOR) {
    console.error(
      `route-guards found ${routes.length} route(s), expected at least ${ROUTE_FLOOR}. ` +
        `Six routes once left this census without a word; a count that falls means ` +
        `the parser stopped understanding an idiom, not that the API shrank.`
    );
    process.exit(2);
  }

  // KNOWN-PRESENT CONTROLS, because a floor is blind to partial breakage - and
  // the breakage that happened WAS partial. These are the routes D120 actually
  // lost, plus the bank-details endpoint this file was written for. Each is
  // pinned by URL AND by the guard it must carry, so a route surviving the
  // census with its middleware unparsed is caught too.
  const KNOWN_ROUTES = process.env.ROUTE_GUARDS_CONTROLS
    ? JSON.parse(process.env.ROUTE_GUARDS_CONTROLS)
    : {
        "DELETE /api/purchase_orders/purge_cancelled": "requireAdmin",
        "POST /api/purchase_orders/create_review": "requireUser",
        "POST /api/sales_orders/create_review": "requireUser",
        "GET /api/payouts/:id/details": "requireAdmin",
      };
  const byUrl = new Map(routes.filter((r) => r.url).map((r) => [`${r.verb} ${r.url}`, r]));
  const missing = [];
  for (const [key, guard] of Object.entries(KNOWN_ROUTES)) {
    const r = byUrl.get(key);
    if (!r) missing.push(`${key} - not in the census at all`);
    else if (!r.guards.some((g) => new RegExp(guard).test(g)))
      missing.push(`${key} - present, but its ${guard} guard was not parsed (saw: ${r.guards.join(",") || "none"})`);
  }
  if (missing.length) {
    console.error(
      `\n${missing.length} known-present control route(s) are missing from the census:`
    );
    for (const m of missing) console.error(`  x ${m}`);
    console.error(
      "These are the routes that once vanished silently. If one was genuinely " +
        "removed, take it out of KNOWN_ROUTES deliberately, in the commit that " +
        "removes it."
    );
    process.exit(2);
  }

  if (unresolvedMounts.length) {
    console.error(
      `\n${unresolvedMounts.length} app.use mount(s) could not be resolved to a routes file:`
    );
    for (const u of unresolvedMounts) console.error(`  ✖ ${u}`);
    console.error(
      "Every route behind an unresolved mount is MISSING from this census, " +
        "which is a security audit. Fix the import parsing or the mount."
    );
    process.exit(2);
  }

  const unmounted = routes.filter((r) => !r.url);
  if (unmounted.length) {
    console.log(`${unmounted.length} route(s) whose mount could not be resolved:`);
    for (const r of unmounted) console.log(`  ${r.verb} ${r.path}  ${r.file}`);
  }

  console.log(
    `${routes.length} route(s): ${admin.length} requireAdmin, ${user.length} requireUser, ${open.length} unguarded`
  );

  if (process.argv.includes("--list")) {
    for (const group of [["ADMIN", admin], ["USER", user], ["UNGUARDED", open]]) {
      console.log(`\n== ${group[0]} ==`);
      for (const r of group[1])
        console.log(`  ${r.verb.padEnd(6)} ${(r.url ?? r.path).padEnd(46)} ${r.guards.join(",") || "-"}`);
    }
  }
}
