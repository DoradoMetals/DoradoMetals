export function convertTroyOz(num: number, unit: string): number {

  if (isNaN(num)) return 0;
  switch (unit.toLowerCase()) {
    case 't oz':
      return num;
    case 'g':
      return num / 31.1035;
    case 'dwt':
      return num / 20;
    case 'lb':
      return num * (453.592 / 31.1035);
    default:
      return 0;
  }
}
