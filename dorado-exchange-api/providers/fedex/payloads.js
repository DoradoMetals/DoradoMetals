import {
  DEFAULT_EMAIL_NOTIFICATION_DETAIL,
  DEFAULT_HOLD_AT_LOCATION_DETAIL,
} from "#providers/fedex/constants.js";
import { formatFedexTime } from "#providers/fedex/utils/formatting.js";

export function validateAddressPayload(address) {
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
}) {
  return {
    accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
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
            accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
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
}) {
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
    accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
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
            accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
          },
        },
      },
      shipmentSpecialServices: resolvedSpecialServices ?? undefined,
      emailNotificationDetail: resolvedEmailNotificationDetail ?? undefined,
    },
  };
}


export function cancelShipmentPayload(trackingNumber) {
  return {
    accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
    trackingNumber,
  };
}

export function pickupAvailabilityPayload({ pickupAddress, code, readyDate }) {
  const packageReadyTime = formatFedexTime(readyDate);

  return {
    pickupAddress,
    pickupRequestType: ["FUTURE_DAY"],
    carriers: [code],
    countryRelationship: "DOMESTIC",
    numberOfBusinessDays: 3,
    associatedAccountNumber: process.env.FEDEX_ACCOUNT_NUMBER,
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
}) {
  const time = normalizeTime(pickupTime);
  const readyDate = new Date(`${pickupDate}T${time}`);

  const readyDateTimestamp = formatFedexFullDateTime(readyDate);
  const closeDate = addHours(readyDate, 2);
  const customerCloseTime = formatFedexTime(closeDate);

  return {
    associatedAccountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
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
}) {
  return {
    associatedAccountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
    pickupConfirmationCode: confirmationCode,
    scheduledDate: pickupDate,
    location,
  };
}

export function locationsPayload({
  address,
  radiusMiles = 25,
  maxResults = 10,
}) {
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

export function trackingPayload(trackingNumber) {
  return {
    includeDetailedScans: true,
    trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
  };
}
