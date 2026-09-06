// MIRRORED. The same conversion exists in the frontend:
//   frontend/shared/utils/convertWeights.ts
// api/src/shared/tests/mirror.test.ts fails if the two drift apart.
//
// This is NOT the money conversion. Every fine-content figure the business
// pays on is derived by metals.fine_content in SQL, which is the one
// definition; a unit it does not recognise raises there rather than valuing
// the metal at nothing. What is left here sizes a parcel.
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
