const axios = require("axios");
const pool = require("../../db");

let fedexAccessToken = null;

const getFedExAccessToken = async () => {
  const response = await axios.post(
    process.env.FEDEX_API_URL + "/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.FEDEX_TRACKING_CLIENT_ID,
      client_secret: process.env.FEDEX_TRACKING_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  fedexAccessToken = response.data.access_token;
  return fedexAccessToken;
};

const parseTracking = (trackingOutput) => {
  const windowInfo = trackingOutput.estimatedDeliveryTimeWindow?.window;
  const standardEnd = trackingOutput.standardTransitTimeWindow?.window?.ends;
  const fromDateTimes = trackingOutput.dateAndTimes?.find(
    (dt) => dt.type === "ESTIMATED_DELIVERY"
  )?.dateTime;

  const estimatedDeliveryTime = windowInfo?.ends
    ? windowInfo.ends
    : standardEnd
    ? standardEnd
    : fromDateTimes
    ? fromDateTimes
    : "TBD";

  const statusMap = {
    EP: "Enroute to Pickup",
    PD: "Pickup Delay",
    DD: "Delivery Delay",
    DE: "Delivery Exception",
    TD: "Delivery Attempted",
    OC: "Label Created",
    PU: "Picked Up",
    AR: "Arrived at FedEx Location",
    IT: "In Transit",
    OW: "On the Way",
    OD: "Out for Delivery",
    DL: "Delivered",
    HL: "Held at Location",
    PM: "In Progress",
    FD: "At FedEx Destination",
    PF: "Ready for Delivery",
    CH: "Location Changed",
    CL: "Clearance Delay",
    SD: "Shipment Delayed",
    SA: "Shipment Arrived",
    RR: "Return Received",
    DY: "Delayed",
    RS: "Returning to Shipper",

  };

  const relevantStatusCodes = Object.keys(statusMap);

  let scanEvents = (trackingOutput.scanEvents || [])
    .filter((event) => relevantStatusCodes.includes(event.derivedStatusCode))
    .map((event) => {
      const city =
        event.scanLocation?.city
          ?.toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase()) || "";
      const state = event.scanLocation?.stateOrProvinceCode || "";
      return {
        date: event.date,
        location: `${city}, ${state}`.trim(),
        status: statusMap[event.derivedStatusCode] || "Unknown",
      };
    });

  const derivedCode = trackingOutput.latestStatusDetail?.derivedCode;
  const latestStatus =
    derivedCode && statusMap[derivedCode] ? statusMap[derivedCode] : 'Status Unknown';

  const deliveredAt =
    trackingOutput.dateAndTimes?.find((dt) => dt.type === "ACTUAL_DELIVERY")
      ?.dateTime || null;

  return {
    estimatedDeliveryTime,
    scanEvents: scanEvents.reverse(),
    latestStatus,
    deliveredAt,
  };
};


const getFedexShipmentTracking = async (
  tracking_number,
) => {
  try {
    const token = await getFedExAccessToken();
    const trackingPayload = {
      includeDetailedScans: true,
      trackingInfo: [
        {
          trackingNumberInfo: {
            trackingNumber: tracking_number,
          },
        },
      ],
    };

    const response = await axios.post(
      process.env.FEDEX_API_URL + "/track/v1/trackingnumbers",
      trackingPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const trackingOutput =
      response.data.output.completeTrackResults[0].trackResults[0];

      
    return parseTracking(trackingOutput);
  } catch (error) {
    console.error("FedEx tracking failed:", error?.response?.data || error);
    throw new Error("FedEx shipment tracker failed");
  }
};

module.exports = {
  getFedexShipmentTracking,
};
