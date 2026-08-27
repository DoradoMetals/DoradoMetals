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
