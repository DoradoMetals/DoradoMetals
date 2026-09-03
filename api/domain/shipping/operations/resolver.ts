import * as carriersService from "#domain/shipping/carriers/service.ts";
import { PROVIDERS } from "#domain/shipping/operations/registry.ts";
import { BUILDERS } from "#domain/shipping/operations/builders.ts";
import { CATALOGUES } from "#domain/shipping/operations/catalogues.ts";
import type { Executor } from "#shared/db/executor.ts";

function normalizeCarrierCode(name: string | null | undefined): string {
  return String(name || "")
    .trim()
    .toLowerCase();
}

// A carrier row as this function needs it, deliberately structural rather than the Carrier contract - this needs one field, not a contract.
type CarrierLike = {
  organization?: { name?: string | null } | null;
  name?: string | null;
};

type ProviderCode = keyof typeof PROVIDERS;

// The carrier's name is the organization's, not the carrier row's - a carrier is an organization with a role, and the repos return the two apart.
export async function resolveCarrier(carrier_id: string, client?: Executor) {
  // The SERVICE, not a repo: the carrier this needs is composed from two
  // tables, and the name it reads lives on the organization half.
  const carrier: CarrierLike | null = await carriersService.getCarrierById(carrier_id, client);
  const code = normalizeCarrierCode(carrier?.organization?.name ?? carrier?.name);

  // Indexed as a plain lookup, not narrowed first: `code` comes from the database and may name a carrier nothing implements - narrowing first would hide that as a compiler-can't-happen case.
  const provider = PROVIDERS[code as ProviderCode];
  const builders = BUILDERS[code as ProviderCode];
  const catalogue = CATALOGUES[code as ProviderCode];

  if (!provider) throw new Error(`Unsupported carrier: ${code}`);
  if (!builders) throw new Error(`No builders registered for carrier: ${code}`);
  if (!catalogue) throw new Error(`No catalogue registered for carrier: ${code}`);

  return { code, provider, builders, catalogue };
}

// The carrier we ship with, when the caller names none. Not a hardcoded id: a literal compiled into the frontend is one restore away from naming a carrier that no longer exists, with nothing to report it but a failed checkout.
// Not a business preference either - it's a fact about the code: exactly one carrier has a provider registered, so exactly one can be quoted, labelled or tracked. The moment a second is registered, this throws rather than picking, because which one becomes a real business question.
export async function resolveShippingCarrierId(client?: Executor): Promise<string> {
  const carriers = await carriersService.getAllCarriers();
  const shippable = carriers.filter(
    (c) => normalizeCarrierCode(c.organization?.name) in PROVIDERS
  );

  if (shippable.length === 0) {
    throw new Error("No carrier has a shipping provider registered");
  }
  if (shippable.length > 1) {
    const names = shippable.map((c) => c.organization?.name ?? c.id).join(", ");
    throw new Error(
      `More than one carrier has a shipping provider registered (${names}) - ` +
        `the caller must say which one`
    );
  }

  return shippable[0].id;
}

// Memoised: resolving the default costs ~260ms (two round trips here, two more in resolveCarrier) on the checkout's most-hit path, for an answer that almost never changes.
// TTL, not process-lifetime: PROVIDERS is code (deploy-gated) but the organization's name isn't - five minutes is the window a rename takes to propagate (and a rename breaks every label either way, since resolveCarrier looks the provider up by that same name).
const CARRIER_ID_TTL_MS = 5 * 60 * 1000;
let cachedCarrierId: { id: string; at: number } | null = null;

// Exported for tests, which must not read one test's answer in another.
export function forgetShippingCarrier(): void {
  cachedCarrierId = null;
}

// The one place "no carrier given" becomes one - a caller that does name a carrier keeps naming it, unaffected.
// Nothing is cached when the caller names a carrier - that path never reaches here, so an admin acting on a specific carrier is never served the cached answer.
export async function carrierIdOr(
  carrier_id: string | null | undefined, client?: Executor
): Promise<string> {
  if (carrier_id) return carrier_id;

  const now = Date.now();
  if (cachedCarrierId && now - cachedCarrierId.at < CARRIER_ID_TTL_MS) {
    return cachedCarrierId.id;
  }

  const id = await resolveShippingCarrierId(client);
  cachedCarrierId = { id, at: now };
  return id;
}
