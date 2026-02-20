import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Address } from '@/db/entities/places/addresses';
import { User } from '@/db/entities/auth/users';

@Entity({ tableName: 'user_addresses', schema: 'places' })
export class UserAddress {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Address, { fieldName: 'address_id' })
  address!: Address;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: User;

  @Property({ type: 'text', nullable: true })
  label?: string;

  @Property({ type: 'boolean', default: false })
  default_shipping!: boolean;

  @Property({ type: 'boolean', default: false })
  default_billing!: boolean;
}
