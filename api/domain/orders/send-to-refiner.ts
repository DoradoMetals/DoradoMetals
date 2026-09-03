// Sending a sales order to a refiner: they ship the metal to the customer.
//
// THE RECORD FIRST, THE EMAIL SECOND. The other order lets metal leave the
// building against a transaction that then rolls back; this one's worst case is
// an order marked sent whose email did not arrive, which an admin can resend.
import * as ordersRepo from "#db/orders/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as readService from "#domain/orders/read.service.ts";
import * as refinerService from "#domain/refiners/service.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as emailService from "#domain/media/emails/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { refuseWith as refuse } from "#shared/http/refuse.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";

type SaleForRefiner = {
  id: string;
  number: number | string;
  order_sent?: boolean | null;
  supplier_id?: string | null;
  address?: unknown;
};

// `transport` is a SEPARATE parameter, not a field on the input: the controller
// hands req.body straight through, so a field would be reachable from a request.
export async function sendOrderToRefiner(
  {
    order,
    spots,
    supplier_id,
  }: { order: { id: string }; spots: PricingSpot[]; supplier_id: string },
  transport?: Transport
): Promise<unknown> {
  const sale = (await readService.findSaleById(order.id)) as SaleForRefiner | null;

  // AN ORDER THAT DOES NOT EXIST MUST NOT REACH A REFINER: a 404 here is the
  // difference between refusing and starting the sequence against nothing.
  if (!sale) refuse(404, `no sales order ${order.id}`);

  // An order with no address cannot be sent: the message exists to say where to
  // ship the metal, and production holds a sales order with address_id NULL.
  if (!sale!.address) {
    throw new Error(
      `Sales order ${sale!.number} has no address, so it cannot be sent to a supplier`
    );
  }

  // A sent order may be RE-SENT to the same refiner (the resend path the email
  // failure needs) and never MOVED to another: two refiners would each hold it.
  const alreadySent = sale!.order_sent === true;
  if (alreadySent && sale!.supplier_id !== supplier_id) {
    refuse(
      409,
      `Sales order ${sale!.number} has already been sent to a refiner. ` +
        `Sending it to a different one would leave two refiners holding it.`
    );
  }

  // supplier.organization.email, NOT supplier.email - a refiner has no top-level
  // one. Refused BEFORE the transaction; production holds a refiner with none.
  const supplier = await refinerService.getRefinerFromId(supplier_id);
  const supplierEmail = supplier?.organization?.email;
  if (!supplierEmail) {
    refuse(
      422,
      `Refiner ${supplier?.organization?.name ?? supplier_id} has no email address, ` +
        `so sales order ${sale!.number} cannot be sent to them`
    );
  }

  // Skipped on a resend: running it again is what created a second shipment.
  if (!alreadySent) {
    await withTransaction(async (client) => {
      // The engagement owns which refinery has the metal (refiners.orders, 093).
      const engagementId = await refinerOrders.ensureForOrder(sale!.id, client);
      const attached = await refinerOrders.update(
        engagementId, { refiner_id: supplier_id }, client
      );
      if (!attached) {
        throw new Error(
          `sales order ${sale!.id}: the refiner was not attached - this ` +
            `transaction must not commit`
        );
      }

      await shipmentService.create({ sales_order_id: sale!.id, type: "Outbound" }, client);
      await ordersRepo.update(sale!.id, { order_sent: true }, {}, client);
    });
  }

  await emailService.sendSalesOrderToSupplier(sale as never, spots, supplierEmail!, transport);

  return await readService.findSaleById(sale!.id);
}
