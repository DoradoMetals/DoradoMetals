import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Order } from '@/db/entities/orders/orders';

@Entity({ tableName: 'offers', schema: 'orders' })
export class Offer {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Order;

  @Property({ type: 'text' })
  status!: string;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;

  @Property({ type: 'text' })
  offer_status!: string;

  @Property({ type: 'timestamp', nullable: true })
  offer_expiration?: Date;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;

  @Property({ type: 'boolean', default: false })
  spots_locked!: boolean;

  @Property({ type: 'numeric', nullable: true })
  num_rejections?: number;

  @Property({ type: 'numeric' })
  offer_amount!: number;
}
