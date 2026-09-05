// A RE-EXPORT AND NOTHING ELSE - see features/spots/queries.ts. Every rate
// hook lives in @dorado/client (ruling 62). It calls no API.
export {
  useAdminRates,
  useCreateRate,
  useDeleteRate,
  useRates,
  useRateTiers,
  useUpdateRate,
} from '@dorado/client'
