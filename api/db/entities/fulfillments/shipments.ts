import { Entity, PrimaryKey, ManyToOne } from '@mikro-orm/core';
import { Fulfillment } from '@/db/entities/fulfillments/fulfillments';

@Entity({ tableName: 'shipments', schema: 'fulfillments' })
export class FulfillmentShipment {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Fulfillment, { fieldName: 'fulfillment_id' })
  fulfillment!: Fulfillment;

  @ManyToOne(() => Object, { fieldName: 'recipient_location_id' })
  recipient_location!: any;

  @ManyToOne(() => Object, { fieldName: 'shipper_location_id' })
  shipper_location!: any;

  @ManyToOne(() => Object, { fieldName: 'shipment_id' })
  shipment!: any;
}
