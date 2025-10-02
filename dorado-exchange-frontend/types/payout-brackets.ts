export type MaterialKind = 'bullion' | 'scrap';
export type MetalName = 'Gold' | 'Silver' | 'Platinum' | 'Palladium';

export interface PayoutBracket {
  id: string;
  metal: MetalName;
  material: MaterialKind;
  min_qty: number;
  max_qty: number | null;
  payout_pct: number;
  effective_from: string;
  effective_to: string | null;
}

export type PayoutBracketMap = Record<
  Lowercase<MetalName>,
  { bullion: PayoutBracket[]; scrap: PayoutBracket[] }
>;