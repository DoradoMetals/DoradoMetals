import * as packages from "#db/shipping/packages/repo.ts";
import type { OfferedPackage } from "@dorado/contracts";

export async function getOffered(): Promise<OfferedPackage[]> {
  return await packages.getOffered();
}
