/**
 * Converts a weight into troy ounces from supported units.
 *
 * @param value - The numeric weight (as string or number)
 * @param unit - The unit of the weight ('g', 'oz', 'dwt', or 'lb')
 * @returns weight in troy ounces (number)
 */
export function convertTroyOz(value: string | number, unit: string): number {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return 0;

  switch (unit.toLowerCase()) {
    case 't oz': // already troy ounce
      return num;
    case 'g':
      return num / 31.1035;
    case 'dwt': // pennyweight
      return num / 20;
    case 'lb':
      return num * (453.592 / 31.1035); // convert pounds to grams, then grams to troy oz
    default:
      console.warn(`Unsupported unit: ${unit}`);
      return 0;
  }
}
