// Every route the API mounts, and the middleware standing in front of it.
//
// Written because the authorization question is "who can reach this", and that
// is answered by the route table rather than by any single test. A route with
// only a happy-path test proves the handler works and says nothing about the
// guard - which is how get_payout_details, the endpoint that returns plaintext
// bank details, came to have no assertion that it was admin-only (00a0853b).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

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
  for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*express\.Router\(\)/g)) {
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
  const re =
    /(\w+)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\3\s*,([^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, routerVar, verb, , path, rest] = m;
    if (!/[Rr]out/.test(routerVar) && routerVar !== "app") continue;
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
