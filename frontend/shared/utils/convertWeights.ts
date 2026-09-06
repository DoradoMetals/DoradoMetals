// MIRRORED. The same conversion exists in the API:
//   api/src/shared/utils/convertWeights.ts
// api/src/shared/tests/mirror.test.ts fails if this file and the API's drift apart.
//
// This is NOT the money conversion. Every fine-content figure the business
// pays on is derived by metals.fine_content in SQL, which is the one
// definition. What is left here sizes a parcel.
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

const unitToGram: Record<string, number> = {
  't oz': 31.1034768,
  g: 1,
  dwt: 31.1034768 / 20,
  lb: 453.59237,
}

export function convertToPounds(value: number, unit: string): number {
  if (isNaN(value) || value <= 0) return 0
  const grams = value * (unitToGram[unit.toLowerCase()] || 0)
  return grams / unitToGram['lb']
}
