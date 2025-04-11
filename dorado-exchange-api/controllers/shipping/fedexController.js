const axios = require("axios");
const pool = require("../../db");

const DORADO_ADDRESS = {
  streetLines: [
    process.env.FEDEX_RETURN_ADDRESS_LINE_1,
    process.env.FEDEX_RETURN_ADDRESS_LINE_2,
  ],
  city: process.env.FEDEX_RETURN_CITY,
  stateOrProvinceCode: process.env.FEDEX_RETURN_STATE,
  postalCode: process.env.FEDEX_RETURN_ZIP,
  countryCode: process.env.FEDEX_RETURN_COUNTRY,
};

let fedexAccessToken = null;

const getFedExAccessToken = async () => {
  const response = await axios.post(
    process.env.FEDEX_OAUTH_URL,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.FEDEX_CLIENT_ID,
      client_secret: process.env.FEDEX_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  fedexAccessToken = response.data.access_token;
  return fedexAccessToken;
};

const validateAddress = async (address) => {
  const token = await getFedExAccessToken();

  const fedexPayload = {
    addressesToValidate: [
      {
        address: {
          streetLines: [address.line_1, address.line_2].filter(Boolean),
          city: address.city,
          stateOrProvinceCode: address.state,
          postalCode: address.zip,
          countryCode: address.country_code,
        },
        addressVerificationOptions: {
          checkResidentialStatus: true,
        },
      },
    ],
  };

  const response = await axios.post(
    process.env.FEDEX_ADDRESS_VALIDATION_URL,
    fedexPayload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const fedexResult = response.data?.output?.resolvedAddresses?.[0];

  const isValid =
    fedexResult?.attributes?.Matched === "true" &&
    fedexResult?.attributes?.ValidlyFormed === "true" &&
    fedexResult?.attributes?.CountrySupported === "true" &&
    fedexResult?.attributes?.Resolved === "true";

  const classification = fedexResult?.classification;
  const isResidential = classification !== "BUSINESS";

  return {
    is_valid: isValid,
    is_residential: isResidential,
  };
};

const getFedexRates = async (req, res) => {
  const { shippingType, customerAddress, packageDetails, pickupType } = req.body;

  const shipper = shippingType === "Inbound" ? customerAddress : DORADO_ADDRESS;
  const recipient =
    shippingType === "Inbound" ? DORADO_ADDRESS : customerAddress;

  try {
    const token = await getFedExAccessToken();

    const rateRequestPayload = {
      accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
      requestedShipment: {
        shipper: { address: shipper },
        recipient: { address: recipient },
        pickupType: pickupType,
        packagingType: "YOUR_PACKAGING",
        rateRequestType: ["PREFERRED", "LIST"],
        requestedPackageLineItems: [packageDetails],
        shippingChargesPayment: {
          paymentType: "SENDER",
          payor: {
            responsibleParty: {
              accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
            },
          },
        },
      },
    };

    const rateResponse = await axios.post(
      process.env.FEDEX_RATES_URL,
      rateRequestPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rateDetails = rateResponse.data?.output?.rateReplyDetails || [];
    const parsedRates = rateDetails.map((rate) => {
      const detail = rate.ratedShipmentDetails?.find(
        (d) => d.rateType === "ACCOUNT"
      );

      return {
        serviceType: rate.serviceType || null,
        packagingType: rate.packagingType || null,
        netCharge: detail?.totalNetCharge ?? null,
        currency: detail?.currency || "USD",
        deliveryDay: rate.commitDay || rate.deliveryDayOfWeek || null,
        transitTime: rate.transitTime || null,
        serviceDescription:
          rate.serviceDescription?.description || rate.serviceName || null,
      };
    });
    res.json({ rates: parsedRates });
  } catch (error) {
    const fedexError = error?.response?.data;
    console.error("FedEx rate request failed:", fedexError);

    const paramList = fedexError?.errors?.[0]?.parameterList;
    if (paramList) {
      console.dir(paramList, { depth: null });
    }

    res.status(500).json({ error: "FedEx rate request failed." });
  }
};

const createFedexLabel = async (req, res) => {
  const {
    order_id,
    customerName,
    customerPhone,
    customerAddress,
    shippingType,
    packageDetails,
    pickupType,
    serviceType,
  } = req.body;

  // console.log(req.body)
  const shipper = {
    contact: {
      personName:
        shippingType === "Inbound"
          ? customerName
          : process.env.FEDEX_DORADO_NAME,
      phoneNumber:
        shippingType === "Inbound"
          ? customerPhone
          : process.env.FEDEX_DORADO_PHONE_NUMBER,
    },
    address: shippingType === "Inbound" ? customerAddress : DORADO_ADDRESS,
  };

  const recipients = [
    {
      contact: {
        personName:
          shippingType === "Inbound"
            ? process.env.FEDEX_DORADO_NAME
            : customerName,
        phoneNumber:
          shippingType === "Inbound"
            ? process.env.FEDEX_DORADO_PHONE_NUMBER
            : customerPhone,
      },
      address: shippingType === "Inbound" ? DORADO_ADDRESS : customerAddress,
    },
  ];

  try {
    const token = await getFedExAccessToken();

    const shipmentPayload = {
      accountNumber: {
        value: process.env.FEDEX_ACCOUNT_NUMBER,
      },
      labelResponseOptions: "LABEL",
      requestedShipment: {
        shipper: shipper,
        recipients: recipients,
        packagingType: "YOUR_PACKAGING",
        serviceType: serviceType,
        pickupType: pickupType,
        groupPackageCount: 1,
        requestedPackageLineItems: [packageDetails],
        labelSpecification: {
          imageType: "PNG",
          labelStockType: "PAPER_4X6",
        },
        shippingChargesPayment: {
          paymentType: "SENDER",
          payor: {
            responsibleParty: {
              accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
            },
          },
        },
      },
    };

    const response = await axios.post(
      process.env.FEDEX_API_URL,
      shipmentPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const shipment = response.data?.output?.transactionShipments?.[0];
    if (!shipment) throw new Error("FedEx API did not return a shipment.");

    const piece = shipment.pieceResponses?.[0];
    const doc = piece?.packageDocuments?.[0];

    const tracking_number = shipment.masterTrackingNumber;
    const encodedLabel = doc?.encodedLabel;
    const labelFile = Buffer.from(encodedLabel, "base64");

    let insertQuery;
    if (shippingType === "Inbound") {
      insertQuery = 
      `
        INSERT INTO exchange.inbound_shipments (
          order_id, tracking_number, carrier, shipping_status, created_at, shipping_label
        )
        VALUES ($1, $2, $3, 'label_created', NOW(), $4)
      `;
    } else {
      insertQuery = 
      `
        INSERT INTO exchange.outbound_shipments (
          order_id, tracking_number, carrier, shipping_status, created_at, shipping_label
        )
        VALUES ($1, $2, $3, 'label_created', NOW(), $4)
      `;
    }

    await pool.query(insertQuery, [
      order_id,
      tracking_number,
      "FedEx",
      labelFile,
    ]);

    res.json({
      message: 'Label created!'
    });
  } catch (error) {
    console.error(
      "FedEx label creation failed:",
      JSON.stringify(error?.response?.data, null, 2) || error
    );
    res.status(500).json({ error: "FedEx label creation failed." });
  }
};



module.exports = {
  validateAddress,
  getFedexRates,
  createFedexLabel,
};
