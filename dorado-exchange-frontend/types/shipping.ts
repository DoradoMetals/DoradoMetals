import { Address } from "./address";

// FEDEX LABEL
export type FedexLabelAddress = {
  streetLines: string[];
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  countryCode: string;
};

export function formatFedexLabelAddress(address: Address) {
  return {
    streetLines: [address.line_1, address.line_2].filter(Boolean) as string[],
    city: address.city,
    stateOrProvinceCode: address.state,
    postalCode: address.zip,
    countryCode: address.country_code,
  };
}

export type FedexLabelInput = {
  order_id: string
  customerName: string
  customerPhone: string
  customerAddress: FedexLabelAddress
  shippingType: "Inbound" | "Outbound"
  pickupType: string
  packageDetails: {
    sequenceNumber: number
    weight: { units: "LB" | "KG"; value: number }
    dimensions: { length: number; width: number; height: number; units: "IN" | "CM" }
  }
  serviceType: string
}

export type FedexLabelResponse = {
  tracking_number: string
  label_url: string
}

// FEDEX RATES
export type FedexRatesAddress = {
  streetLines: string[];
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  countryCode: string;
  residential: boolean,
}

export function formatFedexRatesAddress(address: Address) {
  return {
    streetLines: [address.line_1, address.line_2].filter(Boolean) as string[],
    city: address.city,
    stateOrProvinceCode: address.state,
    postalCode: address.zip,
    countryCode: address.country_code,
    residential: address.is_residential,
  };
}

export type FedexRateInput = {
  shippingType: "Inbound" | "Outbound";
  customerAddress: FedexRatesAddress;
  packageDetails: {
    weight: { units: "LB" | "KG"; value: number };
    dimensions: { length: number; width: number; height: number; units: "IN" | "CM" };
  };
  pickupType: string;
};

export type FedexRate = {
  serviceType: string | null;
  packagingType: string | null;
  netCharge: number | null;
  currency: string;
  deliveryDay: string | null;
  transitTime: string | null;
  serviceDescription: string | null;
};