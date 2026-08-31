// A doorway: the taught merge lives in @dorado/components now, next to the
// components that compose through it. It moved when the package copy was
// found to be STOCK twMerge - reintroducing, inside every package component,
// the exact size-deleted-by-colour bug this file's original war story
// documents (see packages/components/src/cn.ts). One implementation, one
// list of semantic sizes; cn.test.ts still pins the behaviour from this side.
export { cn, SEMANTIC_TEXT_SIZES } from '@dorado/components'
