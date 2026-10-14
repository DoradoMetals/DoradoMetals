import type { UserName as UserNameRow } from '@dorado/contracts'

export type UserNameProps = {
  id: string | null | undefined
  names: readonly UserNameRow[] | undefined
  none?: string
}

export function userNameOf(
  names: readonly UserNameRow[] | undefined,
  id: string | null | undefined,
  none = 'System'
): string {
  if (!id) return none
  if (names === undefined) return ''
  return names.find((row) => row.id === id)?.name ?? 'Unknown'
}

export function UserName({ id, names, none }: UserNameProps) {
  return <>{userNameOf(names, id, none)}</>
}
