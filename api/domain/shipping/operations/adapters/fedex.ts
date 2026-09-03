// Our shapes in, FedEx's request shapes out. Every input type is optional-everything: callers pass objects assembled from a request body, a database row, or a constant, and an adapter's job is to tolerate all three.
// Two functions accept both the provider's and the database's spellings on purpose - see cancelPickupInput's own note; that's not indecision, it fixed a real bug where FedEx never learned which pickup to cancel.
import { formatAddressForFedEx } from "#providers/shipments/utils/formatting.ts";

// Either an address as this application stores it, or one already converted -
// toFedexAddress detects which by looking for streetLines and passes a
// converted one straight through.
type AddressLike = {
  streetLines?: unknown;
  line_1?: string | null;
  line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country_code?: string | null;
  is_residential?: boolean | null;
};

// Both spellings again: `personName`/`phoneNumber` are FedEx's, `name`/`phone`
// are ours.
type ContactLike = {
  personName?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  phone?: string | null;
};

type PackageLike = { weight?: unknown; dimensions?: unknown } | null | undefined;

function toFedexContact(contact: ContactLike | null | undefined) {
  const c = contact ?? {};
  const personName = String(c.personName ?? c.name ?? "").trim();
  const phoneNumber = String(c.phoneNumber ?? c.phone ?? "").trim();

  return { personName, phoneNumber };
}

// Returns its argument untouched when falsy or already converted - the wide return type doesn't invent a distinction the runtime doesn't make.
function toFedexAddress(address: AddressLike | null | undefined) {
  if (!address) return address;
  if (Array.isArray(address.streetLines)) return address;

  return formatAddressForFedEx(address);
}

function toFedexPkg(pkg: PackageLike) {
  if (!pkg) return {};
  return {
    weight: pkg.weight,
    dimensions: pkg.dimensions,
  };
}

export function validateAddressInput({ address }: { address?: AddressLike | null }) {
  return address;
}

type RatesInput = {
  shipperAddress?: AddressLike | null;
  recipientAddress?: AddressLike | null;
  pickupType?: string;
  pkg?: PackageLike;
  declaredValue?: unknown;
  carrierCodes?: string[];
};

export function getRatesInput(input?: RatesInput | null) {
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

type LabelInput = {
  shipper?: { contact?: ContactLike | null; address?: AddressLike | null } | null;
  recipient?: { contact?: ContactLike | null; address?: AddressLike | null } | null;
  serviceType?: string;
  pickupType?: string;
  pkg?: PackageLike;
  insurance?: { declaredValue?: unknown } | null;
  options?: unknown;
  label?: { imageType?: string; labelStockType?: string };
};

export function createLabelInput(input?: LabelInput | null) {
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
    options,
  };
}

export function cancelLabelInput(
  input?: { trackingNumber?: string | null; tracking_number?: string | null } | null
) {
  return {
    tracking_number: input?.trackingNumber ?? input?.tracking_number,
  };
}

export function checkPickupInput(
  input?: {
    pickupAddress?: AddressLike | null;
    code?: string;
    readyDate?: Date | string | number;
  } | null
) {
  const { pickupAddress, code, readyDate } = input ?? {};

  return {
    pickupAddress: toFedexAddress(pickupAddress),
    code,
    readyDate: readyDate instanceof Date ? readyDate : new Date(readyDate!),
  };
}

type CreatePickupInput = {
  pickupContact?: ContactLike | null;
  pickupAddress?: AddressLike | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  carrierCode?: string | null;
  trackingNumber?: string | null;
  packageLocation?: string | null;
};

export function createPickupInput(input?: CreatePickupInput | null) {
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

// Accepts either the provider's names or the database's - operationsService.cancelPickup passes the provider's (already mapped off the pickup row), but this used to read only the database's, so confirmationCode/pickupDate arrived undefined and FedEx was asked to cancel a pickup without being told which one. `location` survived only because it's spelled the same either way.
// Both spellings are accepted rather than one corrected - same convention as cancelLabelInput's trackingNumber/tracking_number.
export function cancelPickupInput(
  input?: {
    confirmationCode?: string | null;
    confirmation_number?: string | number | null;
    pickupDate?: string | null;
    pickup_requested_at?: string | Date | null;
    location?: string | null;
  } | null
) {
  return {
    confirmationCode: input?.confirmationCode ?? input?.confirmation_number,
    pickupDate: input?.pickupDate ?? input?.pickup_requested_at,
    location: input?.location,
  };
}

export function getLocationsInput(
  input?: { address?: AddressLike | null; radiusMiles?: number; maxResults?: number } | null
) {
  const { address, radiusMiles = 25, maxResults = 10 } = input ?? {};
  return {
    address: toFedexAddress(address),
    radiusMiles,
    maxResults,
  };
}

export function getTrackingInput(input?: { tracking_number?: string | null } | null) {
  return {
    tracking_number: input?.tracking_number
  };
}
