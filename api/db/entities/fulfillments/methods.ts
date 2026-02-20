import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'methods', schema: 'fulfillments' })
export class FulfillmentMethod {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text' })
  type!: string;

  @Property({ type: 'text' })
  label!: string;

  @Property({ type: 'text' })
  direction!: string;

  @Property({ type: 'boolean', default: true })
  enabled!: boolean;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;
}
