const express = require("express");
const {
  validateAddress,
  getFedexRates,
  createFedexLabel,
  scheduleFedexPickup,
  checkFedexPickupAvailability,
  cancelFedexPickup,
  getFedexLocations,
} = require("../controllers/shipping/fedexController");
const { getInboundShipment } = require("../controllers/shipping/shipmentController");

const router = express.Router();

//FedEx
router.get("/validate_address", validateAddress);
router.post("/get_fedex_rates", getFedexRates);
router.post("/create_fedex_label", createFedexLabel);
router.post("/check_fedex_pickup_times", checkFedexPickupAvailability)
router.post("/schedule_fedex_pickup", scheduleFedexPickup);
router.post("/cancel_fedex_pickup", cancelFedexPickup);
router.post("/get_fedex_locations", getFedexLocations);

//Shipments
router.get("/get_inbound_shipment", getInboundShipment);
module.exports = router;
