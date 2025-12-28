export const formatAddressForFedEx = (address) => {
  return {
    streetLines: [address.line_1, address.line_2].filter(Boolean),
    city: address.city,
    stateOrProvinceCode: address.state,
    postalCode: address.zip,
    countryCode: address.country_code,
    residential: address.is_residential ?? true,
  };
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

// YYYY-MM-DDTHH:mm:ss
export function formatFedexFullDateTime(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// HH:mm:ss
export function formatFedexTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds()
  )}`;
}

// HH:mm -> HH:mm:ss
export function normalizeTime(time) {
  if (!time) return "";
  return time.length === 5 ? `${time}:00` : time;
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
