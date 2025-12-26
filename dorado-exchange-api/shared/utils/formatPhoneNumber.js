export function formatPhoneNumber(value) {
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
