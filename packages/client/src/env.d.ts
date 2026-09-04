// `fetch.ts` reads `process.env.NEXT_PUBLIC_API_URL`, which the host's bundler
// inlines. The package's tsconfig sets no `types` field, and TypeScript 7 with
// `moduleResolution: bundler` does not auto-include @types/* the way it used
// to - so `process` resolves to nothing and the file fails to typecheck. This
// reference is the fix that leaves tsconfig.json alone.
/// <reference types="node" />
export {};
