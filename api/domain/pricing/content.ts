import { convertTroyOz } from "#shared/utils/convertWeights.ts";

// Fine metal: weight in troy ounces times purity. Null means "not measured".
export function fineContent(
  weight: number | null | undefined,
  unit: string | null | undefined,
  purity: number | null | undefined
): number | null {
  const value = convertTroyOz(weight as number, unit as string) * (purity as number);
  return Number.isFinite(value) ? value : null;
}
