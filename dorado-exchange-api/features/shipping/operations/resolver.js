import * as carriersRepo from "#features/shipping/carriers/repo.js";
import { PROVIDERS } from "#features/shipping/operations/registry.js";
import { BUILDERS } from "#features/shipping/operations/builders.js";

function normalizeCarrierCode(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

export async function resolveCarrier(carrier_id, client) {
  const carrier = await carriersRepo.getById(carrier_id, client);
  const code = normalizeCarrierCode(carrier.name);

  const provider = PROVIDERS[code];
  const builders = BUILDERS[code];

  if (!provider) throw new Error(`Unsupported carrier: ${code}`);
  if (!builders) throw new Error(`No builders registered for carrier: ${code}`);

  return { code, provider, builders };
}
