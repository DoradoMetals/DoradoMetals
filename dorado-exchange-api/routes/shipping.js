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

const {
  getInboundShipment,
  getInboundShipmentTracking,
} = require("../controllers/shipping/shipmentController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

//FedEx
router.get("/validate_address", requireAuth, validateAddress);
router.post("/get_fedex_rates", requireAuth, getFedexRates);
router.post("/create_fedex_label", requireAuth, createFedexLabel);
router.post("/check_fedex_pickup_times", requireAuth, checkFedexPickupAvailability);
router.post("/schedule_fedex_pickup", requireAuth, scheduleFedexPickup);
router.post("/cancel_fedex_pickup", requireAuth, cancelFedexPickup);
router.post("/get_fedex_locations", requireAuth, getFedexLocations);

//Shipments
router.get("/get_inbound_shipment", requireAuth, getInboundShipment);
router.post("/get_inbound_shipment_tracking", requireAuth, getInboundShipmentTracking);

module.exports = router;
