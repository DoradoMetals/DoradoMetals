import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Fulfillment } from '@/db/entities/fulfillments/fulfillments';

@Entity({ tableName: 'directs', schema: 'fulfillments' })
export class FulfillmentDirect {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Fulfillment, { fieldName: 'fulfillment_id' })
  fulfillment!: Fulfillment;

  @ManyToOne(() => Object, { fieldName: 'location_id' })
  location!: any;

  @ManyToOne(() => Object, { fieldName: 'assigned_employee_id', nullable: true })
  assigned_employee?: any;

  @Property({ type: 'boolean', default: false })
  is_appointment!: boolean;

  @Property({ type: 'timestamp', nullable: true })
  start_time?: Date;

  @Property({ type: 'timestamp', nullable: true })
  end_time?: Date;
}
