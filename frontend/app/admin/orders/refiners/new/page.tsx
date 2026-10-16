import { RefinerDraft } from '../_components'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string }>
}) {
  const { direction } = await searchParams
  return <RefinerDraft direction={direction === 'buy' ? 'buy' : 'sell'} />
}
