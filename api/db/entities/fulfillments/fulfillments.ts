import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { FulfillmentMethod } from '@/db/entities/fulfillments/methods';
import { Order } from '@/db/entities/orders/orders';

@Entity({ tableName: 'fulfillments', schema: 'fulfillments' })
export class Fulfillment {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => FulfillmentMethod, { fieldName: 'method_id' })
  method!: FulfillmentMethod;

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Order;

  @Property({ type: 'text' })
  status!: string;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;
}
