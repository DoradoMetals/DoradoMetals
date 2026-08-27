// Turning our shapes into the ones FedEx's API expects.

// A STRUCTURAL ADDRESS, NOT AddressWire. Three different things reach this: an
// address-book row, an order's address snapshot (AddressOnOrder, a different
// type with the same field names) and the constants in
// providers/shipments/constants.ts, which are hand-written literals. Naming any one
// of them here would reject the other two.
//
// Every field is optional and nullable because both wire shapes declare them
// nullable, and because FedEx is where a missing one is discovered rather than
// here.
type AddressLike = {
  line_1?: string | null;
  line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country_code?: string | null;
  is_residential?: boolean | null;
};

export const formatAddressForFedEx = (address: AddressLike) => {
  return {
    streetLines: [address.line_1, address.line_2].filter(Boolean),
    city: address.city,
    stateOrProvinceCode: address.state,
    postalCode: address.zip,
    countryCode: address.country_code,
    residential: address.is_residential ?? true,
  };
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// YYYY-MM-DDTHH:mm:ss
//
// Local time, not UTC - getHours and friends, not their UTC counterparts. That
// is what FedEx wants for a pickup window: the time at the address, with no
// offset on it. Passing a UTC-formatted string would schedule the pickup at the
// wrong hour for anyone not on the server's timezone.
export function formatFedexFullDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// HH:mm:ss
export function formatFedexTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds()
  )}`;
}

// HH:mm -> HH:mm:ss
export function normalizeTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.length === 5 ? `${time}:00` : time;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
