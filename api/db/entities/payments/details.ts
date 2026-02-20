import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from '@/db/entities/auth/users';

@Entity({ tableName: 'details', schema: 'payments' })
export class PaymentDetail {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: User;

  @Property({ type: 'text' })
  account_holder!: string;

  @Property({ type: 'text', nullable: true })
  bank_name?: string;

  @Property({ type: 'text' })
  account_type!: string;

  @Property({ type: 'text' })
  routing_number!: string;

  @Property({ type: 'text' })
  account_number!: string;

  @Property({ type: 'text', nullable: true })
  last_four?: string;

  @Property({ type: 'text', nullable: true })
  card_brand?: string;

  @Property({ type: 'text', nullable: true })
  email_to?: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;
}
