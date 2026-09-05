// THE HOOKS MOVED TO @dorado/client (src/shipping/). What is left here is a
// re-export, and the reason is scope rather than design: files this lane does
// not own - the payments lane's `features/stripe`, the admin drawers Jacob's
// own agents are reworking - import these names, and rewriting somebody else's
// file to change an import path is how two lanes collide. The next lane to
// touch one of those files points it at `@dorado/client` and this file shrinks;
// when the last of them has, it goes.
//
// NOTHING HERE CALLS THE API ANY MORE, which is what takes
// `frontend/features/shipping` off lint:client-boundary's PENDING list.
export {
  useShipment,
  useOrderShipments,
  useRefreshTracking,
  usePatchShipment,
  useCancelLabel,
  useCancelCarrierPickup,
  useCarrierHandoffs,
  useOfferedServices,
  useSaleShippingServices,
  useCarrierLocations,
  useCarrierPickupTimes,
  useValidateAddress,
  outboundOf,
  returnOf,
} from '@dorado/client'
