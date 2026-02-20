import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Image } from '@/db/entities/core/images';

@Entity({ tableName: 'methods', schema: 'payments' })
export class PaymentMethod {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Image, { fieldName: 'image_id', nullable: true })
  image?: Image;

  @Property({ type: 'text' })
  direction!: string;

  @Property({ type: 'text' })
  type!: string;

  @Property({ type: 'text' })
  currency!: string;

  @Property({ type: 'numeric', nullable: true })
  min_amount?: number;

  @Property({ type: 'numeric', nullable: true })
  max_amount?: number;

  @Property({ type: 'boolean', default: true })
  enabled!: boolean;

  @Property({ type: 'boolean', default: false })
  supports_partial!: boolean;

  @Property({ type: 'boolean', default: false })
  supports_split!: boolean;

  @Property({ type: 'text', nullable: true })
  provider?: string;

  @Property({ type: 'text', nullable: true })
  provider_value?: string;

  @Property({ type: 'numeric', nullable: true })
  flat_fee?: number;

  @Property({ type: 'numeric', nullable: true })
  surcharge_percent?: number;

  @Property({ type: 'text', nullable: true })
  time_delay?: string;

  @Property({ type: 'text', nullable: true })
  label?: string;

  @Property({ type: 'text', nullable: true })
  surcharge_label?: string;

  @Property({ type: 'text', nullable: true })
  short_description?: string;

  @Property({ type: 'text', nullable: true })
  long_description?: string;

  @Property({ type: 'text', nullable: true })
  file_description?: string;

  @Property({ type: 'text', nullable: true })
  file_header?: string;

  @Property({ type: 'text', nullable: true })
  file_bullets?: string;

  @Property({ type: 'text', nullable: true })
  sort_order?: string;

  @Property({ type: 'boolean', default: true })
  display!: boolean;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;
}
