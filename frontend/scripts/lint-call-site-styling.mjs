// Appearance classes on shared-component call sites, which is Jacob's rule
// made checkable: "the only tailwind that should REALLY live in consuming
// components is layout like flex/grid padding/margins etc etc."
//
// He said it three times in one session, each time more generally - about one
// Button, then about Button as a component, then about every shared component -
// which is what a rule looks like just before it decays. A rule nothing checks
// survives exactly as long as nobody is in a hurry.
//
// WHAT IT LOOKS FOR. A call site of a component imported from shared/ui that
// passes a className containing APPEARANCE: colour, type size, weight, border,
// radius, shadow, opacity, transition, or a hover:/focus: spelling of any of
// them. Layout is fine and always was - flex/grid, gap, margins, width/height,
// position, alignment - because the parent legitimately decides an element's
// extent. Jacob's own example of the allowed case: "if we need it to stretch
// the full length of a drawer or parent or some shit."
//
// THE TWO CLUSTERS ARE REPORTED SEPARATELY, because they mean different things
// and imply different fixes:
//
//   CONTRADICTED - the element passes `variant=X` AND overrides appearance.
//     <Button variant="secondary" className="bg-primary text-primary-foreground">
//     It asks for one variant and paints itself another, so the prop is
//     decorative and no reader can tell what it looks like without resolving the
//     cascade. Either the author wanted a variant that does not exist, or the
//     one they named is wrong. Highest signal in the codebase.
//
//   OVER-SPECIFIED - appearance classes with no variant prop, including the
//     tell-tale self-cancelling hover (`bg-primary hover:bg-primary`), which
//     nobody writes unless the variant's hover state is broken.
//
// PADDING IS DELIBERATELY NOT FLAGGED, and that is a judgement call worth
// knowing about. For a component with SIZE variants, padding is the size's job
// (`px-10` means "this button is wide"), so a padding override is usually a
// missing size. But padding is also genuine layout on a plain container, and
// this script cannot tell which component has sizes without reading each one.
// Flagging it would bury the real findings in noise. See ruling 20 in
// FOLLOWUPS.md - the size matrix is where padding gets fixed.
//
// NOT IN `pnpm check` YET, and exits non-zero by design while the sweep is
// outstanding: the styling inventory measured 422 appearance overrides across
// shared/ui call sites, so gating today would paint the gate red for a known
// thing and train everyone to ignore it. Same reasoning that keeps
// audit:enum-domains out. Add it to the chain when the sweep lands and it will
// hold the line that Jacob otherwise has to restate every few months.
//
//   node scripts/lint-call-site-styling.mjs [--self-test] [--json]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// Appearance: the component's or the theme's business, never the caller's.
// Ordered most-specific-first so `text-sm` is read as type size while
// `text-left` is read as alignment (which is layout, and 239 of them exist -
// a naive `text-` rule would flag every one).
const TYPE_SIZES = /^(text|font)-(xs|sm|base|lg|xl|[2-9]xl|display|h[1-6]|body|small|micro|thin|light|normal|medium|semibold|bold|black|mono|sans|serif)$/;
const APPEARANCE = [
  /^bg-/, /^border(-|$)/, /^rounded(-|$)/, /^shadow(-|$)/, /^opacity-/,
  /^transition(-|$)/, /^ring(-|$)/, /^outline-/, /^fill-/, /^stroke-/,
  /^backdrop-/, /^divide-/, /^from-/, /^via-/, /^to-/, /^gradient/,
  // project-local decoration on death row (ruling 16)
  /^glass/, /^on-glass/, /^raised-off-page$/, /^recessed/, /^shine/,
];
// text-<colour>: any text- that is not a size, not an alignment, not a
// wrapping/transform utility. Colour tokens are the tail of this list.
const TEXT_LAYOUT = /^text-(left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/;

function classifies(token) {
  // strip variant prefixes (hover:, focus:, sm:, dark:, group-hover:) but
  // REMEMBER whether a state prefix was present - a hover: appearance class is
  // the component's job by name, per Jacob: "Even things like hover:{text} need
  // to live on the variant at the shared component level."
  // Strip the syntax that survives splitting a cn() argument list on
  // whitespace - quotes, commas, backticks - BEFORE classifying. Without this,
  // `text-center'` failed the alignment test and was reported as a colour.
  const cleaned = token.replace(/^[`'",]+|[`'",]+$/g, "");
  const bare = cleaned.replace(/^(?:[a-z-]+:)+/, "");
  if (!bare || bare.startsWith("[")) return null;
  if (TEXT_LAYOUT.test(bare)) return null;
  if (TYPE_SIZES.test(bare)) return "type";
  if (bare.startsWith("text-")) return "colour";
  for (const re of APPEARANCE) if (re.test(bare)) return "appearance";
  return null;
}

// EVERY CLASS STRING A className CARRIES, WHATEVER SPELLING IT ARRIVES IN.
//
// WHY THIS EXISTS, and it is the sharpest finding of the guard-hardening pass.
// `--scatter` used to match two spellings only:
//
//     className="text-sm"          and          className={`text-${n}`}
//
// The tree has 205 call sites spelled `className={cn('text-sm', ...)}` and NOT
// ONE OF THEM WAS EVER READ. So the scan reported 0 type-size utilities across
// 263 files, and that zero was quoted in a commit message as evidence the
// typography sweep was finished. It meant "zero of the ones I can see".
//
// That is D95's lesson and D135's in one instrument: a detector's blind spot
// reports as CLEAN, and a report that cannot see part of its subject prints a
// smaller number and exits 0. The sibling default mode had already handled
// `{cn(...)}` for the same reason - the machinery was in this very file and
// --scatter did not use it.
//
// HOW IT READS THEM NOW: take the whole balanced `{...}` expression after
// `className=`, then pull every STRING LITERAL out of it. That covers cn(),
// clsx(), ternaries, nested calls, template literals and any combination -
// because the class names are always literals somewhere inside, whatever
// function is arranging them.
//
// *** WHAT IT STILL CANNOT SEE, stated here because a blind spot nobody wrote
// down is a blind spot that reports as clean: ***
//   - A CLASS STRING HELD IN A VARIABLE OR IMPORTED: `className={styles.head}`,
//     `const heading = "text-lg"` used elsewhere, or a cva()/tv() variant map
//     defined at module scope. The literal is real but it is not inside the
//     className expression, so nothing here attributes it to a call site.
//     Arbitrary sizes (`text-[10px]`) are exempt from this gap: they are matched
//     against the WHOLE file, not just className expressions.
//   - A CLASS NAME ASSEMBLED FROM FRAGMENTS: `text-${size}` yields no literal
//     token to classify, and `"text-" + size` yields "text-" alone.
//   - ANYTHING OUTSIDE .tsx. Class strings in .ts helpers are not walked.
// Each of those is a real occurrence this number does not include. The count is
// a floor on the scatter, never a proof of zero.
function classNameExpressions(src) {
  const out = [];
  const re = /\bclassName=/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    if (src[i] === '"' || src[i] === "'") {
      const quote = src[i];
      const end = src.indexOf(quote, i + 1);
      if (end === -1) continue;
      out.push(src.slice(i + 1, end));
      continue;
    }
    if (src[i] !== "{") continue;
    // Balanced braces, so a nested object or a second cn() does not truncate it.
    let depth = 0;
    const start = i;
    for (; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(start + 1, i));
  }
  return out;
}

// The class tokens inside one className expression. A bare attribute value is
// itself the class list; an expression is mined for its string literals.
function classTokens(expr) {
  const literals = [...expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? ""
  );
  const source = literals.length ? literals.join(" ") : expr;
  return source.split(/\s+/).filter(Boolean);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "test-results" || e.startsWith(".")) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// Component names imported from shared/ui in a given file. Only those are call
// sites we can hold to the rule - a local <div> is not a shared component.
function sharedImports(src) {
  const names = new Set();
  // `(\w+)\s*,` USED TO REQUIRE THE COMMA, so a plain default import
  // (`import Drawer from '...'`) was never scanned and its call sites were
  // never flagged anywhere in the tree - found by the P1 sweep agent, and a
  // reminder that a detector's blind spot reports as clean code (see D95).
  const re = /import\s+(?:(\w+)\s*(?:,\s*)?)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]*shared\/ui[^'"]*)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) names.add(m[1]);
    if (m[2]) for (const part of m[2].split(",")) {
      const n = part.split(" as ").pop().trim();
      if (n) names.add(n);
    }
  }
  return names;
}

// Elements of those components, with their attribute blob. Deliberately simple:
// this is a lint, and a miss is better than a false alarm nobody trusts.
function elements(src, names) {
  const found = [];
  for (const name of names) {
    const re = new RegExp(`<${name}(\\s[^>]*?)/?>`, "gs");
    let m;
    while ((m = re.exec(src))) {
      const attrs = m[1];
      const line = src.slice(0, m.index).split("\n").length;
      // THE SAME EXTRACTOR --scatter USES. This spelled out three forms - a
      // quoted string, a bare template literal, and `cn(...)` matched with
      // `[^)]*`, which TRUNCATES at the first close paren and so lost everything
      // after a nested call. clsx() and a plain ternary were not handled at all.
      // Three spellings enumerated by hand is how --scatter came to report zero.
      //
      // BLIND SPOT WORTH NAMING HERE TOO: the element regex above stops the
      // attribute blob at the first `>`, so a call site whose attributes contain
      // an arrow function (`onClick={() => ...}`) is read only up to that point.
      const exprs = classNameExpressions(attrs);
      if (!exprs.length) continue;
      const blob = exprs.flatMap((e) => classTokens(e)).join(" ");
      found.push({ name, line, blob, hasVariant: /\bvariant\s*=/.test(attrs) });
    }
  }
  return found;
}

if (process.argv.includes("--self-test")) {
  const src = `
import { Button } from '@/shared/ui/base/button'
export const X = () => (<>
  <Button variant="secondary" className="raised-off-page bg-primary text-primary-foreground px-10">a</Button>
  <Button className="gap-1 bg-primary hover:bg-primary text-sm sm:text-base">b</Button>
  <Button className="w-full flex items-center gap-2 mt-4">c</Button>
  <Button className="text-center">d</Button>
</>)`;
  const names = sharedImports(src);
  if (!names.has("Button")) { console.error("SELF-TEST FAILED: import not seen"); process.exit(1); }
  const els = elements(src, names);
  if (els.length !== 4) { console.error(`SELF-TEST FAILED: ${els.length} of 4 elements`); process.exit(1); }
  const verdicts = els.map((e) => e.blob.split(/\s+/).some((t) => classifies(t)));
  const expected = [true, true, false, false]; // c is pure layout, d is alignment
  if (String(verdicts) !== String(expected)) {
    console.error(`SELF-TEST FAILED: verdicts ${verdicts}, expected ${expected}`);
    console.error("  (layout-only and text-center must NOT flag; 239 alignment classes exist)");
    process.exit(1);
  }
  if (!els[0].hasVariant || els[1].hasVariant) {
    console.error("SELF-TEST FAILED: variant detection wrong"); process.exit(1);
  }
  // THE cn() BLIND SPOT, pinned so it cannot reopen. --scatter matched
  // `className="..."` and a bare template literal only, so the 205 call sites
  // spelled `className={cn(...)}` were never read and the mode reported 0 type
  // sizes across 263 files. That zero was quoted as evidence the typography
  // sweep was finished; the real number was 28.
  const CN_CASES = [
    [`<div className={cn("flex", active && "text-2xl font-bold")} />`, ["text-2xl", "font-bold"]],
    [`<div className={cn(clsx("gap-2", "text-sm"))} />`, ["text-sm"]],
    [`<div className={active ? "text-lg" : "text-xs"} />`, ["text-lg", "text-xs"]],
    [`<div className={cn("p-2", { "font-medium": on })} />`, ["font-medium"]],
    // Must NOT flag: alignment is layout, and pure layout is the allowed case.
    [`<div className={cn("text-center", "flex w-full")} />`, []],
  ];
  for (const [markup, want] of CN_CASES) {
    const exprs = classNameExpressions(markup);
    if (exprs.length !== 1) {
      console.error(`SELF-TEST FAILED: ${exprs.length} className expression(s) in ${markup}`);
      process.exit(1);
    }
    const got = classTokens(exprs[0])
      .map((t) => t.replace(/^[`'",]+|[`'",]+$/g, ""))
      .filter((t) => {
        const bare = t.replace(/^(?:[a-z-]+:)+/, "");
        return !TEXT_LAYOUT.test(bare) && TYPE_SIZES.test(bare);
      });
    if (String(got) !== String(want)) {
      console.error(`SELF-TEST FAILED: ${markup}\n  saw [${got}], expected [${want}]`);
      console.error("  This is the cn() blind spot reopening - --scatter reported 0 for months.");
      process.exit(1);
    }
  }
  // And the balanced-brace reader must not truncate on a nested object.
  const nested = classNameExpressions(`<div className={cn("a", { "text-sm": x })} data-x="y" />`);
  if (nested.length !== 1 || !nested[0].includes("text-sm")) {
    console.error("SELF-TEST FAILED: nested braces truncated the className expression");
    process.exit(1);
  }

  console.log("self-test ok: sees shared imports, flags appearance and colour,");
  console.log("leaves layout and text-center alone, separates contradicted from over-specified,");
  console.log(`and reads class strings out of ${CN_CASES.length} cn()/clsx()/ternary spellings.`);
  process.exit(0);
}

// --scatter: the OTHER half of the question, and the one Jacob actually feels.
// The call-site check above asks "does this element style what a component
// should own". This asks "is typography scattered across the app at all" -
// every type-size and weight utility ANYWHERE in a .tsx, not only on shared
// components. His words: "I would prefer to not have text styles scattered all
// over the app, it feels terrible to deal with. Would much rather just throw
// those on semantic html, use those semantic html for similar things and then
// have only one place to update."
//
// So this is the acceptance test for the whole typography workstream, and it
// has a target rather than a threshold: ZERO, minus whatever the manual runbook
// legitimately excepts. When it reads zero, changing a heading size is one line
// in typography.css - which is the entire point.
//
// Alignment (text-left/center/right) and arbitrary sizes are counted
// separately: alignment is LAYOUT and never in scope, while `text-[10px]` is a
// SCALE GAP - each one is a size the token set failed to offer.
if (process.argv.includes("--scatter")) {
  const all = walk(ROOT).filter((f) => !f.includes("/scripts/"));
  const perDir = {}; let sized = 0, arbitrary = 0, alignment = 0, filesWith = 0;
  const ARB = /\b(?:sm:|md:|lg:|xl:|hover:|focus:|dark:)*text-\[[^\]]+\]/g;
  for (const f of all) {
    const src = readFileSync(f, "utf8");
    let n = 0;
    for (const expr of classNameExpressions(src)) {
      for (const raw of classTokens(expr)) {
        // Strip the punctuation that survives splitting a cn() argument list -
        // the same clean-up classifies() needed for exactly this reason.
        const tok = raw.replace(/^[`'",]+|[`'",]+$/g, "");
        const bare = tok.replace(/^(?:[a-z-]+:)+/, "");
        if (TEXT_LAYOUT.test(bare)) { alignment++; continue; }
        if (TYPE_SIZES.test(bare)) { sized++; n++; }
      }
    }
    const arb = src.match(ARB); if (arb) { arbitrary += arb.length; n += arb.length; }
    if (n) {
      filesWith++;
      const dir = relative(ROOT, f).split("/").slice(0, 2).join("/");
      perDir[dir] = (perDir[dir] ?? 0) + n;
    }
  }
  console.log(`TYPOGRAPHY SCATTER - the target is ZERO, not a threshold.\n`);
  console.log(`  ${sized} type-size/weight utilities`);
  console.log(`  ${arbitrary} arbitrary sizes (text-[...]) - each is a SCALE GAP`);
  console.log(`  across ${filesWith} of ${all.length} .tsx files`);
  console.log(`  (${alignment} alignment classes counted separately - LAYOUT, never in scope)\n`);
  for (const [dir, n] of Object.entries(perDir).sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${String(n).padStart(5)}  ${dir}`);
  console.log(`\n  Zero here means a heading size changes in ONE line of typography.css.`);
  console.log(
    `  It does NOT mean zero exist: a class held in a variable, an imported\n` +
      `  variant map, or a name assembled from fragments is invisible to this.\n` +
      `  See the blind-spot list above classNameExpressions().`
  );
  process.exit(sized + arbitrary ? 1 : 0);
}

const files = walk(ROOT).filter((f) => !f.includes("/scripts/"));
const contradicted = [];
const overSpecified = [];
let scanned = 0, callSites = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const names = sharedImports(src);
  if (!names.size) continue;
  scanned++;
  for (const el of elements(src, names)) {
    callSites++;
    const bad = el.blob.split(/\s+/).map((t) => [t, classifies(t)]).filter(([, k]) => k);
    if (!bad.length) continue;
    const entry = {
      file: relative(ROOT, file), line: el.line, component: el.name,
      classes: bad.map(([t]) => t),
      selfCancellingHover: /\b(\w[\w-]*)\b[^"]*\bhover:\1\b/.test(el.blob),
    };
    (el.hasVariant ? contradicted : overSpecified).push(entry);
  }
}

if (!scanned) {
  console.error("REFUSING TO REPORT: found no file importing from shared/ui.");
  console.error("A scan that walks nothing looks exactly like a clean codebase.");
  process.exit(1);
}

const total = contradicted.length + overSpecified.length;
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ scanned, callSites, contradicted, overSpecified }, null, 2));
  process.exit(total ? 1 : 0);
}

console.log(`${scanned} files import shared/ui; ${callSites} call sites with a className\n`);

if (contradicted.length) {
  console.log(`${contradicted.length} CONTRADICTED - a variant prop overridden by appearance classes.`);
  console.log(`  The variant is decorative here: the call site asks for one look and paints another.`);
  console.log(`  Each is either a missing variant or a wrong one.\n`);
  for (const c of contradicted.slice(0, 25))
    console.log(`  ${c.file}:${c.line}  <${c.component}>  ${c.classes.join(" ")}`);
  if (contradicted.length > 25) console.log(`  ... and ${contradicted.length - 25} more`);
  console.log("");
}

if (overSpecified.length) {
  const cancelling = overSpecified.filter((o) => o.selfCancellingHover);
  console.log(`${overSpecified.length} OVER-SPECIFIED - appearance classes with no variant prop.`);
  if (cancelling.length)
    console.log(`  ${cancelling.length} of them CANCEL THEIR OWN HOVER (bg-x hover:bg-x) - nobody`);
  console.log(`  writes that unless the variant's hover state is wrong.\n`);
  for (const o of overSpecified.slice(0, 25))
    console.log(`  ${o.file}:${o.line}  <${o.component}>  ${o.classes.join(" ")}`);
  if (overSpecified.length > 25) console.log(`  ... and ${overSpecified.length - 25} more`);
  console.log("");
}

const byComponent = {};
for (const e of [...contradicted, ...overSpecified]) byComponent[e.component] = (byComponent[e.component] ?? 0) + 1;
const ranked = Object.entries(byComponent).sort((a, b) => b[1] - a[1]);
if (ranked.length) {
  console.log("by component - the top of this list is where a variant set is missing:");
  for (const [name, n] of ranked.slice(0, 12)) console.log(`  ${String(n).padStart(4)}  ${name}`);
  console.log("");
}

if (!total) { console.log("no appearance overrides on shared-component call sites."); process.exit(0); }
console.log(`${total} call site(s) style what the component should own.`);
console.log("Layout at the call site, appearance in the component - ruling 20 in FOLLOWUPS.md.");
process.exit(1);
