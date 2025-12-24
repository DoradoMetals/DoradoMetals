export function convertTroyOz(num: number, unit: string): number {
  if (isNaN(num)) return 0
  switch (unit.toLowerCase()) {
    case 't oz':
      return num
    case 'g':
      return num / 31.1035
    case 'dwt':
      return num / 20
    case 'lb':
      return num * (453.592 / 31.1035)
    default:
      return 0
  }
}

const unitToGram: Record<string, number> = {
  't oz': 31.1035,
  g: 1,
  dwt: 31.1035 / 20,
  lb: 453.592,
}

export function convertToPounds(value: number, unit: string): number {
  if (isNaN(value) || value <= 0) return 0
  const grams = value * (unitToGram[unit.toLowerCase()] || 0)
  return grams / unitToGram['lb']
}
