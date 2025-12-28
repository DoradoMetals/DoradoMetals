import { formatAddressForFedEx } from "#providers/fedex/utils/formatting.js";

function toFedexContact(contact) {
  const c = contact ?? {};
  const personName = String(c.personName ?? c.name ?? "").trim();
  const phoneNumber = String(c.phoneNumber ?? c.phone ?? "").trim();

  return { personName, phoneNumber };
}

function toFedexAddress(address) {
  if (!address) return address;
  if (Array.isArray(address.streetLines)) return address;

  return formatAddressForFedEx(address);
}

function toFedexPkg(pkg) {
  if (!pkg) return {};
  return {
    weight: pkg.weight,
    dimensions: pkg.dimensions,
  };
}

export function validateAddressInput({ address }) {
  return address;
}

export function getRatesInput(input) {
  const {
    shipperAddress,
    recipientAddress,
    pickupType,
    pkg,
    declaredValue,
    carrierCodes,
  } = input ?? {};

  return {
    shipperAddress: toFedexAddress(shipperAddress),
    recipientAddress: toFedexAddress(recipientAddress),
    pickupType,
    packageDetails: {
      ...toFedexPkg(pkg),
      groupPackageCount: "1",
    },
    declaredValue,
    carrierCodes: carrierCodes ?? ["FDXE"],
  };
}

export function createLabelInput(input) {
  const {
    shipper,
    recipient,
    serviceType,
    pickupType,
    pkg,
    insurance,
    options,
    label,
  } = input ?? {};

  const totalDeclaredValue = insurance?.declaredValue ?? null;

  const wantsHoldAtLocation = options?.holdAtLocation === true;
  const wantsEmailNotifications = options?.emailNotifications !== false;

  const specialServices = wantsHoldAtLocation
    ? {
        specialServiceTypes: ["HOLD_AT_LOCATION"],
        holdAtLocationDetail: options?.holdAtLocationDetail,
      }
    : undefined;

  const emailNotificationDetail = wantsEmailNotifications
    ? options?.emailNotificationDetail
    : undefined;

  return {
    shipper: {
      contact: toFedexContact(shipper?.contact),
      address: toFedexAddress(shipper?.address),
    },
    recipient: {
      contact: toFedexContact(recipient?.contact),
      address: toFedexAddress(recipient?.address),
    },
    serviceType,
    pickupType,
    packageDetails: {
      ...toFedexPkg(pkg),
      declaredValue: totalDeclaredValue ?? undefined,
    },
    totalDeclaredValue,
    label: label ?? { imageType: "PNG", labelStockType: "PAPER_4X6" },
    specialServices,
    emailNotificationDetail,
    options: {
      holdAtLocation: options?.holdAtLocation === true,
      emailNotifications: options?.emailNotifications !== false,
    },
  };
}

export function cancelLabelInput(input) {
  return {
    tracking_number: input?.trackingNumber ?? input?.tracking_number,
  };
}

export function checkPickupInput(input) {
  const { pickupAddress, code, readyDate } = input ?? {};

  return {
    pickupAddress: toFedexAddress(pickupAddress),
    code,
    readyDate: readyDate instanceof Date ? readyDate : new Date(readyDate),
  };
}

export function createPickupInput(input) {
  const {
    pickupContact,
    pickupAddress,
    pickupDate,
    pickupTime,
    carrierCode,
    trackingNumber,
    packageLocation,
  } = input ?? {};

  return {
    pickupContact: toFedexContact(pickupContact),
    pickupAddress: toFedexAddress(pickupAddress),
    pickupDate,
    pickupTime,
    carrierCode,
    trackingNumber,
    packageLocation,
  };
}

export function cancelPickupInput(input) {
  return {
    confirmationCode: input?.confirmation_number,
    pickupDate: input?.pickup_requested_at,
    location: input?.location,
  };
}

export function getLocationsInput(input) {
  const { address, radiusMiles = 25, maxResults = 10 } = input ?? {};
  return {
    address: toFedexAddress(address),
    radiusMiles,
    maxResults,
  };
}

export function getTrackingInput(input) {
  return {
    tracking_number: input?.tracking_number ?? input?.trackingNumber,
  };
}
