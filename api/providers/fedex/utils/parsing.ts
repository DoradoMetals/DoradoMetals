// FedEx's responses, reduced to what this application uses.
//
// THE TYPES HERE DESCRIBE FEDEX, NOT A CONTRACT. Everything in @dorado/contracts
// is generated from a schema we own; nothing is generated from FedEx's. So each
// shape below states only the fields these functions read, and states them all
// as optional, because an external payload is a promise rather than a
// guarantee. A type that claimed more would be a description of the happy path.
import { FEDEX_TRACKING_STATUS_MAP } from "#providers/fedex/constants.js";

type FedexScanEvent = {
  eventType?: string;
  date?: string;
  scanLocation?: { city?: string; stateOrProvinceCode?: string };
};

type FedexTrackResult = {
  estimatedDeliveryTimeWindow?: { window?: { ends?: string } };
  standardTransitTimeWindow?: { window?: { ends?: string } };
  dateAndTimes?: Array<{ type?: string; dateTime?: string }>;
  scanEvents?: FedexScanEvent[];
};

type FedexTrackingResponse = {
  output?: {
    completeTrackResults?: Array<{ trackResults?: FedexTrackResult[] }>;
  };
};

export type TrackingEvent = {
  date: string | undefined;
  location: string;
  status: string;
};

export type ParsedTracking = {
  estimatedDeliveryTime: string;
  scanEvents: TrackingEvent[];
  latestStatus: string;
  deliveredAt: string | null;
};

// `trackingOutput!` IS DELIBERATE AND MUST STAY. The line above optionally
// chains all the way to trackResults[0], and this one does not, so an empty or
// error response throws a TypeError here rather than returning an empty result.
//
// That looks like the obvious thing to fix and it is not, because of what runs
// after it. features/shipping/operations/service.js calls this INSIDE a
// transaction, and the next thing it used to do was delete every tracking event
// for the shipment and re-insert whatever came back. The throw happened before
// that delete, so it was the only thing preventing an empty response from
// wiping a shipment's history - production lost seven that way before the
// service learned to return early. Adding `?.` here without that guard would
// have turned a loud, harmless 500 into a silent deletion.
//
// The guard exists now, so this could safely be softened. It is not, on
// purpose: a FedEx outage or a bad tracking number should be loud. Returning
// "nothing recognised" for "I could not ask" makes an outage look like a quiet
// parcel.

export function parseTracking(data: FedexTrackingResponse): ParsedTracking {
  const trackingOutput =
    data?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  const windowInfo = trackingOutput!.estimatedDeliveryTimeWindow?.window;
  const standardEnd = trackingOutput!.standardTransitTimeWindow?.window?.ends;
  const fromDateTimes = trackingOutput!.dateAndTimes?.find(
    (dt) => dt.type === "ESTIMATED_DELIVERY"
  )?.dateTime;

  const estimatedDeliveryTime = windowInfo?.ends
    ? windowInfo.ends
    : standardEnd
    ? standardEnd
    : fromDateTimes
    ? fromDateTimes
    : "TBD";

  // A lookup table keyed by FedEx's codes, so it is indexed by string rather
  // than by its own literal keys - which is also why the `|| "Unknown"` below
  // stays even though the filter above guarantees a hit.
  const statusMap: Record<string, string> = FEDEX_TRACKING_STATUS_MAP;
  const relevantStatusCodes = Object.keys(statusMap);

  const scanEvents = (trackingOutput!.scanEvents || [])
    .filter((event: FedexScanEvent) => relevantStatusCodes.includes(event.eventType!))
    .map((event: FedexScanEvent) => {
      const city =
        event.scanLocation?.city
          ?.toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase()) || "";
      const state = event.scanLocation?.stateOrProvinceCode || "";
      return {
        date: event.date,
        location: `${city}, ${state}`.trim(),
        status: statusMap[event.eventType!] || "Unknown",
      };
    })
    .reverse();

  const latestStatus =
    scanEvents[scanEvents.length - 1]?.status || "Status Unknown";
  const deliveredAt =
    scanEvents.find((event: TrackingEvent) => event.status === "Delivered")?.date ||
    null;

  return {
    estimatedDeliveryTime,
    scanEvents,
    latestStatus,
    deliveredAt,
  };
}


type FedexAddressValidationResponse = {
  output?: {
    resolvedAddresses?: Array<{
      attributes?: { Matched?: string; Resolved?: string };
      classification?: string;
    }>;
  };
};

type FedexRateDetail = {
  serviceType?: string;
  packagingType?: string;
  serviceDescription?: { description?: string };
  serviceName?: string;
  commit?: { dateDetail?: { dayOfWeek?: string; dayFormat?: string } };
  ratedShipmentDetails?: Array<{
    rateType?: string;
    totalNetCharge?: number;
    currency?: string;
  }>;
};

type FedexRatesResponse = { output?: { rateReplyDetails?: FedexRateDetail[] } };

type FedexCreateShipmentResponse = {
  output?: {
    transactionShipments?: Array<{
      masterTrackingNumber?: string;
      pieceResponses?: Array<{
        packageDocuments?: Array<{ encodedLabel?: string }>;
      }>;
    }>;
  };
};

type FedexPickupOption = { pickupDate?: string; readyTimeOptions?: string[] };
type FedexPickupAvailabilityResponse = { output?: { options?: FedexPickupOption[] } };

type FedexLocationDetail = {
  locationId?: string;
  locationType?: string;
  distance?: { value?: number; units?: string };
  contactAndAddress?: {
    address?: {
      streetLines?: string[];
      city?: string;
      stateOrProvinceCode?: string;
      postalCode?: string;
      countryCode?: string;
    };
    contact?: { companyName?: string; phoneNumber?: string };
  };
  storeHours?: Array<{
    dayOfWeek?: string;
    operationalHours?: { begins?: string; ends?: string };
  }>;
  geoPositionalCoordinates?: unknown;
};

type FedexLocationsResponse = {
  output?: { locationDetailList?: FedexLocationDetail[]; matchedAddressGeoCoord?: unknown };
};

type FedexScheduledPickupResponse = {
  output?: { pickupConfirmationCode?: string; location?: string };
};

export function parseAddressValidation(data: FedexAddressValidationResponse) {
  const fedexResult = data?.output?.resolvedAddresses?.[0];

  const is_valid =
    fedexResult?.attributes?.Matched === "true" &&
    fedexResult?.attributes?.Resolved === "true";

  const classification = fedexResult?.classification;
  const is_residential = classification !== "BUSINESS";

  return { is_valid, is_residential };
}

export function parseRates(data: FedexRatesResponse) {
  const rateDetails = data?.output?.rateReplyDetails || [];
  return rateDetails.map((rate: FedexRateDetail) => {
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

export function parseCreateShipment(data: FedexCreateShipmentResponse) {
  const shipment = data?.output?.transactionShipments?.[0];
  const tracking_number = shipment?.masterTrackingNumber ?? null;

  const labelFile =
    shipment?.pieceResponses?.[0]?.packageDocuments?.[0]?.encodedLabel ?? null;

  return { tracking_number, labelFile };
}

export function parsePickupAvailability(
  data: FedexPickupAvailabilityResponse,
  readyDate: Date
) {
  const options = data?.output?.options || [];

  return options
    .map((option: FedexPickupOption) => {
      const filteredTimes = (option.readyTimeOptions || []).filter((t: string) => {
        const fullSlot = new Date(`${option.pickupDate}T${t}`);
        return fullSlot.getTime() >= readyDate.getTime();
      });

      return { pickupDate: option.pickupDate, times: filteredTimes };
    })
    .filter((entry: { pickupDate?: string; times: string[] }) => entry.times.length > 0);
}

export function parseLocations(data: FedexLocationsResponse) {
  const rawLocations = data?.output?.locationDetailList ?? [];

  const locations = rawLocations.map((loc: FedexLocationDetail) => ({
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
      ? loc.storeHours.reduce((acc: Record<string, string>, block) => {
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

export function parseScheduledPickup(data: FedexScheduledPickupResponse) {
  const confirmationNumber = data?.output?.pickupConfirmationCode ?? null;
  const location = data?.output?.location ?? null;
  return { confirmationNumber, location };
}
