// A US phone number as (XXX) XXX-XXXX, built up as it is typed.
//
// Partial input is a supported case, not an edge one: this runs on every
// keystroke, so three digits gives "(555" rather than nothing. The parameter is
// optional because callers pass a possibly-absent field straight in.
export function formatPhoneNumber(value?: string | null): string {
  if (!value) return "";

  const digits = value.replace(/\D/g, "");

  const cleanDigits = digits.startsWith("1") ? digits.slice(1) : digits;

  if (cleanDigits.length <= 3) return `(${cleanDigits}`;
  if (cleanDigits.length <= 6)
    return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3)}`;
  return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(
    3,
    6
  )}-${cleanDigits.slice(6, 10)}`;
}
