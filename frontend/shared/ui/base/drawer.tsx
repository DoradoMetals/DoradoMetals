import type { FC } from 'react'
import { Drawer as LibraryDrawer, type DrawerProps } from '@dorado/components'

// THIS WAS A HAND-ROLLED DIALOG (role, aria-modal, Escape-to-close, the
// surface/className merge fix) and the library now ships the same drawer with
// a focus trap and reduced-motion support on top. Sitting on it here fixes
// every default-import call site without touching them; the library exports
// it as a NAMED export, so a call site importing directly from
// `@dorado/components` gets `{ Drawer }` instead of this default.
const Drawer: FC<DrawerProps> = (props) => <LibraryDrawer {...props} />

export default Drawer
export type { DrawerProps }
