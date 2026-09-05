// The two checkout routes are one surface with two directions, and the only
// chrome they share is this column. The role guard stays on each page: the
// roles come from that route's own `protectedRoutes` entry.
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-col h-full items-center gap-4">{children}</main>
}
