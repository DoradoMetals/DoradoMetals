const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

// Replace with your actual FedEx API credentials (probably store in .env)
const FEDEX_API_URL = "https://apis.fedex.com/ship/v1/shipments";
const FEDEX_CLIENT_ID = process.env.FEDEX_CLIENT_ID;
const FEDEX_CLIENT_SECRET = process.env.FEDEX_CLIENT_SECRET;
const FEDEX_ACCOUNT_NUMBER = process.env.FEDEX_ACCOUNT_NUMBER;
const FEDEX_METER_NUMBER = process.env.FEDEX_METER_NUMBER;
const YOUR_ADDRESS = {
  streetLines: ["123 Your Street"],
  city: "YourCity",
  stateOrProvinceCode: "CA",
  postalCode: "90001",
  countryCode: "US",
};

let fedexAccessToken = null;

const getFedExAccessToken = async () => {
  const response = await axios.post(
    "https://apis.fedex.com/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: FEDEX_CLIENT_ID,
      client_secret: FEDEX_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  fedexAccessToken = response.data.access_token;
  return fedexAccessToken;
};

const createInboundLabel = async (req, res) => {
  const { customerAddress, order_id } = req.body;

  try {
    const token = await getFedExAccessToken();

    const shipmentPayload = {
      accountNumber: {
        value: FEDEX_ACCOUNT_NUMBER,
      },
      requestedShipment: {
        shipper: {
          address: customerAddress,
        },
        recipient: {
          address: YOUR_ADDRESS,
        },
        packagingType: "YOUR_PACKAGING",
        serviceType: "FEDEX_GROUND",
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        labelSpecification: {
          imageType: "PDF",
          labelStockType: "PAPER_7X4.75",
        },
        shippingChargesPayment: {
          paymentType: "SENDER",
          payor: {
            responsibleParty: {
              accountNumber: { value: FEDEX_ACCOUNT_NUMBER },
            },
          },
        },
        requestedPackageLineItems: [
          {
            weight: {
              value: 2,
              units: "LB",
            },
            dimensions: {
              length: 10,
              width: 6,
              height: 4,
              units: "IN",
            },
          },
        ],
      },
    };

    const response = await axios.post(FEDEX_API_URL, shipmentPayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const shipment = response.data.output.transactionShipments[0];
    const tracking_number = shipment.masterTrackingNumber.trackingNumber;
    const label = shipment.completedPackageDetails[0].label.pdfUrl;

    const insertQuery = `
      INSERT INTO exchange.shipments (
        id, order_id, tracking_number, carrier, shipping_label, shipping_status, created_at
      )
      VALUES ($1, $2, $3, 'fedex', $4, 'label_created', NOW())
    `;
    await pool.query(insertQuery, [
      uuidv4(),
      order_id,
      tracking_number,
      label,
    ]);

    res.json({
      tracking_number,
      label_url: label,
    });
  } catch (error) {
    console.error("FedEx label creation failed:", error?.response?.data || error);
    res.status(500).json({ error: "FedEx label creation failed." });
  }
};

module.exports = {
  createInboundLabel,
};
