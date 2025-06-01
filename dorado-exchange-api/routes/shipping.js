const express = require("express");

const {
  validateAddress,
  getFedexRates,
  createFedexLabel,
  cancelLabel,
  scheduleFedexPickup,
  checkFedexPickupAvailability,
  cancelFedexPickup,
  getFedexLocations,
} = require("../controllers/shipping/fedexController");

const {
  getInboundShipment,
  getInboundShipmentTracking,
  getReturnShipment,
  getReturnShipmentTracking,
} = require("../controllers/shipping/shipmentController");

const { requireUser } = require("../middleware/authMiddleware");

const router = express.Router();

//FedEx
router.get("/validate_address", requireUser, validateAddress);
router.post("/get_fedex_rates", requireUser, getFedexRates);
router.post("/create_fedex_label", requireUser, createFedexLabel);
router.post("/cancel_fedex_label", requireUser, cancelLabel);
router.post("/check_fedex_pickup_times", requireUser, checkFedexPickupAvailability);
router.post("/schedule_fedex_pickup", requireUser, scheduleFedexPickup);
router.post("/cancel_fedex_pickup", requireUser, cancelFedexPickup);
router.post("/get_fedex_locations", requireUser, getFedexLocations);

//Shipments
router.get("/get_inbound_shipment", requireUser, getInboundShipment);
router.post("/get_inbound_shipment_tracking", requireUser, getInboundShipmentTracking);
router.get("/get_return_shipment", requireUser, getReturnShipment);
router.post("/get_return_shipment_tracking", requireUser, getReturnShipmentTracking);

module.exports = router;
