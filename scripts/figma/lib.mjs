// Shared helpers for the Figma sync checks: read the CSS the app actually
// ships, and normalise both sides onto one unit so they can be compared.
//
// The two sides do NOT speak the same units, and that is the whole reason
// this file exists:
//   - Figma stores colour as 0..1 RGB (captured here as hex), sizes in PX,
//     line-height in PX, letter-spacing in PX.
//   - theme.css stores colour mostly as hsl() (with four muted values as raw
//     hex), sizes in rem, line-height as a UNITLESS RATIO, letter-spacing in
//     em, and three radii as calc() off a --radius base.
// Everything is converted to hex / px here so a diff means a real difference
// and not a unit mismatch.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const THEME_DIR = path.join(ROOT, "packages", "theme");

export const readSnapshot = () =>
  JSON.parse(readFileSync(path.join(ROOT, "scripts", "figma", "snapshot.json"), "utf8"));

/** hsl(228, 13%, 4%) -> "#09090c". Rounds the same way Figma does. */
export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Accepts `hsl(h, s%, l%)`, `#rgb`, `#rrggbb`. Returns lowercase #rrggbb. */
export function toHex(value) {
  const v = String(value).trim();
  const hsl = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(v);
  if (hsl) return hslToHex(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short) return ("#" + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  return null; // not a literal colour - a var() reference, a gradient, something else
}

/** "0.5rem" -> 8, "16px" -> 16, "1.05" -> 1.05. Root font size is 16. */
export function toPx(value, rootPx = 16) {
  const v = String(value).trim();
  let m = /^(-?[\d.]+)rem$/.exec(v);
  if (m) return Number(m[1]) * rootPx;
  m = /^(-?[\d.]+)px$/.exec(v);
  if (m) return Number(m[1]);
  m = /^(-?[\d.]+)$/.exec(v);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Evaluates the one calc() shape theme.css uses for radii:
 *   calc(var(--radius) - 4px)   calc(var(--radius) + 4px)   var(--radius)
 * Anything else returns null rather than guessing.
 */
export function evalRadius(expr, radiusPx) {
  const v = String(expr).trim();
  if (/^var\(--radius\)$/.test(v)) return radiusPx;
  const m = /^calc\(\s*var\(--radius\)\s*([-+])\s*([\d.]+)px\s*\)$/.exec(v);
  if (!m) return toPx(v);
  return m[1] === "-" ? radiusPx - Number(m[2]) : radiusPx + Number(m[2]);
}

/**
 * Pulls `--name: value;` declarations out of a CSS file. Comments are stripped
 * first so a commented-out token is not read as live - theme.css carries long
 * rationale comments between declarations, and several of them contain values.
 */
export function readCssVars(file) {
  const raw = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map();
  for (const m of raw.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

export function loadTheme() {
  const vars = readCssVars(path.join(THEME_DIR, "theme.css"));
  const radiusPx = toPx(vars.get("--radius") ?? "0.5rem");
  return { vars, radiusPx };
}

/** Formats a number for a report without trailing float noise. */
export const num = (n) => (Math.round(n * 1000) / 1000).toString();

export function report(title, findings, { notes = [] } = {}) {
  console.log(title);
  for (const n of notes) console.log("  " + n);
  if (!findings.length) {
    console.log("  clean\n");
    return 0;
  }
  for (const f of findings) console.log("  " + f);
  console.log(`  ${findings.length} finding${findings.length === 1 ? "" : "s"}\n`);
  return findings.length;
}
