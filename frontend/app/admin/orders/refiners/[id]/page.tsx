import { RefinerOrderScreen } from '../_components'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RefinerOrderScreen orderId={id} />
}
