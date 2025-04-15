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
  const { shippingType, customerAddress, packageDetails, pickupType } =
    req.body;
  const shipper = shippingType === "Inbound" ? customerAddress : DORADO_ADDRESS;
  const recipient =
    shippingType === "Inbound" ? DORADO_ADDRESS : customerAddress;

  try {
    const token = await getFedExAccessToken();

    const rateRequestPayload = {
      accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
      rateRequestControlParameters: {
        returnTransitTimes: true,
      },
      requestedShipment: {
        shipDateStamp: new Date().toISOString().split("T")[0], // YYYY-MM-DD
        shipper: { address: shipper },
        recipient: { address: recipient },
        pickupType: pickupType,
        packagingType: "YOUR_PACKAGING",
        preferredCurrency: "USD", // optional but helpful
        rateRequestType: ["PREFERRED", "LIST"],
        requestedPackageLineItems: [
          {
            ...packageDetails,
            groupPackageCount: "1",
          },
        ],
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
        deliveryDay: rate.commit?.dateDetail?.dayOfWeek || null,
        transitTime: rate.commit?.dateDetail?.dayFormat || null,
        serviceDescription: rate.serviceDescription?.description || rate.serviceName || null,
      };
    });
    console.log(parsedRates)
    res.json(parsedRates);
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
      insertQuery = `
        INSERT INTO exchange.inbound_shipments (
          order_id, tracking_number, carrier, shipping_status, created_at, shipping_label
        )
        VALUES ($1, $2, $3, 'label_created', NOW(), $4)
      `;
    } else {
      insertQuery = `
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
      message: "Label created!",
    });
  } catch (error) {
    console.error(
      "FedEx label creation failed:",
      JSON.stringify(error?.response?.data, null, 2) || error
    );
    res.status(500).json({ error: "FedEx label creation failed." });
  }
};

const scheduleFedexPickup = async (req, res) => {
  // const {
  //   order_id,
  //   customerName,
  //   customerPhone,
  //   customerAddress,
  //   pickupType,
  //   pickupDateTime,
  //   readyDateTime,
  //   packageLocation = "FRONT",
  //   packageCount = 1,
  //   weight = { units: "LB", value: 1 },
  // } = req.body;

  const {
    order_id,
    customerName = "Jacob Johnson",
    customerPhone = "5551234567",
    customerAddress = {
      line_1: "123 Elm Street",
      line_2: "Apt 4B",
      city: "Dallas",
      state: "TX",
      zip: "75229",
      country_code: "US",
    },
  } = req.body;

  const pickupType = "ON_CALL";
  const pickupDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
  const readyDateTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now
  const packageLocation = "FRONT";
  const packageCount = 1;
  const weight = { units: "LB", value: 2 };

  const pickupAddress = {
    streetLines: [customerAddress.line_1, customerAddress.line_2].filter(
      Boolean
    ),
    city: customerAddress.city,
    stateOrProvinceCode: customerAddress.state,
    postalCode: customerAddress.zip,
    countryCode: customerAddress.country_code,
  };

  const contactInfo = {
    personName: customerName,
    phoneNumber: customerPhone,
  };

  try {
    const token = await getFedExAccessToken();

    const pickupPayload = {
      associatedAccountNumber: {
        value: process.env.FEDEX_ACCOUNT_NUMBER,
      },
      originDetail: {
        pickupLocation: {
          contact: {
            personName: customerName,
            phoneNumber: customerPhone,
          },
          address: pickupAddress,
          deliveryInstructions: "Leave at front door",
        },
        readyDateTimestamp: readyDateTime || new Date().toISOString(), // fallback to now
        customerCloseTime: "17:00:00", // REQUIRED — fallback default business hours
        pickupDateType: "FUTURE_DAY",
        packageLocation,
      },
      customerContact: contactInfo,
      pickupType, // e.g., "ON_CALL"
      totalWeight: weight,
      packageCount,
      carrierCode: "FDXE", // FDXG (FedEx Ground) or FDXE (Express)
    };

    const response = await axios.post(
      process.env.FEDEX_PICKUP_URL,
      pickupPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const confirmationNumber = response.data?.output?.pickupConfirmationNumber;

    // Store pickup request (optional)
    const insertQuery = `
      INSERT INTO exchange.carrier_pickups (
        order_id,
        carrier,
        pickup_confirmation_number,
        scheduled_time,
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
    `;

    await pool.query(insertQuery, [
      order_id,
      "FedEx",
      confirmationNumber,
      pickupDateTime,
    ]);

    res.json({
      message: "FedEx pickup scheduled.",
      confirmationNumber,
    });
  } catch (error) {
    console.error(
      "FedEx pickup scheduling failed:",
      JSON.stringify(error?.response?.data, null, 2) || error
    );
    res.status(500).json({ error: "FedEx pickup scheduling failed." });
  }
};

module.exports = {
  validateAddress,
  getFedexRates,
  createFedexLabel,
  scheduleFedexPickup,
};
