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

const formatAddressForFedEx = (address) => {
  return {
    streetLines: [address.line_1, address.line_2].filter(Boolean),
    city: address.city,
    stateOrProvinceCode: address.state,
    postalCode: address.zip,
    countryCode: address.country_code,
    residential: address.is_residential ?? true,
  };
};

const getFedExAccessToken = async () => {
  const response = await axios.post(
    process.env.FEDEX_API_URL + "/oauth/token",
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
    process.env.FEDEX_API_URL + "/address/v1/addresses/resolve",
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
      process.env.FEDEX_API_URL + "/rate/v1/comprehensiverates/quotes",
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
        serviceDescription:
          rate.serviceDescription?.description || rate.serviceName || null,
      };
    });
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

const createFedexLabel = async (
  customerName,
  customerPhone,
  customerAddress,
  shippingType,
  packageDetails,
  pickupType,
  serviceType
) => {
  try {
    const token = await getFedExAccessToken();

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

    const shipmentPayload = {
      accountNumber: {
        value: process.env.FEDEX_ACCOUNT_NUMBER,
      },
      labelResponseOptions: "LABEL",
      requestedShipment: {
        shipper,
        recipients,
        packagingType: "YOUR_PACKAGING",
        serviceType,
        pickupType,
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
              accountNumber: {
                value: process.env.FEDEX_ACCOUNT_NUMBER,
              },
            },
          },
        },
      },
    };

    const response = await axios.post(
      `${process.env.FEDEX_API_URL}/ship/v1/shipments`,
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

    return {
      tracking_number: shipment.masterTrackingNumber,
      labelFile: doc?.encodedLabel,
    };
  } catch (error) {
    const response = error?.response?.data;
    console.error(
      "FedEx label generation failed:",
      JSON.stringify(response, null, 2)
    );

    const paramList = response?.errors?.[0]?.parameterList;
    if (paramList) {
      console.log(
        "Parameter validation errors:",
        JSON.stringify(paramList, null, 2)
      );
    }

    throw new Error("FedEx label generation failed");
  }
};

const cancelLabel = async (req, res) => {
  const { tracking_number, shipment_id } = req.body
  try {
    const token = await getFedExAccessToken();
    const cancelPayload = {
      accountNumber: {
        value: process.env.FEDEX_ACCOUNT_NUMBER,
      },
      trackingNumber: tracking_number,
    };

    const response = await axios.put(
      `${process.env.FEDEX_API_URL}/ship/v1/shipments/cancel`,
      cancelPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.output.cancelledShipment === true) {
      await pool.query(
        `
        UPDATE exchange.inbound_shipments
        SET shipping_label = $1
        WHERE id = $2
      `,
        [null, shipment_id]
      );
    }

    res.json({ message: "Label cancelled." });
  } catch (error) {
    const response = error?.response?.data;
    console.error(
      "FedEx label cancellation failed:",
      JSON.stringify(response, null, 2)
    );

    const paramList = response?.errors?.[0]?.parameterList;
    if (paramList) {
      console.log(
        "Parameter validation errors:",
        JSON.stringify(paramList, null, 2)
      );
    }

    throw new Error("FedEx label cancellation failed");
  }
};

const checkFedexPickupAvailability = async (req, res) => {
  const { customerAddress, code } = req.body;

  try {
    const token = await getFedExAccessToken();

    const now = new Date();
    const readyDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const packageReadyTime = readyDate.toTimeString().split(" ")[0];

    const pickupPayload = {
      pickupAddress: customerAddress,
      pickupRequestType: ["FUTURE_DAY"],
      carriers: [code],
      countryRelationship: "DOMESTIC",
      numberOfBusinessDays: 3,
      associatedAccountNumber: process.env.FEDEX_ACCOUNT_NUMBER,
      packageReadyTime: packageReadyTime,
    };

    const response = await axios.post(
      process.env.FEDEX_API_URL + "/pickup/v1/pickups/availabilities",
      pickupPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const times = response.data?.output?.options || [];

    const formatted = times
      .map((option) => {
        const filteredTimes = option.readyTimeOptions.filter((t) => {
          const fullSlot = new Date(`${option.pickupDate}T${t}`);
          return fullSlot.getTime() >= readyDate.getTime();
        });

        return {
          pickupDate: option.pickupDate,
          times: filteredTimes,
        };
      })
      .filter((entry) => entry.times.length > 0);

    res.json(formatted);
  } catch (error) {
    console.error(
      "FedEx pickup availability check failed:",
      error?.response?.data || error
    );
    res
      .status(500)
      .json({ error: "Failed to check FedEx pickup availability." });
  }
};

const scheduleFedexPickup = async (
  customerName,
  customerPhone,
  customerAddress,
  pickupDate,
  pickupTime,
  code,
  trackingNumber
) => {
  try {
    const token = await getFedExAccessToken();

    const readyTimestamp = new Date(
      `${pickupDate}T${pickupTime}Z`
    ).toISOString();
    const closeTime = new Date(
      new Date(`${pickupDate}T${pickupTime}Z`).getTime() + 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[1]
      .slice(0, 8);

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
          address: customerAddress,
        },
        readyDateTimestamp: readyTimestamp,
        customerCloseTime: closeTime,
        packageLocation: 'FRONT',
      },
      trackingNumber,
      carrierCode: code,
    };

    const response = await axios.post(
      `${process.env.FEDEX_API_URL}/pickup/v1/pickups`,
      pickupPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const confirmationNumber = response.data?.output?.pickupConfirmationCode;

    return { confirmationNumber };
  } catch (error) {
    const responseData = error?.response?.data;
    console.error("FedEx pickup scheduling failed FULL ERROR:", JSON.stringify({
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      headers: error?.response?.headers,
      data: error?.response?.data,
    }, null, 2));

    const errors = responseData?.errors;
    if (Array.isArray(errors)) {
      errors.forEach((err, i) => {
        console.error(`Error ${i + 1}:`, JSON.stringify(err, null, 2));
      });
    }

    throw new Error("FedEx pickup scheduling failed");
  }
};

const cancelFedexPickup = async (req, res) => {
  const { confirmationNumber, pickupDate, code } = req.body;

  try {
    const token = await getFedExAccessToken();

    const cancelPayload = {
      associatedAccountNumber: {
        value: process.env.FEDEX_ACCOUNT_NUMBER,
      },
      pickupConfirmationCode: confirmationNumber,
      scheduledDate: pickupDate,
      carrierCode: code,
    };

    const response = await axios.post(
      process.env.FEDEX_API_URL + "/pickup/v1/pickups/cancel",
      cancelPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      message: "Pickup successfully canceled.",
      fedexResponse: response.data,
    });
  } catch (error) {
    console.error(
      "FedEx pickup cancellation failed:",
      JSON.stringify(error?.response?.data, null, 2) || error
    );
    res.status(500).json({ error: "FedEx pickup cancellation failed." });
  }
};

const getFedexLocations = async (req, res) => {
  const { customerAddress, radiusMiles = 25, maxResults = 10 } = req.body;

  try {
    const token = await getFedExAccessToken();

    const payload = {
      locationsSummaryRequestControlParameters: {
        distance: {
          units: "MI",
          value: radiusMiles,
        },
        maxResults,
      },
      constraints: {
        locationContentOptions: ["LOCATION_DROPOFF_TIMES"],
        excludeUnavailableLocations: true,
      },
      locationSearchCriterion: "ADDRESS",
      location: {
        address: customerAddress,
      },
      multipleMatchesAction: "RETURN_ALL",
      sort: {
        criteria: "DISTANCE",
        order: "ASCENDING",
      },
      locationTypes: ["FEDEX_AUTHORIZED_SHIP_CENTER", "FEDEX_OFFICE"],
    };

    const response = await axios.post(
      process.env.FEDEX_API_URL + "/location/v1/locations",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawLocations = response.data?.output?.locationDetailList ?? [];

    const locations = rawLocations.map((loc) => ({
      locationId: loc.locationId,
      locationType: loc.locationType,
      distance: {
        value: loc.distance?.value ?? null,
        units: loc.distance?.units ?? "MI",
      },
      address: {
        streetLines: loc.contactAndAddress?.address?.streetLines ?? [],
        city: loc.contactAndAddress?.address?.city ?? "",
        stateOrProvinceCode:
          loc.contactAndAddress?.address?.stateOrProvinceCode ?? "",
        postalCode: loc.contactAndAddress?.address?.postalCode ?? "",
        countryCode: loc.contactAndAddress?.address?.countryCode ?? "",
      },
      contact: {
        companyName: loc.contactAndAddress?.contact?.companyName ?? "",
        phoneNumber: loc.contactAndAddress?.contact?.phoneNumber ?? "",
      },
      operatingHours: Array.isArray(loc.storeHours)
        ? loc.storeHours.reduce((acc, block) => {
            const day = block.dayOfWeek?.toUpperCase?.();
            const hours = block.operationalHours;

            if (!day) return acc;

            if (hours?.begins && hours?.ends) {
              acc[day] = `${hours.begins} - ${hours.ends}`;
            } else {
              acc[day] = "Closed";
            }

            return acc;
          }, {})
        : undefined,
      geoPositionalCoordinates: loc.geoPositionalCoordinates ?? null,
    }));

    res.json({
      matchedAddressGeoCoord: response.data?.output?.matchedAddressGeoCoord,
      locations: locations,
    });
  } catch (error) {
    console.error(
      "FedEx location search failed:",
      JSON.stringify(error?.response?.data, null, 2) || error
    );
    res.status(500).json({ error: "FedEx location search failed." });
  }
};

module.exports = {
  formatAddressForFedEx,
  validateAddress,
  getFedexRates,
  createFedexLabel,
  cancelLabel,
  checkFedexPickupAvailability,
  scheduleFedexPickup,
  cancelFedexPickup,
  getFedexLocations,
};
