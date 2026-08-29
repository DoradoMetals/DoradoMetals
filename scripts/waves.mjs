#!/usr/bin/env node
// Regenerates WAVES.md's progress bars from the per-lane files under docs/waves/.
//
// The index used to be hand-edited, which meant it was accurate exactly as often
// as someone remembered - i.e. it went stale between updates, which is the one
// thing a progress tracker must not do. Each agent owns its own file (one writer
// per file, because two agents editing one shared file is how two rulings were
// lost on 2026-08-28); this reads them and rolls them up.
//
//   node scripts/waves.mjs          rewrite WAVES.md from the lane files
//   node scripts/waves.mjs --check  print what it would change, write nothing
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const INDEX = join(ROOT, "WAVES.md");
const LANES = join(ROOT, "docs/waves");
const WIDTH = 18;

const bar = (pct, w = WIDTH) => {
  const filled = Math.round((pct / 100) * w);
  return "█".repeat(filled) + "░".repeat(w - filled);
};

// A task line in a lane file looks like:  "B1. Something   ###...   40%"
//
// ONE SPACE IS ENOUGH, and requiring two was a real bug. The agents align their
// bars to a fixed column, so a task NAME OF 43 OR MORE CHARACTERS leaves exactly
// one space before the bar - and `\s{2,}` then failed to match, the line was
// silently skipped, no warning, and the index went on showing 0%. It hid four of
// wave 4's eleven tasks, including a B2 that had been reported COMPLETE.
// Found by the tracker agent, which noticed the page disagreed with the lane
// file it had just read.
//
// The same shape as D95/D99/D108: a detector that only recognises one spelling
// reports clean on the others. Written into a script whose entire job is to
// report progress accurately, which is the joke.
const TASK = /^([A-Z]?\d+\.\s+.+?)\s+[█░]+\s+(\d{1,3})%\s*$/;

function tasksIn(file) {
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = TASK.exec(line.trimEnd());
    if (m) out.push({ name: m[1].trim(), pct: Number(m[2]) });
  }
  return out;
}

const lanes = existsSync(LANES)
  ? readdirSync(LANES)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ file: f, tasks: tasksIn(join(LANES, f)) }))
  : [];

let index = readFileSync(INDEX, "utf8");
const changes = [];
const unmatched = [];

for (const lane of lanes) {
  for (const t of lane.tasks) {
    const escaped = t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}\\s+[█░]+\\s+\\d{1,3}%$`, "m");
    const m = re.exec(index);
    if (!m) {
      // A lane reported a task the index has no line for. Silence here is how
      // the bug above stayed invisible, so it is now loud.
      unmatched.push(`${lane.file}: "${t.name}" (${t.pct}%) has no line in WAVES.md`);
      continue;
    }
    // Normalise the whole line rather than preserving the original spacing -
    // otherwise the columns drift a little on every regeneration and the block
    // slowly stops lining up.
    // PAD TO AT LEAST name+2, not a flat 44. A name of exactly 44 characters
    // was emitted with NO space before its bar, and the parser needs at least
    // one - so the line wrote correctly once and then became invisible on every
    // run after. `B5. Extract shared components; adopt existing` is 45.
    // Second bug of the same species in one file: the first required two spaces
    // and got one, this one produced one space and then none. Both times the
    // failure was SILENT, which is the part worth remembering.
    const column = Math.max(44, t.name.length + 2);
    const replacement = `${t.name.padEnd(column)}${bar(t.pct)}${String(t.pct).padStart(5)}%`;
    if (m[0] !== replacement) changes.push(`${t.name} -> ${t.pct}%`);
    index = index.replace(re, replacement);
  }
}

// Roll each wave's row up from its own task block, then the overall bar from the rows.
for (const [, label, block] of index.matchAll(/## (Wave [\d.]+)[^\n]*\n[\s\S]*?```\n([\s\S]*?)```/g)) {
  const pcts = [...block.matchAll(/\s(\d{1,3})%\s*$/gm)].map((m) => Number(m[1]));
  if (!pcts.length) continue;
  const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  const num = label.replace("Wave ", "").replace(".", "\\.");
  const rowRe = new RegExp(`(\\| \\*\\*wave ${num}\\*\\*[^|]*\\| \`)[█░]+(\` \\| )~?\\d+%`);
  if (rowRe.test(index)) index = index.replace(rowRe, `$1${bar(avg)}$2~${avg}%`);
}

const rows = [...index.matchAll(/\| `[█░]+` \| ~?(\d+)%/g)].map((m) => Number(m[1]));
if (rows.length) {
  const overall = Math.round(rows.reduce((a, b) => a + b, 0) / rows.length);
  index = index.replace(/OVERALL   [█░]+   ~\d+%/, `OVERALL   ${bar(overall, 36)}   ~${overall}%`);
}

if (unmatched.length) {
  console.error(`WARNING - ${unmatched.length} reported task(s) matched no line in the index:`);
  for (const u of unmatched) console.error(`  ${u}`);
}

if (process.argv.includes("--check")) {
  console.log(changes.length ? changes.join("\n") : "no change");
  process.exit(0);
}

writeFileSync(INDEX, index);
console.log(
  `updated WAVES.md from ${lanes.length} lane file(s)` +
    (changes.length ? `:\n  ${changes.join("\n  ")}` : " (no task bars moved)")
);
