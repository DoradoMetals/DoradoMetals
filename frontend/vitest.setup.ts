// Gap-fills for jsdom, loaded before every test file.
//
// jsdom implements the DOM, not the whole browser platform. The pieces
// components need that it lacks get shimmed HERE, once - a shim living inside
// one test file is a trap for the next component that needs it.
//
// URL.createObjectURL / revokeObjectURL: used by every file-preview flow
// (ImageUpload's thumbnail). jsdom throws TypeError without them.
if (typeof URL.createObjectURL !== "function") {
  let n = 0;
  URL.createObjectURL = () => `blob:vitest-${++n}`;
  URL.revokeObjectURL = () => {};
}

// localStorage: Node 24 ships an EXPERIMENTAL globalThis.localStorage that is
// inert unless the process was started with --localstorage-file - its setItem
// is not even a function - and it shadows the one jsdom would provide. Every
// zustand `persist` store hits this on first write. Replaced with a Map-backed
// implementation of the same surface.
const ls = (() => {
  try {
    localStorage.setItem("__probe__", "1");
    localStorage.removeItem("__probe__");
    return null; // the real thing works; leave it alone
  } catch {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => void m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  }
})();
if (ls) Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });

// testing-library's auto-cleanup registers itself only when `afterEach` is a
// GLOBAL, and this config keeps vitest globals off - so without this, every
// render accumulates in the shared jsdom document and the second test finds
// the first test's buttons.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
