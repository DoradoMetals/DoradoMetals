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