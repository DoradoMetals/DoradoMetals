import * as carriersService from "#domain/shipping/carriers/service.ts";
import { PROVIDERS } from "#domain/shipping/operations/registry.ts";
import { BUILDERS } from "#domain/shipping/operations/builders.ts";
import { CATALOGUES } from "#domain/shipping/operations/catalogues.ts";

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
  const catalogue = CATALOGUES[code as ProviderCode];

  if (!provider) throw new Error(`Unsupported carrier: ${code}`);
  if (!builders) throw new Error(`No builders registered for carrier: ${code}`);
  if (!catalogue) throw new Error(`No catalogue registered for carrier: ${code}`);

  return { code, provider, builders, catalogue };
}

// THE CARRIER WE SHIP WITH, WHEN THE CALLER DOES NOT NAME ONE.
//
// The browser used to name it, as a UUID literal repeated at three call sites
// in checkout with a `// TODO: source from store when you add carrier
// selection` beside one of them. It happens to be right - dev and production
// both give FedEx 30179428-b311-4873-8d08-382901c581d8, checked against both -
// but a production id compiled into a React component is one restore away from
// quoting shipping against a carrier that no longer exists, and nothing would
// have reported it except a failed checkout.
//
// This is NOT a business preference and does not invent one. It is a fact about
// the code: exactly one carrier has a provider implementation registered, so
// exactly one carrier can be quoted, labelled or tracked. `getAllCarriers`
// returns them sorted by organization name and the filter preserves that, so
// the answer is stable; the moment a second provider is registered this throws
// rather than picking, because at that point which carrier to use IS a business
// question and the caller has to answer it.
export async function resolveShippingCarrierId(client?: unknown): Promise<string> {
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

// MEMOISED, AND THE REASON IS D101 RATHER THAN TIDINESS.
//
// resolveShippingCarrierId costs TWO round trips - every carrier row, then
// every organization row - and the dev and production databases are remote,
// measured at 130ms per trip. resolveCarrier then spends two more. So resolving
// the default on every rate quote would have added ~260ms to the checkout's
// most-hit path to answer a question whose answer has not changed since the
// carriers were created on 2025-06-20 in both databases.
//
// THE TTL IS WHAT MAKES IT HONEST. A process-lifetime memo would be defensible
// - the map it reads is PROVIDERS, which is code, so changing it needs a deploy
// - but the OTHER input is an organization's name, which an admin can edit at
// runtime. Five minutes is the window in which a rename takes effect. Note that
// such a rename breaks every label either way: resolveCarrier looks the
// provider up by that same name.
const CARRIER_ID_TTL_MS = 5 * 60 * 1000;
let cachedCarrierId: { id: string; at: number } | null = null;

// Exported for tests, which must not read one test's answer in another.
export function forgetShippingCarrier(): void {
  cachedCarrierId = null;
}

// Every operations endpoint takes an optional carrier_id now. This is the one
// place that turns "none given" into one, so a caller that does name a carrier
// keeps naming it and nothing about the existing behaviour moves.
//
// NOTHING IS CACHED WHEN THE CALLER NAMES A CARRIER - that path does not reach
// here at all, so an admin acting on a specific carrier is never served this
// answer.
export async function carrierIdOr(
  carrier_id: string | null | undefined, client?: unknown
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
