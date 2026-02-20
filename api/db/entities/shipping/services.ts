import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ShippingCarrier } from '@/db/entities/shipping/carriers';

@Entity({ tableName: 'services', schema: 'shipping' })
export class ShippingService {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => ShippingCarrier, { fieldName: 'carrier_id' })
  carrier!: ShippingCarrier;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'text' })
  code!: string;

  @Property({ type: 'text', nullable: true })
  provider_code?: string;

  @Property({ type: 'boolean', default: false })
  supports_pickup!: boolean;

  @Property({ type: 'boolean', default: false })
  supports_dropoff!: boolean;

  @Property({ type: 'boolean', default: false })
  supports_return!: boolean;

  @Property({ type: 'boolean', default: false })
  supports_insurance!: boolean;

  @Property({ type: 'boolean', default: false })
  is_international!: boolean;

  @Property({ type: 'boolean', default: false })
  is_residential!: boolean;

  @Property({ type: 'boolean', default: false })
  is_active!: boolean;

  @Property({ type: 'numeric', nullable: true })
  max_weight_lb?: number;

  @Property({ type: 'numeric', nullable: true })
  max_length_in?: number;

  @Property({ type: 'numeric', nullable: true })
  max_width_in?: number;

  @Property({ type: 'numeric', nullable: true })
  max_height_in?: number;

  @Property({ type: 'numeric', nullable: true })
  max_declared_value?: number;

  @Property({ type: 'integer', nullable: true })
  min_transit_days?: number;

  @Property({ type: 'integer', nullable: true })
  max_transit_days?: number;

  @Property({ type: 'integer', nullable: true })
  display_order?: number;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;
}
