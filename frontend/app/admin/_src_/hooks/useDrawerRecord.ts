'use client'

import { useMemo } from 'react'
import { useDrawerStore } from '@/shared/store/drawerStore'

type DrawerKey = NonNullable<ReturnType<typeof useDrawerStore.getState>['activeDrawer']>

function defaultGetId<T>(record: T): string {
  return (record as { id: string }).id
}

export function useDrawerRecord<T>(
  key: DrawerKey,
  records: T[] | undefined,
  id: string | null | undefined,
  getId: (record: T) => string = defaultGetId
) {
  const activeDrawer = useDrawerStore((s) => s.activeDrawer)
  const closeDrawer = useDrawerStore((s) => s.closeDrawer)

  const record = useMemo(() => records?.find((r) => getId(r) === id), [records, id, getId])

  return { open: activeDrawer === key, record, close: closeDrawer }
}
