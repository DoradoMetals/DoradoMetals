export function convertTroyOz(num: number, unit: string): number {
  if (isNaN(num)) return 0
  switch (unit.toLowerCase()) {
    case 't oz':
      return num
    case 'g':
      return num / 31.1034768
    case 'dwt':
      return num / 20
    case 'lb':
      return num * (453.59237 / 31.1034768)
    default:
      return 0
  }
}

export function convertToPounds(value: number, unit: string): number {
  if (isNaN(value) || value <= 0) return 0
  return convertTroyOz(value, unit) / (453.59237 / 31.1034768)
}
