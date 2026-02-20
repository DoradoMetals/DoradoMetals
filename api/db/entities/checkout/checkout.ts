import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from '@/db/entities/auth/users';
import { PaymentMethod } from '@/db/entities/payments/methods';
import { PaymentDetail } from '@/db/entities/payments/details';
import { FulfillmentMethod } from '@/db/entities/fulfillments/methods';
import { Address } from '@/db/entities/places/addresses';
import { Location } from '@/db/entities/places/locations';

@Entity({ tableName: 'checkouts', schema: 'checkout' })
export class Checkout {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: User;

  @ManyToOne(() => PaymentMethod, {
    fieldName: 'payment_method_id',
    nullable: true,
  })
  payment_method?: PaymentMethod;

  @ManyToOne(() => PaymentDetail, {
    fieldName: 'payment_details_id',
    nullable: true,
  })
  payment_details?: PaymentDetail;

  @ManyToOne(() => FulfillmentMethod, {
    fieldName: 'fulfillment_method_id',
    nullable: true,
  })
  fulfillment_method?: FulfillmentMethod;

  @ManyToOne(() => Location, {
    fieldName: 'appointment_location_id',
    nullable: true,
  })
  appointment_location?: Location;

  @ManyToOne(() => Address, {
    fieldName: 'pickup_address_id',
    nullable: true,
  })
  pickup_address?: Address;

  @ManyToOne(() => Address, {
    fieldName: 'shipper_address_id',
    nullable: true,
  })
  shipper_address?: Address;

  @ManyToOne(() => Address, {
    fieldName: 'recipient_address_id',
    nullable: true,
  })
  recipient_address?: Address;

  @Property({ type: 'uuid', nullable: true })
  carrier_service_id?: string;

  @Property({ type: 'uuid', nullable: true })
  package_id?: string;

  @Property({ type: 'text' })
  direction!: string;

  @Property({ type: 'timestamp', nullable: true })
  appointment_time?: Date;
}
