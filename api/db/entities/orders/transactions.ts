import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Order } from '@/db/entities/orders/orders';

@Entity({ tableName: 'transactions', schema: 'orders' })
export class Transaction {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Order;

  @Property({ type: 'numeric' })
  total!: number;

  @Property({ type: 'numeric', nullable: true })
  shipping?: number;

  @Property({ type: 'numeric', nullable: true })
  items?: number;

  @Property({ type: 'numeric', nullable: true })
  surcharge?: number;

  @Property({ type: 'numeric', nullable: true })
  sales_tax?: number;

  @Property({ type: 'numeric', nullable: true })
  funds?: number;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;
}
