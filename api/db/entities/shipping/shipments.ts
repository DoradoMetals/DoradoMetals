import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ShippingCarrier } from '@/db/entities/shipping/carriers';
import { ShippingPackage } from '@/db/entities/shipping/packages';

@Entity({ tableName: 'shipments', schema: 'shipping' })
export class ShippingShipment {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => ShippingCarrier, { fieldName: 'carrier_service_id' })
  carrier_service!: ShippingCarrier;

  @ManyToOne(() => ShippingPackage, { fieldName: 'package_id' })
  package!: ShippingPackage;

  @Property({ type: 'uuid' })
  recipient_address_id!: string;

  @Property({ type: 'uuid' })
  shipper_address_id!: string;

  @Property({ type: 'text', nullable: true })
  tracking_number?: string;

  @Property({ type: 'timestamp', nullable: true })
  delivered_at?: Date;

  @Property({ type: 'timestamp', nullable: true })
  est_delivery?: Date;

  @Property({ type: 'text', nullable: true })
  label_type?: string;

  @Property({ type: 'bytea', nullable: true })
  label?: Buffer;

  @Property({ type: 'text' })
  direction!: string;

  @Property({ type: 'boolean', default: false })
  insured!: boolean;

  @Property({ type: 'numeric', nullable: true })
  declared_value?: number;

  @Property({ type: 'numeric', nullable: true })
  cost?: number;

  @Property({ type: 'numeric', nullable: true })
  actual_cost?: number;
}
