import { useSpotPrices } from "@/lib/queries/useSpotPrices"
import { convertTroyOz } from "@/utils/convertTroyOz"

export default function getScrapPrice(
  metalId: string,
  unit: string,
  gross: string,
  purity: number
): string {
  const { data: spotPrices, isLoading, isError } = useSpotPrices()

  if (isLoading || isError || !spotPrices) return "..."

  const metal = spotPrices.find((m) => m.id === metalId)
  if (!metal) return "Unknown Metal"

  const weightInOz = convertTroyOz(gross, unit)
  const estimatedValue = metal.ask_spot * weightInOz * purity
  const rounded = Math.round(estimatedValue * 100) / 100

  return `$${rounded.toFixed(2)}`
}
