export type TestRow = {
  id: string
  item: string
  metal: 'Gold' | 'Silver' | 'Platinum'
  weight: number
}

const METALS: TestRow['metal'][] = ['Gold', 'Silver', 'Platinum']

export function makeRows(n: number): TestRow[] {
  return Array.from({ length: n }, (_, index) => ({
    id: String(index + 1),
    item: `Item ${String(index + 1).padStart(4, '0')}`,
    metal: METALS[index % METALS.length]!,
    weight: Math.round(((index * 7919) % 1000) * 10) / 100,
  }))
}
