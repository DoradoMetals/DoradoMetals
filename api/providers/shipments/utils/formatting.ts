// Turning our shapes into the ones FedEx's API expects.

// A structural address, not the Address contract — an address-book row, an order's address snapshot, and hand-written constants all reach this with the same field names but different types; naming any one would reject the others.
// Every field optional/nullable since both wire shapes declare them so, and because FedEx is where a missing one is actually discovered.
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

// Local time, not UTC — FedEx wants the time at the address with no offset; a UTC-formatted string would schedule the pickup at the wrong hour for anyone off the server's timezone.
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
