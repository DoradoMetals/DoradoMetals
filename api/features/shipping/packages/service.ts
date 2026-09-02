// THE BOXES, as rows (D208): what the purchase checkout offers, replacing the
// hardcoded packageOptions record the frontend shipped while nothing served
// this table. The minimum billable weight rides each row (112); the customer's
// actual parcel weight stays genuine user input on the create body.
import * as packages from "#features/shipping/packages/repo.ts";
import type { OfferedPackage } from "#features/shipping/packages/repo.ts";

export async function getOffered(): Promise<OfferedPackage[]> {
  return await packages.getOffered();
}
