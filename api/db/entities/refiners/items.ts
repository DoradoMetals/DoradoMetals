import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Refiner } from '@/db/entities/refiners/refiners';

@Entity({ tableName: 'items', schema: 'refiners' })
export class RefinerItem {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'uuid', nullable: true })
  bullion_id?: string;

  @Property({ type: 'uuid', nullable: true })
  metal_id?: string;

  @ManyToOne(() => Refiner, { fieldName: 'refiner_id' })
  refiner!: Refiner;

  @Property({ type: 'uuid', nullable: true })
  order_id?: string;

  @Property({ type: 'uuid', nullable: true })
  order_item_id?: string;

  @Property({ type: 'numeric', nullable: true })
  pre_melt?: number;

  @Property({ type: 'numeric', nullable: true })
  post_melt?: number;

  @Property({ type: 'numeric', nullable: true })
  purity?: number;

  @Property({ type: 'numeric', nullable: true })
  premium?: number;

  @Property({ type: 'numeric' })
  quantity!: number;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;
}
