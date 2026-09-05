// change-password and reset-password are the same form at two entry points.
// reset-password must stay public - the emailed token IS the credential.
export default function CredentialsLayout({ children }: { children: React.ReactNode }) {
  return <main className="mt-12 lg:mt-32">{children}</main>
}
