// A RE-EXPORT AND NOTHING ELSE - see features/rates/queries.ts. Every refiner
// hook lives in @dorado/client now; this file exists only so the admin paths
// that name a supplier keep importing from @/shared/hooks/refiners/queries
// unchanged. It calls no API.
//
// FIVE HOOKS LEFT WITH THE ENGAGEMENT (docs/waves/lots-build.md):
// `useRefinerOrder`, `useRefinerMetals`, `useRefinerItems`,
// `usePatchRefinerItem` and `usePatchRefinerOrder` addressed `refiners.orders`
// / `refiners.items` / `refiners.spots` BY CUSTOMER ORDER ID. Those tables'
// code is deleted and no key joins a refining order to a customer order any
// more, so the hooks have no successor to be renamed to - the refining
// surface is reached by the refining order's own id
// (`useRefiningOrder`, `useRefiningLots`, `usePool` in @dorado/client).
export { useAdminSuppliers } from '@dorado/client'
