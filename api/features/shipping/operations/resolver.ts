import * as carriersRepo from "#features/shipping/carriers/repo.js";
import { PROVIDERS } from "#features/shipping/operations/registry.ts";
import { BUILDERS } from "#features/shipping/operations/builders.ts";

function normalizeCarrierCode(name: string | null | undefined): string {
  return String(name || "")
    .trim()
    .toLowerCase();
}

// A carrier row as this function needs it, which is deliberately not
// CarrierWire. Two shapes reach here: the new one, where a carrier is an
// organization with a role and the name lives on the organization, and the
// flattened legacy one. Naming either would reject the other while
// CARRIERS_WIRE can still be pointed at both.
type CarrierLike = {
  organization?: { name?: string | null } | null;
  name?: string | null;
};

type ProviderCode = keyof typeof PROVIDERS;

// The carrier's name is the organization's, not the carrier row's - a carrier is
// an organization with a role, and the repos return the two apart. The fallback
// to carrier.name is for a caller still holding a flattened one; it goes when
// CARRIERS_WIRE does.
export async function resolveCarrier(carrier_id: string, client?: unknown) {
  const carrier: CarrierLike | undefined = await carriersRepo.getById(carrier_id, client);
  const code = normalizeCarrierCode(carrier?.organization?.name ?? carrier?.name);

  // Indexed as a plain lookup rather than narrowed first: `code` comes from the
  // database and may name a carrier nothing implements, which is precisely what
  // the two throws below are for. Narrowing it to ProviderCode beforehand would
  // move an error the database can cause into a place the compiler pretends it
  // cannot.
  const provider = PROVIDERS[code as ProviderCode];
  const builders = BUILDERS[code as ProviderCode];

  if (!provider) throw new Error(`Unsupported carrier: ${code}`);
  if (!builders) throw new Error(`No builders registered for carrier: ${code}`);

  return { code, provider, builders };
}
