import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { PaymentAttempt } from '@/db/entities/payments/attempts';

@Entity({ tableName: 'settlements', schema: 'payments' })
export class PaymentSettlement {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => PaymentAttempt, { fieldName: 'attempt_id' })
  attempt!: PaymentAttempt;

  @Property({ type: 'numeric' })
  settled_amount!: number;

  @Property({ type: 'text', nullable: true })
  provider?: string;

  @Property({ type: 'text', nullable: true })
  provider_ref?: string;

  @Property({ type: 'timestamp' })
  settled_at!: Date;
}
