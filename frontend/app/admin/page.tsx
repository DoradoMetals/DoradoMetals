import { AdminIndex } from './_src_/AdminIndex'

// The admin index. The role guard is the layout's (`app/admin/layout.tsx`), so
// this page is the composition and nothing else.
export default function Page() {
  return <AdminIndex />
}
