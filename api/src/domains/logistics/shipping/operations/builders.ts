import * as fedexAdapters from '#providers/carriers/fedex/adapters/fedex.ts'

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
}
