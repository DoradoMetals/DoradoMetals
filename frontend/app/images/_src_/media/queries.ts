// Media images - the hooks now live in @dorado/client; this file re-exports
// them under names this feature's UI already uses. RENAME: `useTestImage` is
// `useImages` now (the admin list read, matching the resource rather than
// the page it happens to back); its one call site is
// frontend/app/images/page.tsx. `useUploadImage`/`useDeleteImage` keep their
// names - ImageUpload.tsx needs no change.
export { useImages, useUploadImage, useDeleteImage } from "@dorado/client";
export type { Image, ImageUpload, ImageUploadReturn } from "@dorado/client";
