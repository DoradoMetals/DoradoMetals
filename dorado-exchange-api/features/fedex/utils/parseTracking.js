export function parseTracking (trackingOutput) {
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