// Every id a fixture needs, minted rather than discovered.
//
// *** WHY NOT randomUUID(). *** The redesign doc's rule (2.3) is that a
// failure must reproduce and must be READABLE: `f3a1c0d2-0007-4000-8000-...`
// says "the seventh row this file built", where a random uuid says nothing at
// all. The first two groups are therefore derived - a hash of the calling TEST
// FILE, then a counter - and only the last group is per-process entropy.
//
// *** WHY THE LAST GROUP IS STILL RANDOM. *** A handful of tests write rows
// that really COMMIT (the sweeps, and the files that drive a service which
// opens its own transaction). A fully deterministic id would collide with
// itself on the next run of the same file and fail with a 23505 that has
// nothing to do with the assertion. The per-process suffix costs nothing and
// removes that whole class.
//
// The file hash is taken from the call stack ONCE per module instance. vitest
// runs each test file with a fresh module registry (`isolate: true`), so "this
// module instance" is "this test file" - the two coincide by construction.
import { createHash, randomBytes } from "node:crypto";

let filePrefix: string | null = null;
let counter = 0;
const RUN = randomBytes(6).toString("hex");

// The first frame of the stack that is not this directory: the test file, or
// whichever builder the test called. Falls back to a fixed prefix rather than
// throwing - an id generator must never be the thing that fails a run.
function callerFile(): string {
  const stack = new Error().stack ?? "";
  for (const line of stack.split("\n").slice(1)) {
    const m = /\(?((?:file:\/\/)?\/[^):]+\.(?:ts|js))/.exec(line);
    if (!m) continue;
    const file = m[1]!;
    if (file.includes("/shared/testing/")) continue;
    return file;
  }
  return "unknown";
}

function prefix(): string {
  if (filePrefix) return filePrefix;
  filePrefix = createHash("sha256").update(callerFile()).digest("hex").slice(0, 8);
  return filePrefix;
}

// A syntactically valid v4 uuid whose readable half names the file and the
// row: <file hash>-<counter>-4<counter>-8<counter>-<run>.
export function anId(): string {
  counter += 1;
  const n = counter.toString(16).padStart(3, "0");
  return `${prefix()}-0${n}-4${n}-8${n}-${RUN}`;
}

// A short, stable, human-readable discriminator for CONTENT - an email local
// part, a product name, a status sentinel. Same reasoning as anId: readable
// beats random in a failure message.
export function aTag(): string {
  counter += 1;
  return `${prefix().slice(0, 6)}${counter.toString(16).padStart(3, "0")}`;
}
