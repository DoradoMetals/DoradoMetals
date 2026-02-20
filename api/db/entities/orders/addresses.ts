import { Entity, PrimaryKey, ManyToOne } from '@mikro-orm/core';
import { Order } from '@/db/entities/orders/orders';
import { Address } from '@/db/entities/places/addresses';

@Entity({ tableName: 'addresses', schema: 'orders' })
export class OrderAddress {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Address, { fieldName: 'address_id' })
  address!: Address;

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Order;
}
