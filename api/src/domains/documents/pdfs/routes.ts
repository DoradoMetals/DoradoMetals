import express from 'express'

import {
  generatePackingList,
  generateReturnPackingList,
  generateInvoice,
  generateSalesOrderInvoice,
  generatePickupManifest,
  generateIntakeReceipt,
  generateShippingInstructions,
  generatePickupInstructions,
  generateAppointmentInstructions,
  generateAssayResults,
} from '#documents/pdfs/controller.ts'

import { requireUser } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/generate_packing_list', requireUser, generatePackingList)
router.post('/generate_return_packing_list', requireUser, generateReturnPackingList)
router.post('/generate_invoice', requireUser, generateInvoice)
router.post('/generate_sales_order_invoice', requireUser, generateSalesOrderInvoice)
router.post('/generate_pickup_manifest', requireUser, generatePickupManifest)
router.post('/generate_intake_receipt', requireUser, generateIntakeReceipt)
router.post('/generate_shipping_instructions', requireUser, generateShippingInstructions)
router.post('/generate_pickup_instructions', requireUser, generatePickupInstructions)
router.post('/generate_appointment_instructions', requireUser, generateAppointmentInstructions)
router.post('/generate_assay_results', requireUser, generateAssayResults)

export default router
