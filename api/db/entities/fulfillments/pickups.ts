import { Entity, PrimaryKey, ManyToOne, Property } from '@mikro-orm/core';
import { Fulfillment } from '@/db/entities/fulfillments/fulfillments';

@Entity({ tableName: 'pickups', schema: 'fulfillments' })
export class FulfillmentPickup {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Fulfillment, { fieldName: 'fulfillment_id' })
  fulfillment!: Fulfillment;

  @ManyToOne(() => Object, { fieldName: 'pickup_address_id' })
  pickup_address!: any;

  @ManyToOne(() => Object, { fieldName: 'assigned_employee_id', nullable: true })
  assigned_employee?: any;

  @Property({ type: 'timestamp', nullable: true })
  start_time?: Date;

  @Property({ type: 'timestamp', nullable: true })
  end_time?: Date;
}
