import { convertTroyOz } from '#shared/utils/convertWeights.ts'
import { SettlementStatementLine } from '@dorado/contracts'

const SIGNATURE = /\bElemetal\b|\bELM-\d+\b/i
const LINE = /\b(ELM-\d+)\b([\s\S]*?)(?=\bELM-\d+\b|$)/g
const WEIGHT = /(\d[\d,]*(?:\.\d+)?)\s*(t\s?oz|ozt|oz|dwt|grams?|gr|g|lbs?)(?![A-Za-z])/i
const PURITY = /(\d+(?:\.\d+)?)\s*%/
const FINE_OZ = /^\s*[^\w\s]?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:t\s?oz|ozt|oz)(?![A-Za-z])/i
const METAL = /\b(gold|silver|platinum|palladium)\b/i

const decimal = (digits: string): number => Number(digits.replace(/,/g, ''))

const rounded = (value: number, places: number): number => Number(value.toFixed(places))

function unitOf(word: string): string {
  const unit = word.toLowerCase().replace(/\s/g, '')
  if (unit.startsWith('g')) return 'g'
  if (unit.startsWith('lb')) return 'lb'
  if (unit === 'dwt') return 'dwt'
  return 't oz'
}

const metalOf = (word: string | undefined): string | null =>
  word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : null

function line(line_reference: string, segment: string): SettlementStatementLine | null {
  const weighed = WEIGHT.exec(segment)
  const assayed = PURITY.exec(segment)
  if (!weighed || !assayed) return null
  const weight = decimal(weighed[1]!)
  const unit = unitOf(weighed[2]!)
  const purity = rounded(decimal(assayed[1]!) / 100, 6)
  const printed = FINE_OZ.exec(segment.slice(assayed.index + assayed[0].length))
  const troyOunces = convertTroyOz(weight, unit)
  const fine_oz = printed ? decimal(printed[1]!) : rounded(troyOunces * purity, 3)
  return SettlementStatementLine.parse({
    line_reference,
    unit,
    metal_id: metalOf(METAL.exec(segment)?.[1]),
    weight,
    purity,
    fine_oz,
  })
}

export const isElemetal = (text: string): boolean => SIGNATURE.test(text)

export function elemetalLines(text: string): SettlementStatementLine[] {
  const flat = text.replace(/\s+/g, ' ')
  return [...flat.matchAll(LINE)]
    .map((m) => line(m[1]!, m[2]!))
    .filter((parsed): parsed is SettlementStatementLine => parsed !== null)
}
