import {
  DEFAULT_EMAIL_NOTIFICATION_DETAIL,
  DEFAULT_HOLD_AT_LOCATION_DETAIL,
} from "#providers/shipments/constants.ts";
// The account number follows FEDEX_ENV: the sandbox is a different FedEx
// account, so a payload built for it has to name that one or every request is
// refused with a permissions error rather than anything that says "wrong env".
import { accountNumber } from "#providers/shipments/endpoints.ts";
import {
  formatFedexTime,
  normalizeTime,
  formatFedexFullDateTime,
  addHours,
} from "#providers/shipments/utils/formatting.ts";


// Deliberately structural and loose, not a full model of FedEx's API — these builders pass most of what they're given straight through; a stricter type would be a second, drifting copy of somebody else's schema. Named only enough that a caller can't omit an address or misspell packageDetails.
type FedexAddress = Record<string, unknown>;
type PackageDetails = Record<string, unknown>;

type RateQuoteInput = {
  shipperAddress: FedexAddress;
  recipientAddress: FedexAddress;
  packageDetails: PackageDetails;
  pickupType?: string;
  declaredValue?: { amount?: number; currency?: string } | null;
  carrierCodes?: string[];
};

type CreateShipmentInput = {
  shipper: Record<string, unknown>;
  recipient: Record<string, unknown>;
  serviceType?: string;
  pickupType?: string;
  packageDetails: PackageDetails;
  totalDeclaredValue?: { amount?: number; currency?: string } | null;
  label?: Record<string, unknown>;
  specialServices?: Record<string, unknown> | null;
  emailNotificationDetail?: Record<string, unknown> | null;
  options?: { holdAtLocation?: boolean; emailNotifications?: boolean };
};

type PickupAvailabilityInput = {
  pickupAddress: FedexAddress;
  code?: string;
  readyDate: Date;
};

type SchedulePickupInput = Record<string, any>;
type CancelPickupInput = Record<string, any>;
type LocationsInput = Record<string, any>;

export function validateAddressPayload(address: FedexAddress) {
  return {
    addressesToValidate: [
      {
        address: {
          streetLines: [address.line_1, address.line_2].filter(Boolean),
          city: address.city,
          stateOrProvinceCode: address.state,
          postalCode: address.zip,
          countryCode: address.country_code,
        },
        addressVerificationOptions: {
          checkResidentialStatus: true,
        },
      },
    ],
  };
}

export function rateQuotePayload({
  shipperAddress,
  recipientAddress,
  packageDetails,
  pickupType,
  declaredValue,
  carrierCodes = ["FDXE"],
}: RateQuoteInput) {
  return {
    accountNumber: { value: accountNumber() },
    rateRequestControlParameters: { returnTransitTimes: true },
    requestedShipment: {
      shipDateStamp: new Date().toISOString().split("T")[0],
      shipper: { address: shipperAddress },
      recipient: { address: recipientAddress },
      pickupType,
      packagingType: "YOUR_PACKAGING",
      preferredCurrency: "USD",
      rateRequestType: ["PREFERRED", "LIST"],
      requestedPackageLineItems: [
        {
          ...packageDetails,
          groupPackageCount: "1",
          declaredValue,
        },
      ],
      shippingChargesPayment: {
        paymentType: "SENDER",
        payor: {
          responsibleParty: {
            accountNumber: { value: accountNumber() },
          },
        },
      },
    },
    carrierCodes,
  };
}

export function createShipmentPayload({
  shipper,
  recipient,
  serviceType,
  pickupType,
  packageDetails,
  totalDeclaredValue,
  label,
  specialServices,
  emailNotificationDetail,
  options,
}: CreateShipmentInput) {
  const wantsHoldAtLocation = options?.holdAtLocation !== false;
  const wantsEmailNotifications = options?.emailNotifications !== false;

  const resolvedSpecialServices =
    wantsHoldAtLocation && !specialServices
      ? {
          specialServiceTypes: ["HOLD_AT_LOCATION"],
          holdAtLocationDetail: DEFAULT_HOLD_AT_LOCATION_DETAIL,
        }
      : specialServices;

  const resolvedEmailNotificationDetail =
    wantsEmailNotifications && !emailNotificationDetail
      ? DEFAULT_EMAIL_NOTIFICATION_DETAIL
      : emailNotificationDetail;

  return {
    accountNumber: { value: accountNumber() },
    labelResponseOptions: "LABEL",
    requestedShipment: {
      shipper,
      recipients: [recipient],
      packagingType: "YOUR_PACKAGING",
      serviceType,
      pickupType,
      groupPackageCount: 1,
      totalDeclaredValue: totalDeclaredValue ?? undefined,
      requestedPackageLineItems: [packageDetails],
      labelSpecification: {
        imageType: label?.imageType ?? "PNG",
        labelStockType: label?.labelStockType ?? "PAPER_4X6",
      },
      shippingChargesPayment: {
        paymentType: "SENDER",
        payor: {
          responsibleParty: {
            accountNumber: { value: accountNumber() },
          },
        },
      },
      shipmentSpecialServices: resolvedSpecialServices ?? undefined,
      emailNotificationDetail: resolvedEmailNotificationDetail ?? undefined,
    },
  };
}


export function cancelShipmentPayload(trackingNumber: string) {
  return {
    accountNumber: { value: accountNumber() },
    trackingNumber,
  };
}

export function pickupAvailabilityPayload({
  pickupAddress,
  code,
  readyDate,
}: PickupAvailabilityInput) {
  const packageReadyTime = formatFedexTime(readyDate);

  return {
    pickupAddress,
    pickupRequestType: ["FUTURE_DAY"],
    carriers: [code],
    countryRelationship: "DOMESTIC",
    numberOfBusinessDays: 3,
    associatedAccountNumber: accountNumber(),
    packageReadyTime,
  };
}

export function schedulePickupPayload({
  pickupContact,
  pickupAddress,
  pickupDate,
  pickupTime,
  carrierCode,
  trackingNumber,
  packageLocation = "FRONT",
}: SchedulePickupInput) {
  const time = normalizeTime(pickupTime);
  const readyDate = new Date(`${pickupDate}T${time}`);

  const readyDateTimestamp = formatFedexFullDateTime(readyDate);
  const closeDate = addHours(readyDate, 2);
  const customerCloseTime = formatFedexTime(closeDate);

  return {
    associatedAccountNumber: { value: accountNumber() },
    originDetail: {
      pickupLocation: {
        contact: pickupContact,
        address: pickupAddress,
      },
      readyDateTimestamp,
      customerCloseTime,
      packageLocation,
    },
    trackingNumber,
    carrierCode,
  };
}

export function cancelPickupPayload({
  confirmationCode,
  pickupDate,
  location,
}: CancelPickupInput) {
  return {
    associatedAccountNumber: { value: accountNumber() },
    pickupConfirmationCode: confirmationCode,
    scheduledDate: pickupDate,
    location,
  };
}

export function locationsPayload({
  address,
  radiusMiles = 25,
  maxResults = 10,
}: LocationsInput) {
  return {
    locationsSummaryRequestControlParameters: {
      distance: { units: "MI", value: radiusMiles },
      maxResults,
    },
    constraints: {
      locationContentOptions: ["LOCATION_DROPOFF_TIMES"],
      excludeUnavailableLocations: true,
    },
    locationSearchCriterion: "ADDRESS",
    location: { address },
    multipleMatchesAction: "RETURN_ALL",
    sort: { criteria: "DISTANCE", order: "ASCENDING" },
    locationTypes: ["FEDEX_AUTHORIZED_SHIP_CENTER", "FEDEX_OFFICE"],
  };
}

export function trackingPayload(trackingNumber: string) {
  return {
    includeDetailedScans: true,
    trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
  };
}
