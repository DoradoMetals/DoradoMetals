import axios from "axios";
import pool from "#db";

export async function getFedExAccessToken() {
  const response = await axios.post(
    process.env.FEDEX_API_URL + "/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.FEDEX_CLIENT_ID,
      client_secret: process.env.FEDEX_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return response.data.access_token;
}

export async function getTrackingToken() {
  const response = await axios.post(
    process.env.FEDEX_API_URL + "/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.FEDEX_TRACKING_CLIENT_ID,
      client_secret: process.env.FEDEX_TRACKING_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return response.data.access_token;
}

export async function validateAddress(address) {
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
    fedexResult?.attributes?.Resolved === "true";

  const classification = fedexResult?.classification;
  const isResidential = classification !== "BUSINESS";

  return {
    is_valid: isValid,
    is_residential: isResidential,
  };
}

export async function getFedexRates(req, res) {
  const {
    shippingType,
    customerAddress,
    packageDetails,
    pickupType,
    declaredValue,
  } = req.body;
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
            declaredValue: declaredValue,
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
      carrierCodes: ["FDXE"],
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
}

export async function createFedexLabel(
  customerName,
  customerPhone,
  customerAddress,
  shippingType,
  packageDetails,
  pickupType,
  serviceType,
  declaredValue
) {
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
        totalDeclaredValue: declaredValue,
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
        shipmentSpecialServices: {
          specialServiceTypes: ["HOLD_AT_LOCATION"],
          holdAtLocationDetail: {
            locationId: "ADSK",
            locationContactAndAddress: {
              address: FEDEX_STORE_ADDRESS,
              contact: {
                phoneNumber: "9727880816",
                companyName: "FedEx Office Print & Ship Center",
              },
            },
            locationType: "FEDEX_OFFICE",
          },
        },
        emailNotificationDetail: {
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
                "ON_TENDER",
                "ON_SHIPMENT",
                "ON_EXCEPTION",
                "ON_ESTIMATED_DELIVERY",
                "ON_DELIVERY",
              ],
            },
          ],
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

    throw new Error("FedEx label generation failed");
  }
}

export async function cancelLabel(req, res) {
  const { tracking_number, shipment_id } = req.body;
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

    await pool.query(
      `UPDATE exchange.shipments SET shipping_status = $1 WHERE id = $2`,
      ["Cancelled", shipment_id]
    );

    res.json({ message: "Label cancelled." });
  } catch (error) {
    const response = error?.response?.data;
    console.error(
      "FedEx label cancellation failed:",
      JSON.stringify(response, null, 2)
    );

    throw new Error("FedEx label cancellation failed");
  }
}

export async function checkFedexPickupAvailability(req, res) {
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
}

export async function scheduleFedexPickup(
  customerName,
  customerPhone,
  customerAddress,
  pickupDate,
  pickupTime,
  code,
  trackingNumber
) {
  try {
    const token = await getFedExAccessToken();

    function pad(n) {
      return n.toString().padStart(2, "0");
    }

    function formatFedExLocalDateTime(date) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
      )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
        date.getSeconds()
      )}`;
    }

    function formatFedExLocalTime(date) {
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
        date.getSeconds()
      )}`;
    }

    const readyDate = new Date(`${pickupDate}T${pickupTime}`);
    const readyTimestamp = formatFedExLocalDateTime(readyDate);

    const closeDate = new Date(readyDate.getTime() + 2 * 60 * 60 * 1000);
    const customerCloseTime = formatFedExLocalTime(closeDate);

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
        customerCloseTime: customerCloseTime,
        packageLocation: "FRONT",
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
    const location = response.data?.output?.location;

    return { confirmationNumber, location };
  } catch (error) {
    const responseData = error?.response?.data ?? null;

    console.error("FedEx pickup scheduling failed FULL ERROR:");
    console.error("Raw error:", error.toString());
    if (error?.response) {
      console.error("Status:", error.response.status);
      console.error("Status Text:", error.response.statusText);
      console.error(
        "Headers:",
        JSON.stringify(error.response.headers, null, 2)
      );
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(
        "No response from FedEx API (likely network error or auth issue)"
      );
    }

    throw new Error("FedEx pickup scheduling failed");
  }
}

export async function cancelFedexPickup(req, res) {
  const { id, confirmationCode, pickupDate, location } = req.body;

  try {
    const token = await getFedExAccessToken();

    const cancelPayload = {
      associatedAccountNumber: {
        value: process.env.FEDEX_ACCOUNT_NUMBER,
      },
      pickupConfirmationCode: confirmationCode,
      scheduledDate: pickupDate,
      location: location,
    };

    const response = await axios.put(
      process.env.FEDEX_API_URL + "/pickup/v1/pickups/cancel",
      cancelPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const pickupResult = await pool.query(
      `SELECT order_id FROM exchange.carrier_pickups WHERE id = $1`,
      [id]
    );

    const order_id = pickupResult.rows[0]?.order_id;
    if (!order_id) {
      throw new Error("No order_id found for carrier pickup");
    }

    await pool.query(`DELETE FROM exchange.carrier_pickups WHERE id = $1`, [
      id,
    ]);

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
}

export async function getFedexLocations(req, res) {
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
}

export async function getFedexShipmentTracking(tracking_number) {
  try {
    const token = await getTrackingToken();
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
}
