import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Order } from '@/db/entities/orders/orders';
import { PaymentMethod } from '@/db/entities/payments/methods';
import { PaymentDetail } from '@/db/entities/payments/details';

@Entity({ tableName: 'intents', schema: 'payments' })
export class PaymentIntent {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Order;

  @ManyToOne(() => PaymentMethod, { fieldName: 'method_id' })
  method!: PaymentMethod;

  @ManyToOne(() => PaymentDetail, {
    fieldName: 'details_id',
    nullable: true,
  })
  details?: PaymentDetail;

  @Property({ type: 'numeric' })
  amount_expected!: number;

  @Property({ type: 'text' })
  status!: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;
}
