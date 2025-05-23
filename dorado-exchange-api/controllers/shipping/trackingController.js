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
  const estimatedDeliveryTime =
    trackingOutput.estimatedDeliveryTimeWindow?.window.ends || "TBD";

  const statusMap = {
    PU: "Picked Up",
    IT: "In Transit",
    OC: "Out for Delivery",
    DL: "Delivered",
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
    derivedCode && statusMap[derivedCode] ? statusMap[derivedCode] : null;

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

const updateFedexShipmentTracking = async (
  shipment_start,
  shipment_end,
  tracking_number,
  inbound_shipment,
  outbound_shipment,
  return_shipment
) => {
  try {
    console.log(tracking_number, shipment_end, shipment_start);
    const token = await getFedExAccessToken();
    const trackingPayload = {
      includeDetailedScans: true,
      trackingInfo: [
        {
          shipDateEnd: shipment_end,
          shipDateBegin: shipment_start,
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
    const trackingInfo = parseTracking(trackingOutput);

    if (inbound_shipment) {
      await pool.query(
        `DELETE FROM exchange.shipment_tracking_events WHERE inbound_shipment_id = $1`,
        [inbound_shipment]
      );
    } else if (outbound_shipment) {
      await pool.query(
        `DELETE FROM exchange.shipment_tracking_events WHERE outbound_shipment_id = $1`,
        [outbound_shipment]
      );
    } else if (return_shipment) {
      await pool.query(
        `DELETE FROM exchange.shipment_tracking_events WHERE return_shipment_id = $1`,
        [return_shipment]
      );
    }

    for (const event of trackingInfo.scanEvents) {
      await pool.query(
        `
          INSERT INTO exchange.shipment_tracking_events (
            inbound_shipment_id,
            outbound_shipment_id,
            return_shipment_id,
            status,
            location,
            scan_time
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          inbound_shipment,
          outbound_shipment,
          return_shipment,
          event.status,
          event.location,
          event.date,
        ]
      );
    }

    if (trackingInfo.latestStatus) {
      if (inbound_shipment) {
        await pool.query(
          `
        UPDATE exchange.inbound_shipments
        SET shipping_status = $1, estimated_delivery = $2, delivered_at = $3
        WHERE id = $4
      `,
          [
            trackingInfo.latestStatus,
            trackingInfo.estimatedDeliveryTime === "TBD"
              ? null
              : trackingInfo.estimatedDeliveryTime,
            trackingInfo.deliveredAt,
            inbound_shipment,
          ]
        );
      } else if (outbound_shipment) {
        await pool.query(
          `
        UPDATE exchange.outbound_shipments
        SET shipping_status = $1, estimated_delivery = $2, delivered_at = $3
        WHERE id = $4
      `,
          [
            trackingInfo.latestStatus,
            trackingInfo.estimatedDeliveryTime === "TBD"
              ? null
              : trackingInfo.estimatedDeliveryTime,
            trackingInfo.deliveredAt,
            outbound_shipment,
          ]
        );
      } else if (return_shipment) {
        await pool.query(
          `
        UPDATE exchange.return_shipments
        SET shipping_status = $1, estimated_delivery = $2, delivered_at = $3
        WHERE id = $4
      `,
          [
            trackingInfo.latestStatus,
            trackingInfo.estimatedDeliveryTime === "TBD"
              ? null
              : trackingInfo.estimatedDeliveryTime,
            trackingInfo.deliveredAt,
            return_shipment,
          ]
        );
      }
    }
  } catch (error) {
    console.error("FedEx tracking failed:", error?.response?.data || error);
    throw new Error("FedEx shipment tracker failed");
  }
};

module.exports = {
  updateFedexShipmentTracking,
};
