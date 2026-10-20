import { LeadScreen } from './_components'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LeadScreen leadId={id} />
}
