import { MetalScreen } from './_components'

export default async function Page({ params }: { params: Promise<{ metal: string }> }) {
  const { metal } = await params
  return <MetalScreen metalId={decodeURIComponent(metal)} />
}
