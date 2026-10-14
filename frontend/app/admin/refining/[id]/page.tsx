import { AdminRefiningScreen } from './_components/AdminRefiningScreen'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminRefiningScreen id={id} />
}
