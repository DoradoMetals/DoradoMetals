import * as carriersService from "#features/shipping/carriers/service.ts";
import { PROVIDERS } from "#features/shipping/operations/registry.ts";
import { BUILDERS } from "#features/shipping/operations/builders.ts";

function normalizeCarrierCode(name: string | null | undefined): string {
  return String(name || "")
    .trim()
    .toLowerCase();
}

// A carrier row as this function needs it, deliberately structural rather
// than the Carrier contract. Two shapes reached here while the wire axis
// existed: the nested one, where a carrier is an organization with a role and
// the name lives on the organization, and the flattened legacy one. The axis
// and the legacy shape are retired (2026-08-28); the structural type stays
// because this function needs one field, not a contract.
type CarrierLike = {
  organization?: { name?: string | null } | null;
  name?: string | null;
};

type ProviderCode = keyof typeof PROVIDERS;

// The carrier's name is the organization's, not the carrier row's - a carrier is
// an organization with a role, and the repos return the two apart. The fallback
// to carrier.name dates from the flattened legacy shape; the wire axis that
// produced one is retired, so it should never be reached.
export async function resolveCarrier(carrier_id: string, client?: unknown) {
  // The SERVICE, not a repo: the carrier this needs is composed from two
  // tables, and the name it reads lives on the organization half.
  const carrier: CarrierLike | null = await carriersService.getCarrierById(
    carrier_id, client as never
  );
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
