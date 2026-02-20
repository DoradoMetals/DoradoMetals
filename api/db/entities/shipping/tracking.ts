import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ShippingShipment } from '@/db/entities/shipping/shipments';

@Entity({ tableName: 'tracking', schema: 'shipping' })
export class ShippingTracking {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => ShippingShipment, { fieldName: 'shipment_id' })
  shipment!: ShippingShipment;

  @Property({ type: 'text' })
  status!: string;

  @Property({ type: 'text', nullable: true })
  location?: string;

  @Property({ type: 'timestamp' })
  time!: Date;
}
