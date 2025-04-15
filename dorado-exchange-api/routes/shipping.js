const express = require("express");
const {
  validateAddress,
  getFedexRates,
  createFedexLabel,
  scheduleFedexPickup,
} = require("../controllers/shipping/fedexController");
const { getInboundShipment } = require("../controllers/shipping/shipmentController");

const router = express.Router();

//FedEx
router.get("/validate_address", validateAddress);
router.post("/get_fedex_rates", getFedexRates);
router.post("/create_fedex_label", createFedexLabel);
router.post("/schedule_fedex_pickup", scheduleFedexPickup);

//Shipments
router.get("/get_inbound_shipment", getInboundShipment);
module.exports = router;
