import { createHash, randomBytes } from "node:crypto";

let filePrefix: string | null = null;
let counter = 0;
const RUN = randomBytes(6).toString("hex");

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

export function anUnknownId(): string {
  counter += 1;
  const n = counter.toString(16).padStart(3, "0");
  return `${prefix()}-0${n}-4${n}-8${n}-${RUN}`;
}

export function aTag(): string {
  counter += 1;
  return `${prefix().slice(0, 6)}${counter.toString(16).padStart(3, "0")}`;
}
