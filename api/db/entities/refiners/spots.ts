import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Refiner } from '@/db/entities/refiners/refiners';

@Entity({ tableName: 'spots', schema: 'refiners' })
export class RefinerSpot {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'uuid' })
  metal_id!: string;

  @ManyToOne(() => Refiner, { fieldName: 'refiner_id' })
  refiner!: Refiner;

  @Property({ type: 'uuid', nullable: true })
  order_id?: string;

  @Property({ type: 'numeric', nullable: true })
  pool_oz_deducted?: number;

  @Property({ type: 'numeric' })
  ask!: number;

  @Property({ type: 'numeric' })
  bid!: number;
}
