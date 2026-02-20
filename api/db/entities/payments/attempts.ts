import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { PaymentIntent } from '@/db/entities/payments/intents';
import { PaymentMethod } from '@/db/entities/payments/methods';

@Entity({ tableName: 'attempts', schema: 'payments' })
export class PaymentAttempt {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => PaymentIntent, { fieldName: 'intent_id' })
  intent!: PaymentIntent;

  @ManyToOne(() => PaymentMethod, { fieldName: 'method_id' })
  method!: PaymentMethod;

  @Property({ type: 'text', nullable: true })
  provider?: string;

  @Property({ type: 'text', nullable: true })
  provider_ref?: string;

  @Property({ type: 'numeric' })
  amount!: number;

  @Property({ type: 'text' })
  status!: string;

  @Property({ type: 'text', nullable: true })
  error_code?: string;

  @Property({ type: 'text', nullable: true })
  error_message?: string;

  @Property({ type: 'timestamp' })
  attempted_at!: Date;
}
