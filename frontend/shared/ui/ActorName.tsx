export function ActorName({ name }: { name: string | null | undefined }) {
  return <>{name || 'System'}</>
}
