// Gap-fills for jsdom, loaded before every test file. jsdom implements the
// DOM, not the whole browser platform; the pieces Radix and the components
// need that it lacks are shimmed HERE, once.

// floating-ui (under Radix popovers/menus/selects) measures with these.
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
// Radix Select/Menu scroll the highlighted option into view on open.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
// Radix presses use pointer capture; jsdom has no pointer events at all.
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
// File previews (Upload/Attachment) object-URL their thumbnails.
if (typeof URL.createObjectURL !== "function") {
  let n = 0;
  URL.createObjectURL = () => `blob:vitest-${++n}`;
  URL.revokeObjectURL = () => {};
}

// testing-library's auto-cleanup registers only when `afterEach` is a global,
// and globals are off - without this the second test finds the first test's
// buttons still mounted.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
