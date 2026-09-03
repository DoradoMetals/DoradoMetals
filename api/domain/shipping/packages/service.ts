// The boxes checkout offers, as rows - the minimum billable weight rides each row; the customer's actual parcel weight is genuine user input.
import * as packages from "#db/shipping/packages/repo.ts";
import type { OfferedPackage } from "#db/shipping/packages/repo.ts";

export async function getOffered(): Promise<OfferedPackage[]> {
  return await packages.getOffered();
}
