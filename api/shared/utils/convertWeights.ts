// Mirrored — the same conversion exists in frontend/shared/utils/convertWeights.ts and as the SQL function metals.convert_to_troy_oz; mirror.test.ts and convertWeights.test.ts hold all three in step.
// Every price here is per troy ounce, so this is where a customer's grams or pennyweight become the unit the business trades in.
// Zero returns (unparseable number, unrecognised unit) are deliberate — a scrap line with a junk weight should price at nothing rather than take the order down; `unit` stays a plain string rather than a union so a caller's typo doesn't become a compile error far from here.
export function convertTroyOz(num: number, unit: string): number {
  if (isNaN(num)) return 0;
  switch (unit.toLowerCase()) {
    case "t oz":
      return num;
    case "g":
      return num / 31.1035;
    case "dwt":
      return num / 20;
    case "lb":
      return num * (453.592 / 31.1035);
    default:
      return 0;
  }
}
