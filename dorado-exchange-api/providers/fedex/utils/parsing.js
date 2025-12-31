import { FEDEX_TRACKING_STATUS_MAP } from "#providers/fedex/constants.js";

export function parseTracking(data) {
  const trackingOutput =
    data?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  const windowInfo = trackingOutput.estimatedDeliveryTimeWindow?.window;
  const standardEnd = trackingOutput.standardTransitTimeWindow?.window?.ends;
  const fromDateTimes = trackingOutput.dateAndTimes?.find(
    (dt) => dt.type === "ESTIMATED_DELIVERY"
  )?.dateTime;

  const estimatedDeliveryTime = windowInfo?.ends
    ? windowInfo.ends
    : standardEnd
    ? standardEnd
    : fromDateTimes
    ? fromDateTimes
    : "TBD";

  const relevantStatusCodes = Object.keys(FEDEX_TRACKING_STATUS_MAP);

  const scanEvents = (trackingOutput.scanEvents || [])
    .filter((event) => relevantStatusCodes.includes(event.eventType))
    .map((event) => {
      const city =
        event.scanLocation?.city
          ?.toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase()) || "";
      const state = event.scanLocation?.stateOrProvinceCode || "";
      return {
        date: event.date,
        location: `${city}, ${state}`.trim(),
        status: FEDEX_TRACKING_STATUS_MAP[event.eventType] || "Unknown",
      };
    })
    .reverse();

  const latestStatus =
    scanEvents[scanEvents.length - 1]?.status || "Status Unknown";
  const deliveredAt =
    scanEvents.find((event) => event.status === "Delivered")?.date || null;

  return {
    estimatedDeliveryTime,
    scanEvents,
    latestStatus,
    deliveredAt,
  };
}

export function parseAddressValidation(data) {
  const fedexResult = data?.output?.resolvedAddresses?.[0];

  const is_valid =
    fedexResult?.attributes?.Matched === "true" &&
    fedexResult?.attributes?.Resolved === "true";

  const classification = fedexResult?.classification;
  const is_residential = classification !== "BUSINESS";

  return { is_valid, is_residential };
}

export function parseRates(data) {
  const rateDetails = data?.output?.rateReplyDetails || [];
  return rateDetails.map((rate) => {
    const detail = rate.ratedShipmentDetails?.find(
      (d) => d.rateType === "ACCOUNT"
    );
    return {
      serviceType: rate.serviceType || null,
      packagingType: rate.packagingType || null,
      netCharge: detail?.totalNetCharge ?? null,
      currency: detail?.currency || "USD",
      deliveryDay: rate.commit?.dateDetail?.dayOfWeek || null,
      transitTime: rate.commit?.dateDetail?.dayFormat || null,
      serviceDescription:
        rate.serviceDescription?.description || rate.serviceName || null,
    };
  });
}

export function parseCreateShipment(data) {
  const shipment = data?.output?.transactionShipments?.[0];
  const tracking_number = shipment?.masterTrackingNumber ?? null;

  const labelFile =
    shipment?.pieceResponses?.[0]?.packageDocuments?.[0]?.encodedLabel ?? null;

  return { tracking_number, labelFile };
}

export function parsePickupAvailability(data, readyDate) {
  const options = data?.output?.options || [];

  return options
    .map((option) => {
      const filteredTimes = (option.readyTimeOptions || []).filter((t) => {
        const fullSlot = new Date(`${option.pickupDate}T${t}`);
        return fullSlot.getTime() >= readyDate.getTime();
      });

      return { pickupDate: option.pickupDate, times: filteredTimes };
    })
    .filter((entry) => entry.times.length > 0);
}

export function parseLocations(data) {
  const rawLocations = data?.output?.locationDetailList ?? [];

  const locations = rawLocations.map((loc) => ({
    locationId: loc.locationId,
    locationType: loc.locationType,
    distance: {
      value: loc.distance?.value ?? null,
      units: loc.distance?.units ?? "MI",
    },
    address: {
      streetLines: loc.contactAndAddress?.address?.streetLines ?? [],
      city: loc.contactAndAddress?.address?.city ?? "",
      stateOrProvinceCode:
        loc.contactAndAddress?.address?.stateOrProvinceCode ?? "",
      postalCode: loc.contactAndAddress?.address?.postalCode ?? "",
      countryCode: loc.contactAndAddress?.address?.countryCode ?? "",
    },
    contact: {
      companyName: loc.contactAndAddress?.contact?.companyName ?? "",
      phoneNumber: loc.contactAndAddress?.contact?.phoneNumber ?? "",
    },
    operatingHours: Array.isArray(loc.storeHours)
      ? loc.storeHours.reduce((acc, block) => {
          const day = block.dayOfWeek?.toUpperCase?.();
          const hours = block.operationalHours;
          if (!day) return acc;
          if (hours?.begins && hours?.ends)
            acc[day] = `${hours.begins} - ${hours.ends}`;
          else acc[day] = "Closed";
          return acc;
        }, {})
      : undefined,
    geoPositionalCoordinates: loc.geoPositionalCoordinates ?? null,
  }));

  return {
    matchedAddressGeoCoord: data?.output?.matchedAddressGeoCoord,
    locations,
  };
}

export function parseScheduledPickup(data) {
  const confirmationNumber = data?.output?.pickupConfirmationCode ?? null;
  const location = data?.output?.location ?? null;
  return { confirmationNumber, location };
}
