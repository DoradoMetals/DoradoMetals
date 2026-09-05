import * as carriersService from '#logistics/shipping/carriers/service.ts'
import { PROVIDERS } from '#logistics/shipping/operations/registry.ts'
import { BUILDERS } from '#logistics/shipping/operations/builders.ts'
import { CATALOGUES } from '#logistics/shipping/operations/catalogues.ts'
import * as rules from '#logistics/shipping/rules.ts'
import type { Executor } from '#shared/db/executor.ts'

function normalizeCarrierCode(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
}

type ProviderCode = keyof typeof PROVIDERS

export async function resolveCarrier(carrier_id: string, client?: Executor) {
  const carrier = await carriersService.getCarrierById(carrier_id, client)
  const code = normalizeCarrierCode(carrier?.organization?.name)

  const provider = PROVIDERS[code as ProviderCode]
  const builders = BUILDERS[code as ProviderCode]
  const catalogue = CATALOGUES[code as ProviderCode]

  rules.assertProvider(provider, code)
  rules.assertBuilders(builders, code)
  rules.assertCatalogue(catalogue, code)

  return { code, provider, builders, catalogue }
}

export async function resolveShippingCarrierId(client?: Executor): Promise<string> {
  const carriers = await carriersService.getAllCarriers()
  const shippable = carriers.filter((c) => normalizeCarrierCode(c.organization?.name) in PROVIDERS)

  rules.assertOneShippableCarrier(shippable.map((c) => ({ name: c.organization?.name ?? c.id })))

  return shippable[0].id
}

const CARRIER_ID_TTL_MS = 5 * 60 * 1000
let cachedCarrierId: { id: string; at: number } | null = null

export function forgetShippingCarrier(): void {
  cachedCarrierId = null
}

export async function carrierIdOr(
  carrier_id: string | null | undefined,
  client?: Executor
): Promise<string> {
  if (carrier_id) return carrier_id

  const now = Date.now()
  if (cachedCarrierId && now - cachedCarrierId.at < CARRIER_ID_TTL_MS) {
    return cachedCarrierId.id
  }

  const id = await resolveShippingCarrierId(client)
  cachedCarrierId = { id, at: now }
  return id
}
