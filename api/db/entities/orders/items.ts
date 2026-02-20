import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Order } from '@/db/entities/orders/orders';

@Entity({ tableName: 'items', schema: 'orders' })
export class OrderItem {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'uuid', nullable: true })
  bullion_id?: string;

  @Property({ type: 'uuid', nullable: true })
  metal_id?: string;

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Order;

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
