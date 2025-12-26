export const DORADO_ADDRESS = {
  streetLines: [
    process.env.FEDEX_RETURN_ADDRESS_LINE_1,
    process.env.FEDEX_RETURN_ADDRESS_LINE_2,
  ],
  city: process.env.FEDEX_RETURN_CITY,
  stateOrProvinceCode: process.env.FEDEX_RETURN_STATE,
  postalCode: process.env.FEDEX_RETURN_ZIP,
  countryCode: process.env.FEDEX_RETURN_COUNTRY,
};

export const FEDEX_STORE_ADDRESS = {
  streetLines: ["13605 Midway Rd"],
  city: "Farmers Branch",
  stateOrProvinceCode: "TX",
  postalCode: "75244",
  countryCode: "US",
};