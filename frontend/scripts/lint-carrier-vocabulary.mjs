// A CARRIER'S OWN WORDS, SPELLED IN THE BROWSER.
//
// THE DEFECT THIS LOOKS FOR (wave 5B). frontend/shared/types/handoff.ts held
// a record KEYED BY DROPOFF_AT_FEDEX_LOCATION and CONTACT_FEDEX_TO_SCHEDULE;
// frontend/shared/types/service.ts held one keyed by FEDEX_EXPRESS_SAVER and
// PRIORITY_OVERNIGHT carrying FedEx's FDXE carrier code; and three checkout
// components branched on those strings to decide what to render next. So the
// browser knew which of a carrier's services we offer, in what order, and what
// each of its handoff options means.
//
// It is the same defect class the wire conversion fixed everywhere else: the
// frontend renders what the API gives it and sends back an id (ruling 12, rows
// out and ids in). The catalogue is served now - GET /api/shipping/handoffs and
// GET /api/carrier_services/offered - and this script is what stops it coming
// back, because it came back once already: `serviceOptions` was written after
// `carrier_services` already existed as a table.
//
// *** IT ALSO GUARDS THE HARD-CODED CARRIER ID. *** 30179428-...-382901c581d8
// is FedEx's uuid in dev AND in production, and it was written into three React
// components with a `// TODO: source from store` beside one. A production uuid
// compiled into a component is one restore away from quoting shipping against a
// carrier that no longer exists, and nothing reports it but a failed checkout.
//
// WHAT IT CANNOT SEE, stated because a detector's blind spot reports as clean
// code (D95/D99/D108, three times on this project): it matches KNOWN SPELLINGS.
// A carrier vocabulary we have never met - a UPS service type, a USPS class -
// is invisible to it until its spelling is added below. A clean report means
// "none of the words I know", never "no carrier vocabulary".
//
// COMMENTS ARE NOT OCCURRENCES. Every file this wave touched explains what used
// to be there and names the strings, which is the record of the change; a
// checker that counted those would make the fix look like the defect and push
// the next author to delete the explanation. Line comments, block comments and
// JSX comments are stripped before matching. STRINGS ARE NOT STRIPPED, which is
// the point.
//
//   node scripts/lint-carrier-vocabulary.mjs [--self-test] [--json]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// Each entry is a spelling and what it is, so a finding says why it matters
// rather than just where it is.
const VOCABULARY = [
  ["FEDEX_EXPRESS_SAVER", "a FedEx service type"],
  ["PRIORITY_OVERNIGHT", "a FedEx service type"],
  ["FEDEX_GROUND", "a FedEx service type"],
  ["FEDEX_2_DAY", "a FedEx service type"],
  ["FIRST_OVERNIGHT", "a FedEx service type"],
  ["STANDARD_OVERNIGHT", "a FedEx service type"],
  ["DROPOFF_AT_FEDEX_LOCATION", "a FedEx pickup type"],
  ["CONTACT_FEDEX_TO_SCHEDULE", "a FedEx pickup type"],
  ["USE_SCHEDULED_PICKUP", "a FedEx pickup type"],
  ["FDXE", "a FedEx carrier code"],
  ["FDXG", "a FedEx carrier code"],
  ["YOUR_PACKAGING", "a FedEx packaging type"],
  ["FEDEX_ENVELOPE", "a FedEx packaging type"],
  ["FEDEX_BOX", "a FedEx packaging type"],
  ["PAPER_4X6", "a FedEx label stock type"],
  ["30179428-b311-4873-8d08-382901c581d8", "the FedEx carrier's production id"],
  ["9b244ec8-7aa2-47f8-beb9-48f8f1496e7d", "the UPS carrier's production id"],
];

// Test fixtures are counted SEPARATELY and do not fail the run - the lesson
// D55 paid for. A test spelling a carrier's service type is building a
// realistic response; it is not a component reading the wire, and counting the
// two together made the wire-readiness metric move the wrong way every time
// someone wrote a test. The fixture count is still printed, because a fixture
// is where the next real one gets copied from.
const isFixture = (p) => /\.test\.(ts|tsx)$/.test(p) || p.includes("/e2e/");

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".turbo"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Replaced with spaces rather than removed, so line and column numbers survive.
const blank = (m) => m.replace(/[^\n]/g, " ");

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
}

function scan(files) {
  const findings = [];

  for (const file of files) {
    const rel = relative(ROOT, file);
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");

    lines.forEach((line, i) => {
      for (const [word, what] of VOCABULARY) {
        if (line.includes(word)) {
          findings.push({ file: rel, line: i + 1, word, what, fixture: isFixture(rel) });
        }
      }
    });
  }

  return findings;
}

// PROVES THE DETECTOR FIRES. The first version of the sibling script walked
// zero files and called every switch ready; this one would report clean if
// stripComments were ever made greedy enough to eat real code.
function selfTest() {
  const src = [
    "// a comment naming DROPOFF_AT_FEDEX_LOCATION must NOT be a finding",
    "/* nor PRIORITY_OVERNIGHT inside a block */",
    "const a = 'DROPOFF_AT_FEDEX_LOCATION'",
    "const b = { FEDEX_EXPRESS_SAVER: 1 }",
  ].join("\n");

  const lines = stripComments(src).split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    for (const [word] of VOCABULARY) if (line.includes(word)) hits.push({ line: i + 1, word });
  });

  const ok =
    hits.length === 2 &&
    hits[0].line === 3 && hits[0].word === "DROPOFF_AT_FEDEX_LOCATION" &&
    hits[1].line === 4 && hits[1].word === "FEDEX_EXPRESS_SAVER";

  console.log(
    ok
      ? "self-test OK - comments ignored, code caught (2 findings on lines 3 and 4)"
      : `self-test FAILED - expected 2 findings on lines 3 and 4, got ${JSON.stringify(hits)}`
  );
  return ok ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) process.exit(selfTest());

const files = walk(ROOT);

// A FLOOR, because a walk that finds nothing reports perfectly clean. Same
// guard the sibling scripts carry and for the same reason: the first version of
// one of them walked zero files.
if (files.length < 200) {
  console.error(`only ${files.length} .ts/.tsx files walked - the scan is broken, not the code`);
  process.exit(1);
}

const findings = scan(files);
const real = findings.filter((f) => !f.fixture);
const fixtures = findings.filter((f) => f.fixture);

if (args.includes("--json")) {
  console.log(JSON.stringify({ files: files.length, real, fixtures }, null, 2));
  process.exit(real.length === 0 ? 0 : 1);
}

for (const f of real) {
  console.log(`  ${f.file}:${f.line}  ${f.word}  - ${f.what}`);
}

console.log(
  `\n${files.length} file(s) scanned, ${real.length} carrier vocabulary occurrence(s) in ` +
    `product code, ${fixtures.length} in test fixtures`
);

if (real.length > 0) {
  console.log(
    "\nThe frontend should not know what a carrier calls things. The catalogue is\n" +
      "served by GET /api/shipping/handoffs and GET /api/carrier_services/offered -\n" +
      "render `name`, branch on the flags, hand `code` back without reading it."
  );
  process.exit(1);
}
