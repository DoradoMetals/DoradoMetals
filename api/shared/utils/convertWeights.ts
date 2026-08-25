// Weight in whatever the scale reported, as troy ounces.
//
// Every price in this system is per troy ounce, so this is the boundary where a
// customer's grams or pennyweight become the unit the business trades in.
//
// The zero returns are deliberate and predate the conversion: an unparseable
// number and an unrecognised unit both give 0 rather than throwing, because a
// scrap line with a junk weight should price at nothing rather than take the
// order down. Typing it does not change that - `unit` stays a plain string
// rather than a union, because the callers pass whatever the frontend recorded
// and narrowing it here would turn a 0 into a compile error somewhere far away.
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
