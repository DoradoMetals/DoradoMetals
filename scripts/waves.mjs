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
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
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

// REFUSE ON A DUPLICATE HEADING. Two `## Wave 6` headings appeared when a
// section was relocated, and the roll-up attributed another wave's bars to a
// row that read 58% against a true 93%. THE EXISTING WARNING COULD NOT SEE IT:
// every task still matched a line, so the unmatched list was empty.
//
// THE HEADING WORD IS READ, NOT ASSUMED. This said `Wave` and the file was
// rewritten into `Phase` sections - so from that commit the roll-up matched
// NOTHING, and every phase row plus OVERALL silently froze at whatever was last
// typed by hand while the task bars underneath them went on updating correctly.
// A page that is half live and half stale is worse than one that is plainly
// stale, because the live half is the evidence you trust the other half on.
const HEADINGS = [...index.matchAll(/^## (Phase \d+|Wave [\d.]+)/gm)].map((m) => m[1]);
{
  const dupes = HEADINGS.filter((h, i) => HEADINGS.indexOf(h) !== i);
  if (dupes.length) {
    console.error(`REFUSING TO ROLL UP: duplicate heading(s) ${[...new Set(dupes)].join(", ")}.`);
    console.error("A second heading of the same name silently attributes another");
    console.error("section's bars to this row.");
    process.exit(1);
  }
}

// EVERY fenced block under a heading, not just the first. Phase 1 carries three
// lanes in three blocks; taking the first rolled the row up from one of them and
// called it the phase. The old pattern stopped at the first ``` pair because
// that is what a lazy match does, and with one block per section it was right.
function sections(md) {
  const out = [];
  const parts = md.split(/^## /m);
  for (const part of parts.slice(1)) {
    const label = /^(Phase \d+|Wave [\d.]+)/.exec(part);
    if (!label) continue;
    const pcts = [];
    for (const [, block] of part.matchAll(/```\n([\s\S]*?)```/g)) {
      for (const m of block.matchAll(/\s(\d{1,3})%\s*$/gm)) pcts.push(Number(m[1]));
    }
    if (pcts.length) out.push({ label, name: label[1], pcts });
  }
  return out;
}

const secs = sections(index);
for (const sec of secs) {
  const avg = Math.round(sec.pcts.reduce((a, b) => a + b, 0) / sec.pcts.length);
  const num = sec.name.replace(/^(Phase|Wave) /, "").replace(".", "\\.");
  const word = sec.name.startsWith("Phase") ? "phase" : "wave";
  // The status cell carries prose ("IN FLIGHT, two lanes"), so the percentage
  // rides in the bar's own cell rather than replacing anything worth reading.
  const rowRe = new RegExp(`(\\| \\*\\*${word} ${num}\\*\\*[^|]*\\| \`)[█░]+(\`)(?: ~\\d+%)?`);
  if (rowRe.test(index)) index = index.replace(rowRe, `$1${bar(avg)}$2 ~${avg}%`);
  else unmatched.push(`WAVES.md: heading "${sec.name}" rolls up to ${avg}% but no table row matches`);
}

// OVERALL POOLS THE TASKS, not the phase averages. A mean of means makes a
// five-task phase weigh the same as a twelve-task one, so finishing a big phase
// moves the number less than finishing a small one. Pooling is not a true
// measure of remaining WORK either - tasks are not equal units - and the bar
// should be read as "how much of what we wrote down is done", nothing finer.
// It was a HAND-TYPED ~88% before this, derived from nothing and never recomputed.
const pooled = secs.flatMap((s) => s.pcts);
if (pooled.length) {
  const overall = Math.round(pooled.reduce((a, b) => a + b, 0) / pooled.length);
  index = index.replace(/OVERALL   [█░]+   ~\d+%/, `OVERALL   ${bar(overall, 36)}   ~${overall}%`);
  console.log(`overall: ${overall}% pooled from ${pooled.length} task(s) across ${secs.length} section(s)`);
}

// A lane file for a CLOSED phase is history, not a live report - its tasks
// have no line in the index because the index moved on, which is correct.
// Only warn about lanes the index is actually tracking, or every finished
// wave's file shouts forever and the warning stops being read. That is the
// same failure as a metric whose target cannot be reached (ruling 35).
// LIVE IS DERIVED, NOT LISTED. This was a hardcoded set of two filenames, and
// when two new lanes were dispatched their tasks were filtered out AS HISTORY -
// so the index sat unchanged for an hour while both lanes reported progress,
// and the warning that would have said so was the thing suppressing it.
// A list of what is current has to be maintained to stay true; an mtime cannot
// go stale. Same lesson as every hardcoded assumption found this week
// (D120's three, D157's one word): the check was right and its premise rotted.
const SIX_HOURS = 6 * 60 * 60 * 1000;

// A PROPOSED phase has a brief before it has approval, and its tasks correctly
// have no row in the index - the index tracks committed work. Warning about
// those trains the reader to skip the warning, which is how the hardcoded LIVE
// list came to hide two real lanes in the first place. A lane file opts out by
// saying so in its own header; nothing infers it.
const isProposal = (file) => {
  try {
    return /\(PROPOSED\)|\*\*Not approved yet\*\*/.test(
      readFileSync(join(LANES, file), "utf8").slice(0, 600)
    );
  } catch {
    return false;
  }
};

const isLive = (file) => {
  if (isProposal(file)) return false;
  try {
    return Date.now() - statSync(join(LANES, file)).mtimeMs < SIX_HOURS;
  } catch {
    return false;
  }
};
const liveUnmatched = unmatched.filter((u) => isLive(u.split(":")[0]));
if (liveUnmatched.length) {
  console.error(`WARNING - ${liveUnmatched.length} reported task(s) matched no line in the index:`);
  for (const u of liveUnmatched) console.error(`  ${u}`);
} else if (unmatched.length) {
  console.log(`(${unmatched.length} task line(s) from closed or PROPOSED phases' lane files, not tracked - expected)`);
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
