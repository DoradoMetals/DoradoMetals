import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Metal } from '@/db/entities/core/metals';
import { Mint } from '@/db/entities/core/mints';

@Entity({ tableName: 'bullion', schema: 'core' })
export class Bullion {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Metal, { fieldName: 'metal_id' })
  metal!: Metal;

  @ManyToOne(() => Mint, { fieldName: 'mint_id' })
  mint!: Mint;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'numeric', nullable: true, default: 0 })
  bid_premium?: number;

  @Property({ type: 'numeric', nullable: true, default: 0 })
  ask_premium?: number;

  @Property({ type: 'text', nullable: true, default: 'Coin' })
  type?: string;

  @Property({ type: 'boolean', nullable: true, default: true })
  display?: boolean;

  @Property({ type: 'boolean', nullable: true, default: false })
  homepage_display?: boolean;

  @Property({ type: 'boolean', nullable: true, default: false })
  sell_display?: boolean;

  @Property({ type: 'boolean', nullable: true, default: false })
  legal_tender?: boolean;

  @Property({ type: 'boolean', nullable: true, default: false })
  domestic_tender?: boolean;

  @Property({ type: 'boolean', nullable: true, default: false })
  is_generic?: boolean;

  @Property({ type: 'numeric', nullable: true, default: 1 })
  content?: number;

  @Property({ type: 'numeric', nullable: true, default: 1 })
  gross?: number;

  @Property({ type: 'numeric', nullable: true, default: 0.999 })
  purity?: number;

  @Property({ type: 'text', nullable: true })
  variant_group?: string;

  @Property({ type: 'text', nullable: true })
  variant_label?: string;

  @Property({ type: 'integer', nullable: true, default: 0 })
  shadow_offset?: number;

  @Property({ type: 'text', nullable: true })
  slug?: string;

  @Property({ type: 'text', nullable: true })
  filter_category?: string;

  @Property({ type: 'text', nullable: true })
  image_front?: string;

  @Property({ type: 'text', nullable: true })
  image_back?: string;

  @Property({ type: 'timestamp', nullable: true, defaultRaw: 'now()' })
  created_at?: Date;

  @Property({ type: 'timestamp', nullable: true, defaultRaw: 'now()' })
  updated_at?: Date;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;
}
