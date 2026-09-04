// Which function turns this application's shapes into each carrier's request - keyed like PROVIDERS/CATALOGUES, so resolveCarrier catches a missing entry at startup rather than a silent half-configuration.
import * as fedexAdapters from "#providers/shipments/adapters/fedex.ts";

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
