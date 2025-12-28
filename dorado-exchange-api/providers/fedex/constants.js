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

export const DEFAULT_HOLD_AT_LOCATION_DETAIL = {
  locationId: "ADSK",
  locationContactAndAddress: {
    address: FEDEX_STORE_ADDRESS,
    contact: {
      phoneNumber: "9727880816",
      companyName: "FedEx Office Print & Ship Center",
    },
  },
  locationType: "FEDEX_OFFICE",
};

export const DEFAULT_EMAIL_NOTIFICATION_DETAIL = {
  aggregationType: "PER_SHIPMENT",
  emailNotificationRecipients: [
    {
      name: "Dorado Shipping",
      emailNotificationRecipientType: "RECIPIENT",
      emailAddress: "shipping@doradometals.com",
      notificationFormatType: "HTML",
      notificationType: "EMAIL",
      locale: "en_US",
      notificationEventType: [
        "ON_SHIPMENT",
        "ON_EXCEPTION",
        "ON_ESTIMATED_DELIVERY",
        "ON_DELIVERY",
      ],
    },
  ],
};

export const FEDEX_TRACKING_STATUS_MAP = {
  OC: "Label Created",
  DO: "Dropped Off",
  LC: "Return Label Cancelled",
  DS: "Vehicle Dispatched",
  PD: "Pickup Delayed",
  CA: "Cancelled",
  PU: "Picked Up",
  US: "Delivery Updated",
  RD: "Return Label Expired",
  IP: "In Fedex Possession",
  HP: "Delivered",
  RG: "Return Label Expiring Soon",
  RP: "Return Label Sent",
  RS: "Returning to Shipper",

  AR: "In Transit",
  AF: "In Transit",
  AC: "At Canada Post",
  IT: "In Transit",
  OX: "Information Sent To USPS",
  PM: "In Progress",
  DP: "In Transit",
  DR: "Vehicle Unused",
  CP: "Clearance",
  EA: "Export Approved",
  IN: "On Demand Care Complete",
  MD: "Manifest",
  TR: "Enroute to Delivery",
  CC: "International Release",
  RC: "Delivery Option Cancelled",
  CH: "Location Changed",

  OD: "Out for Delivery",
  DL: "Delivered",

  DD: "Delivery Delayed",
  DE: "Delivery Exception",
  SE: "Shipment Exception",
  CD: "Clearance Delay",

  AE: "In Transit",
  AO: "In Transit",
  DY: "Delivery Updated",

  RR: "Delivery Option Requested",
  RM: "Delivery Option Updated",
  HA: "Hold at Location Accepted",
  RT: "Return Requested",
  RA: "Address Change Requested",
  PR: "Address Changed",
  AS: "Address Corrected",
};
