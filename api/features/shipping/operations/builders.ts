// Which function turns this application's shapes into each carrier's request.
//
// Parallel to PROVIDERS in registry.ts and keyed the same way: resolveCarrier
// looks both up with one key, so a carrier present in one and missing from the
// other is a startup-time error rather than a silent half-configuration.
import * as fedexAdapters from "#features/shipping/operations/adapters/fedex.js";

export const BUILDERS = {
  fedex: {
    validateAddress: fedexAdapters.validateAddressInput,
    getRates: fedexAdapters.getRatesInput,
    createLabel: fedexAdapters.createLabelInput,
    cancelLabel: fedexAdapters.cancelLabelInput,
    checkPickup: fedexAdapters.checkPickupInput,
    createPickup: fedexAdapters.createPickupInput,
    cancelPickup: fedexAdapters.cancelPickupInput,
    getTracking: fedexAdapters.getTrackingInput,
    getLocations: fedexAdapters.getLocationsInput,
  },
};
