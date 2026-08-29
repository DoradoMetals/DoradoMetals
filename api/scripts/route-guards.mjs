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
    else if (name === "routes.js" || name === "routes.ts") out.push(p);
  }
  return out;
}

// Where each routes module is mounted, read from app.js rather than assumed -
// the prefix is not derivable from the folder name (features/refiners mounts at
// /api/suppliers, features/media at /api/images, features/checkout at /api/cart).
const appSrc = readFileSync(join(ROOT, "app.js"), "utf8");
const importedAs = new Map();
{
  const re = /import\s+(\w+)\s+from\s+["']#features\/([^"']+)\/routes\.(?:js|ts)["']/g;
  let m;
  // Keyed WITHOUT the extension, on both sides. This line hardcoded `.js`,
  // so the moment routes.js became routes.ts every mount resolved to null
  // and every url with it - silently, because the guard counts read only
  // the middleware names and would have stayed at 132.
  while ((m = re.exec(appSrc))) importedAs.set(m[1], `features/${m[2]}/routes`);
}
const mountOf = new Map();
{
  const re = /app\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g;
  let m;
  while ((m = re.exec(appSrc))) {
    const file = importedAs.get(m[2]);
    if (file) mountOf.set(file, m[1]);
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
    const imports = new Map();
    const ire = /import\s+(\w+)\s+from\s+["']#features\/([^"']+)\/routes\.(?:js|ts)["']/g;
    let m;
    while ((m = ire.exec(src))) imports.set(m[1], `features/${m[2]}/routes`);
    const ure = /router\s*\.\s*use\(\s*["']([^"']*)["']\s*,\s*(\w+)\s*\)/g;
    while ((m = ure.exec(src))) {
      const childKey = imports.get(m[2]);
      if (!childKey) continue;
      const key = relative(ROOT, file).replace(/\.(js|ts)$/, "");
      if (!nested.has(key)) nested.set(key, []);
      nested.get(key).push({ at: m[1], childKey });
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
  // router.<verb>( "<path>" , <middleware list> , <handler> )
  const re = /router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2\s*,([^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, verb, , path, rest] = m;
    const names = rest.split(",").map((s) => s.trim()).filter(Boolean);
    const handler = names[names.length - 1];
    const guards = names.slice(0, -1);
    const rel = relative(ROOT, file);
    const key = rel.replace(/\.(js|ts)$/, "");
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
