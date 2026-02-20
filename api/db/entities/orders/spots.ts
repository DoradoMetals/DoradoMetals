import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Order } from '@/db/entities/orders/orders';

@Entity({ tableName: 'spots', schema: 'orders' })
export class OrderSpot {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'uuid' })
  metal_id!: string;

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Order;

  @Property({ type: 'numeric' })
  ask!: number;

  @Property({ type: 'numeric' })
  bid!: number;
}
