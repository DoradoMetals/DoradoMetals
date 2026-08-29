// D99 — A SELECTED STATE AND A REST STATE THAT BECOME THE SAME COLOUR.
//
// This is the third invisible-UI failure mode and the only one no contrast
// checker will ever report, because BOTH STATES ARE INDIVIDUALLY LEGIBLE. What
// is lost is the difference between them: a date picker where the day you
// picked looks like every other day scores 18:1 on every accessibility tool
// ever written.
//
// So the assertion is not "is each state legible". It is "is SELECTED visibly
// different from UNSELECTED", and it is asked of the components that own a
// selected state, against the real token values in app/styles/theme.css. A
// palette change that collapses two of them fails here rather than shipping.
//
// The tree-wide sweep is `pnpm --filter @dorado/frontend audit:state-collapse`;
// this file is the part that runs in `pnpm check`.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { radioOptionVariants } from "@/shared/ui/RadioGroup";
import { statusChipVariants } from "@/shared/ui/StatusChip";

const THEME = readFileSync(join(import.meta.dirname, "../../app/styles/theme.css"), "utf8");

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

const RAW: Record<string, string> = {};
for (const m of THEME.matchAll(
  /^\s*--([a-z0-9-]+):\s*(hsl\([^)]*\)|var\(--[a-z0-9-]+\))\s*;/gm
))
  RAW[m[1]] = m[2];

function token(name: string, seen = new Set<string>()): [number, number, number] {
  if (seen.has(name)) throw new Error(`token cycle at --${name}`);
  seen.add(name);
  const v = RAW[name];
  if (!v) throw new Error(`no --${name} in theme.css`);
  const alias = v.match(/^var\(--([a-z0-9-]+)\)$/);
  if (alias) return token(alias[1], seen);
  const hsl = v.match(/^hsl\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%/)!;
  return hslToRgb(+hsl[1], +hsl[2], +hsl[3]);
}

const lum = ([r, g, b]: [number, number, number]) => {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** A tint (`bg-success/15`) resolves over the page ground, which is what it
 *  actually sits on for every one of these components. */
const over = (fg: [number, number, number], alpha: number) => {
  const bg = token("background");
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as [number, number, number];
};

/** Pull `<prop>-<token>` (optionally `/NN`) out of a class string, ignoring any
 *  state-prefixed spelling unless `state` is given. */
function colourOf(classes: string, prop: "bg" | "border" | "text", state?: string) {
  const re = state
    ? new RegExp(
        `(?:^|\\s)${state.replace(/[[\]]/g, "\\$&")}:${prop}-([a-z0-9-]+)(?:/(\\d+))?(?=\\s|$)`
      )
    : new RegExp(`(?:^|\\s)${prop}-([a-z0-9-]+)(?:/(\\d+))?(?=\\s|$)`);
  const m = classes.match(re);
  if (!m) return null;
  if (["transparent", "current", "inherit"].includes(m[1])) return null;
  let rgb: [number, number, number];
  try {
    rgb = token(m[1]);
  } catch {
    return null; // not a theme token (a Tailwind literal); nothing to compare
  }
  return m[2] ? over(rgb, +m[2] / 100) : rgb;
}
const bg = (classes: string, state?: string) => colourOf(classes, "bg", state);

/** THE RULE, and it is the audit script's rule: a state passes if it moves at
 *  least ONE colour property by a visible margin. It does NOT have to move all
 *  of them, and requiring the FILL alone to carry it would be wrong here - the
 *  hued intents deliberately tint at 15% (a wash, ~1.1-1.2:1 against the
 *  ground) and do their work through the BORDER and the TEXT, which move by a
 *  lot. What fails is a state that moves nothing anybody can see. */
function movesSomething(classes: string, state: string) {
  const moves: number[] = [];
  for (const prop of ["bg", "border", "text"] as const) {
    const rest = colourOf(classes, prop);
    const next = colourOf(classes, prop, state);
    if (!next) continue;
    // No rest value means the property is inherited; the page ground and the
    // body colour are the darkest/most-neutral it can be, so this is the
    // WEAKEST reading rather than an optimistic one.
    const from = rest ?? (prop === "bg" ? token("background") : token("foreground"));
    moves.push(ratio(next, from));
  }
  return moves.length ? Math.max(...moves) : 0;
}

// A state has to move the ground by at least this much to be a state anyone can
// see. The surface ladder here is deliberately tight - background to card is
// 1.05:1, because ruling 19 separates panels by BORDER - which is exactly why a
// bare ground->card swap is a fine SURFACE step and a useless SELECTED one.
const MARGIN = 1.25;

describe("a selected state is visibly different from an unselected one (D99)", () => {
  const intents = ["neutral", "brand", "success", "danger", "warning", "info"] as const;

  for (const intent of intents) {
    for (const variant of ["card", "tile", "segment"] as const) {
      test(`RadioOption ${variant}/${intent}: checked differs from rest`, () => {
        const classes = radioOptionVariants({ variant, intent });
        expect(
          bg(classes, "has-[[data-state=checked]]"),
          `${variant}/${intent} declares no checked background`
        ).not.toBeNull();
        expect(movesSomething(classes, "has-[[data-state=checked]]")).toBeGreaterThan(MARGIN);
      });
    }
  }

  // The neutral case is the one that has already broken twice: neutral's
  // "colour" is white, so a 15% white wash - the treatment every hued intent
  // uses - is not a state anybody can see on a near-black ground. Neutral fills
  // instead. Pinned explicitly so a future tidy-up cannot make it consistent.
  test("neutral FILLS rather than washing", () => {
    const classes = radioOptionVariants({ variant: "card", intent: "neutral" });
    expect(classes).toContain("has-[[data-state=checked]]:bg-primary");
    expect(classes).not.toMatch(/has-\[\[data-state=checked\]\]:bg-primary\/\d/);
  });

  // And the descendants, which is the actual D99 that shipped: a checked
  // neutral card fills near-white, `text-primary-foreground` INHERITS, and
  // typography.css colours `strong`/`p`/`small` in @layer base - a declared
  // rule beats an inherited one, so the content stayed near-white on near-white
  // in the selected state only.
  test("a checked neutral option repaints the tags that colour themselves", () => {
    const classes = radioOptionVariants({ variant: "card", intent: "neutral" });
    for (const tag of ["strong", "p", "small", "h2"])
      expect(classes, `<${tag}> keeps its own colour on a filled option`).toContain(
        `has-[[data-state=checked]]:[&_${tag}]:text-primary-foreground`
      );
  });

  for (const tone of ["neutral", "brand", "success", "danger", "warning", "info"] as const) {
    test(`StatusChip ${tone} is distinguishable from the page ground`, () => {
      const chip = bg(statusChipVariants({ tone }));
      expect(chip).not.toBeNull();
      expect(ratio(chip!, token("background"))).toBeGreaterThan(1.15);
    });
  }
});
