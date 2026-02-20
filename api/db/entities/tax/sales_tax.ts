import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'sales_tax', schema: 'tax' })
export class SalesTax {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text' })
  state!: string;

  @Property({ type: 'boolean', default: false })
  reached_nexus!: boolean;

  @Property({ type: 'numeric', nullable: true })
  amount_owed?: number;

  @Property({ type: 'timestamp', nullable: true })
  last_remitted?: Date;
}
