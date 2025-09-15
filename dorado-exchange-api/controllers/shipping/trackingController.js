import axios from "axios";

let fedexAccessToken = null;

export async function  getFedExAccessToken  () {
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

function parseTracking (trackingOutput) {
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

  const relevantStatusCodes = Object.keys(statusMap);

  let scanEvents = (trackingOutput.scanEvents || [])
    .filter((event) => relevantStatusCodes.includes(event.eventType))
    .map((event) => {
      const city =
        event.scanLocation?.city
          ?.toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase()) || "";
      const state = event.scanLocation?.stateOrProvinceCode || "";
      return {
        date: event.date,
        location: `${city}, ${state}`.trim(),
        status: statusMap[event.eventType] || "Unknown",
      };
    })
    .reverse();

  const latestStatus =
    scanEvents[scanEvents.length - 1]?.status || "Status Unknown";

  const deliveredAt =
    scanEvents.find((event) => event.status === "Delivered")?.date || null;

  return {
    estimatedDeliveryTime,
    scanEvents,
    latestStatus,
    deliveredAt,
  };
};

export async function  getFedexShipmentTracking (tracking_number){
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
