// THE PARCEL FACTS ARE THE SERVER'S (ruling 58, Jacob: "We don't care about
// packaging weight on the frontend. Why would it live here?"). Both take rows
// already loaded; neither reads a database.
import { convertToPounds } from "#shared/utils/convertWeights.ts";

export type WeighableLine = {
  pre_melt: number | null;
  unit: string | null;
  quantity: number | null;
};

export type WeighableBox = { min_weight_lb: number | null } | null | undefined;

// The carrier bills whichever is larger: what the metal itself weighs, or the
// box's own minimum. A bullion line's weight is PER UNIT, so quantity scales
// it - six one-ounce coins weigh six ounces, not one.
export function parcelWeightLb(items: WeighableLine[], pkg: WeighableBox): number {
  const itemsWeight = items.reduce((sum, item) => {
    const lb = convertToPounds(Number(item.pre_melt) || 0, item.unit ?? "g");
    return sum + lb * Number(item.quantity ?? 1);
  }, 0);
  return Math.max(itemsWeight, Number(pkg?.min_weight_lb ?? 0));
}

// What the carrier is told a parcel is worth. Today's meaning, unchanged: the
// order or quote's own total (D82 - the frontend computes no money). A
// ceiling specific to a carrier service is a separate, later clamp
// (shipping/services/service.ts clampInsuredValue).
export function declaredValue(total: number): number {
  return Math.max(0, Number(total) || 0);
}
