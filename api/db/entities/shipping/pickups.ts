import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ShippingShipment } from '@/db/entities/shipping/shipments';

@Entity({ tableName: 'pickups', schema: 'shipping' })
export class ShippingPickup {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => ShippingShipment, { fieldName: 'shipment_id' })
  shipment!: ShippingShipment;

  @Property({ type: 'timestamp', nullable: true })
  requested_at?: Date;

  @Property({ type: 'text' })
  status!: string;

  @Property({ type: 'numeric', nullable: true })
  confirmation_number?: number;

  @Property({ type: 'text', nullable: true })
  location?: string;
}
