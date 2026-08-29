#!/usr/bin/env node
/* ============================================================================
   audit:state-collapse — D99, THE THIRD INVISIBLE-UI FAILURE MODE.
   ----------------------------------------------------------------------------
   The palette flip has three distinct failure modes and each was invisible to
   the detector built for the previous one:

     1. SAME-ELEMENT class pair   (D92)  `bg-primary text-white`   — grep-able
     2. CROSS-ELEMENT parent/child (D95) a bg-primary div with white children
                                          — grep-able with effort
     3. STATE / REST COLLAPSE      (D99)  a SELECTED token and an UNSELECTED
                                          token that resolve to the same colour

   The third is what this script is for, and no contrast metric answers it:
   BOTH STATES ARE INDIVIDUALLY LEGIBLE. What is lost is the DIFFERENCE between
   them. The date picker where the day you picked looks like every other day
   scores perfectly on every accessibility checker ever written.

   HOW IT WORKS. Resolve every colour token out of app/styles/theme.css, then
   for each className string in the tree build the element's REST colours
   (`bg-card`, `text-foreground`, `border-border`) and its STATE colours (the
   same properties under `hover:`, `data-[state=checked]:`,
   `has-[[data-state=checked]]:`, `data-[state=active]:`, `aria-selected:`,
   `peer-data-[state=checked]:`, `group-hover:` …), plus the two branches of a
   `cond ? 'a' : 'b'` conditional, which is how half the app spells a selected
   state. Then compare, PER PROPERTY, in sRGB.

   THE RULE. A state that changes at least ONE colour property by a visible
   margin passes. A state that moves colour but moves EVERY property it touches
   by less than the margin is a COLLAPSE — that is the defect. A state that
   changes no colour at all is ignored: it may be changing something this
   script does not model (a transform, a ring, an opacity).

   AND ONE MORE SHAPE, which is how AddressSelect was broken: HOVER equal to
   SELECTED. Hovering any row then makes it look like the chosen one, and both
   states individually pass the rule above.

   THE MARGIN. 1.25:1 between the two resolved colours. The surface ladder in
   this theme is deliberately tight — `--background` #09090c to `--card`
   #101114 is 1.05:1 — because ruling 19 separates panels by BORDER, not fill.
   That makes a bare ground→card swap a perfectly good *surface* step and a
   useless *selected* state, which is exactly the distinction being drawn.

   NOT A LINTER OF STYLE. Everything it reports is a thing a human cannot see
   in the running app. Exits non-zero while findings are outstanding, like
   audit:enum-domains and audit:payments.
   ============================================================================ */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd().endsWith("/frontend") ? process.cwd() : join(process.cwd(), "frontend");
const THEME = join(ROOT, "app/styles/theme.css");
const MARGIN = 1.25;

/* ---------- tokens ------------------------------------------------------- */

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

function readTokens() {
  const src = readFileSync(THEME, "utf8");
  const raw = {};
  for (const m of src.matchAll(/^\s*--([a-z0-9-]+):\s*(hsl\([^)]*\)|#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]+\))\s*;/gm))
    raw[m[1]] = m[2];
  const resolve = (name, seen = new Set()) => {
    if (seen.has(name)) return null;
    seen.add(name);
    const v = raw[name];
    if (!v) return null;
    const alias = v.match(/^var\(--([a-z0-9-]+)\)$/);
    if (alias) return resolve(alias[1], seen);
    const hsl = v.match(/^hsl\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%/);
    if (hsl) return hslToRgb(+hsl[1], +hsl[2], +hsl[3]);
    const hex = v.match(/^#([0-9a-fA-F]{6})$/);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    return null;
  };
  const out = {};
  for (const name of Object.keys(raw)) {
    const rgb = resolve(name);
    if (rgb) out[name] = rgb;
  }
  // The two Tailwind literals the tree uses that are not tokens.
  out["white"] = [255, 255, 255];
  out["black"] = [0, 0, 0];
  return out;
}

const TOKENS = readTokens();
const GROUND = TOKENS["background"] ?? [9, 9, 12];

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

/* ---------- class -> colour ---------------------------------------------- */

const PROPS = { bg: "background", text: "text", border: "border", ring: "ring", fill: "fill" };
const STATE_PREFIXES = [
  "hover", "focus", "focus-visible", "active", "group-hover", "peer-checked",
  "aria-selected", "aria-current", "aria-expanded",
];
// Bracketed variants are matched separately because they contain `:` and `[`.
const STATE_BRACKET = /^(?:has-\[\[data-state=(?:checked|active|on|open|selected)\]\]|data-\[state=(?:checked|active|on|open|selected)\]|peer-data-\[state=(?:checked|active|on)\]|group-data-\[state=(?:checked|active|on)\]|data-\[selected=true\]|data-\[active=true\])$/;

/** Split `hover:bg-card/50` into { variants:['hover'], prop:'bg', token:'card', alpha:0.5 } */
function parseClass(token) {
  // peel variants off the front, honouring bracketed ones
  const variants = [];
  let rest = token;
  for (;;) {
    let depth = 0, cut = -1;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (c === "[") depth++;
      else if (c === "]") depth--;
      else if (c === ":" && depth === 0) { cut = i; break; }
    }
    if (cut < 0) break;
    variants.push(rest.slice(0, cut));
    rest = rest.slice(cut + 1);
  }
  const m = rest.match(/^(bg|text|border|ring|fill)-([a-z0-9-]+)(?:\/(\d+))?$/);
  if (!m) return null;
  const [, prop, name, alphaRaw] = m;
  if (name === "transparent" || name === "current" || name === "inherit") {
    return { variants, prop, token: name, rgb: null, transparent: true };
  }
  const rgb = TOKENS[name];
  if (!rgb) return null;
  const alpha = alphaRaw ? +alphaRaw / 100 : 1;
  return { variants, prop, token: alphaRaw ? `${name}/${alphaRaw}` : name, rgb: alpha < 1 ? over(rgb, alpha, GROUND) : rgb };
}

const isStateVariant = (v) => STATE_PREFIXES.includes(v) || STATE_BRACKET.test(v);

/* ---------- the scan ------------------------------------------------------ */

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "dist" || e === "scripts") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Every quoted class-ish string literal, with the line it sits on. */
function stringsOf(src) {
  const out = [];
  for (const m of src.matchAll(/(['"`])((?:[a-z0-9][a-z0-9:[\]=_./-]*\s+)*[a-z0-9][a-z0-9:[\]=_./-]*)\1/g)) {
    if (!/[a-z]-/.test(m[2])) continue;
    out.push({ text: m[2], index: m.index });
  }
  return out;
}

/** Ternary branches: `cond ? 'a' : 'b'` — how most of the app spells selected. */
function ternariesOf(src) {
  const out = [];
  for (const m of src.matchAll(/\?\s*(['"])([^'"]{3,})\1\s*:\s*(['"])([^'"]{0,})\3/g))
    out.push({ a: m[2], b: m[4], index: m.index });
  return out;
}

const lineOf = (src, i) => src.slice(0, i).split("\n").length;

function colours(classString) {
  const map = { rest: {}, states: {} };
  for (const tok of classString.split(/\s+/)) {
    const p = parseClass(tok);
    if (!p) continue;
    const state = p.variants.filter(isStateVariant);
    // Responsive-only variants (sm:, md:) are the same visual state.
    if (!state.length) { map.rest[p.prop] = p; continue; }
    const key = state.join(":");
    (map.states[key] ??= {})[p.prop] = p;
  }
  return map;
}

const findings = [];
const files = walk(ROOT);
let scanned = 0, strings = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  let touched = false;

  for (const { text, index } of stringsOf(src)) {
    strings++;
    const { rest, states } = colours(text);
    const stateKeys = Object.keys(states);
    if (!stateKeys.length) continue;
    touched = true;

    for (const key of stateKeys) {
      const state = states[key];
      const moved = [];   // props the state actually changes
      for (const prop of Object.keys(state)) {
        const r = rest[prop];
        const s = state[prop];
        if (!r) continue;                       // no rest value to compare against
        if (r.transparent || s.transparent) {
          if (r.token === s.token) moved.push({ prop, r, s, ratio: 1 });
          continue;
        }
        moved.push({ prop, r, s, ratio: ratio(r.rgb, s.rgb) });
      }
      if (!moved.length) continue;
      /* A DELIBERATE DIM IS NOT A COLLAPSE. `bg-primary hover:bg-primary/90` is
         the design's own rule for a filled button - "nothing above it, the fill
         dims" - and it lands at ~1.2:1 by construction. Reporting it would bury
         the real findings under every Button intent. Same token, lower alpha,
         accepted. */
      if (moved.every((m) => {
        const [rt] = m.r.token.split("/");
        const [st, sa] = m.s.token.split("/");
        const [, ra] = m.r.token.split("/");
        return rt === st && sa !== undefined && sa !== ra;
      })) continue;
      const best = Math.max(...moved.map((m) => m.ratio));
      if (best >= MARGIN) continue;
      /* An IDENTICAL token is a different defect with a different fix: the
         state is a no-op, usually a hover cancelling itself. Named separately
         so the D99 count stays the count of states you cannot see. */
      const noop = moved.every((m) => m.r.token === m.s.token);
      findings.push({
        file: rel, line: lineOf(src, index), kind: noop ? "state is a no-op" : "state/rest",
        state: key,
        detail: moved
          .map((m) => `${m.prop}: ${m.r.token} -> ${m.s.token} (${m.ratio.toFixed(2)}:1)`)
          .join("; "),
      });
    }

    // HOVER == SELECTED. Both individually fine; together they mean hovering
    // any option makes it look like the chosen one.
    const hover = states["hover"];
    const checked = stateKeys.find((k) => k !== "hover" && /checked|active|selected|on\]/.test(k));
    if (hover && checked) {
      const c = states[checked];
      const shared = Object.keys(hover).filter((p) => c[p]);
      if (shared.length && shared.every((p) => hover[p].token === c[p].token)) {
        findings.push({
          file: rel, line: lineOf(src, index), kind: "hover == selected",
          state: `${checked} vs hover`,
          detail: shared.map((p) => `${p}: both ${c[p].token}`).join("; "),
        });
      }
    }
  }

  for (const { a, b, index } of ternariesOf(src)) {
    const A = colours(a).rest, B = colours(b).rest;
    const props = Object.keys(A).filter((p) => B[p]);
    if (!props.length) continue;
    touched = true;
    const moved = props
      .filter((p) => !A[p].transparent && !B[p].transparent)
      .map((p) => ({ prop: p, ratio: ratio(A[p].rgb, B[p].rgb), a: A[p].token, b: B[p].token }));
    if (!moved.length) continue;
    if (Math.max(...moved.map((m) => m.ratio)) >= MARGIN) continue;
    findings.push({
      file: rel, line: lineOf(src, index), kind: "conditional branches",
      state: "a ? x : y",
      detail: moved.map((m) => `${m.prop}: ${m.a} vs ${m.b} (${m.ratio.toFixed(2)}:1)`).join("; "),
    });
  }
  if (touched) scanned++;
}

/* ---------- SECOND PASS: a light ground under self-colouring tags ---------
   D95's shape, reached through a mechanism D95 did not name and which bit
   again in this pass. `typography.css` colours h1-h6, p, small, strong and li
   in @layer base. An `@layer base` rule LOSES to a utility on the element
   itself, but it BEATS an inherited colour completely - inheritance is not a
   cascade contest, it is what happens when nothing else applies.

   So `<div className="bg-primary text-primary-foreground"><h3>…</h3></div>`
   does NOT paint that h3: `text-primary-foreground` is inherited, base's
   `h3 { color: --neutral-900 }` is declared, and declared wins. On a
   near-white `bg-primary` that is a near-white heading. The payouts landing
   section shipped exactly this WITH A COMMENT SAYING IT HAD BEEN FIXED - the
   author repainted the container, which is the fix for a plain `<div>` child
   and a no-op for every semantic one.

   Heuristic and honest about it: a light `bg-*` on an element, then a
   self-colouring tag inside the next WINDOW lines carrying no `text-` class of
   its own. It cannot see the JSX tree, so it can over-report a sibling; each
   hit says which tag and which line so it is one glance to confirm. */

const SELF_COLOURING = /<(h[1-6]|p|small|strong|li)(\s[^>]*)?>/g;
const WINDOW = 15;
const lightGrounds = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const seen = new Set();
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    // Comments quote class strings all over this codebase - including the very
    // comments written to explain a fix of this exact defect, which is how the
    // first version of this pass reported the file it had just been used on.
    const opens = lines[i].lastIndexOf("/*") > lines[i].lastIndexOf("*/");
    const wasInComment = inComment;
    if (inComment && lines[i].includes("*/")) inComment = false;
    else if (!inComment && opens) inComment = true;
    if (wasInComment || opens || /^\s*\/\//.test(lines[i])) continue;
    for (const m of lines[i].matchAll(/\bbg-([a-z0-9-]+)(?:\/(\d+))?\b/g)) {
      if (m[2]) continue;                       // a tint, not a ground
      const rgb = TOKENS[m[1]];
      if (!rgb) continue;
      if (ratio(rgb, GROUND) < 4) continue;     // not a LIGHT ground
      if (seen.has(i)) continue;
      const window = lines.slice(i, i + WINDOW).join("\n");
      for (const tag of window.matchAll(SELF_COLOURING)) {
        if ((tag[2] ?? "").includes("text-")) continue;
        lightGrounds.push({
          file: relative(ROOT, file),
          line: i + 1 + window.slice(0, tag.index).split("\n").length - 1,
          ground: m[1], tag: tag[1],
        });
        seen.add(i);
        break;                                   // one report per ground
      }
    }
  }
}

/* ---------- the floor, because a scan that sees nothing looks clean ------- */

if (process.argv.includes("--self-test")) {
  const probe = colours("bg-background has-[[data-state=checked]]:bg-card");
  const r = ratio(probe.rest.bg.rgb, probe.states["has-[[data-state=checked]]"].bg.rgb);
  const ok = r < MARGIN && Object.keys(TOKENS).length > 20 && strings > 500;
  console.log(`self-test: ${Object.keys(TOKENS).length} tokens, ${strings} class strings,`);
  console.log(`  ground->card as a selected state resolves to ${r.toFixed(2)}:1 (must be < ${MARGIN})`);
  console.log(ok ? "self-test ok" : "SELF-TEST FAILED");
  process.exit(ok ? 0 : 1);
}

if (strings < 500) {
  console.error("REFUSING TO REPORT: only " + strings + " class strings seen.");
  console.error("A scan that walks nothing looks exactly like a clean codebase.");
  process.exit(2);
}

console.log("STATE/REST COLLAPSE (D99) - a selected state you cannot see.\n");
console.log(`  ${TOKENS && Object.keys(TOKENS).length} colour tokens resolved from theme.css`);
console.log(`  ${strings} class strings across ${files.length} .tsx files`);
console.log(`  margin: ${MARGIN}:1 between the two states\n`);

const report = () => {
  if (!lightGrounds.length) return;
  console.log("\n  SUSPECT - A LIGHT GROUND UNDER A SELF-COLOURING TAG (D95, via");
  console.log("  @layer base). Heuristic, so verify each: it reads lines, not the tree.");
  for (const g of lightGrounds)
    console.log(`    ${g.file}:${g.line}  bg-${g.ground} with an unpainted <${g.tag}> inside`);
  console.log("    typography.css colours these in @layer base, which BEATS an");
  console.log("    inherited text colour - painting the container does not reach them.");
};

if (!findings.length && !lightGrounds.length) {
  console.log("  no collapsed states.");
  process.exit(0);
}
if (!findings.length) {
  console.log("  no collapsed states.");
  report();
  process.exit(1);
}
const byFile = {};
for (const f of findings) (byFile[f.file] ??= []).push(f);
for (const [file, list] of Object.entries(byFile).sort()) {
  console.log(`  ${file}`);
  for (const f of list) console.log(`    :${f.line}  [${f.kind}] ${f.state}\n        ${f.detail}`);
}
report();
console.log(`\n  ${findings.length} state finding(s). Both states are individually legible - that is`);
console.log("  the point; no contrast checker will ever report these.");
process.exit(1);
