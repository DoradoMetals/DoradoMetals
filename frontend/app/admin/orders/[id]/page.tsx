import { AdminOrderScreen } from './_components/AdminOrderScreen'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminOrderScreen id={id} />
}
