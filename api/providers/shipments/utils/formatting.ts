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

export function formatFedexFullDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatFedexTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds()
  )}`;
}

export function normalizeTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.length === 5 ? `${time}:00` : time;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
