import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'sales_tax_rules', schema: 'tax' })
export class SalesTaxRule {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text' })
  state_code!: string;

  @Property({ type: 'text', nullable: true })
  metal_category?: string;

  @Property({ type: 'text', nullable: true })
  product_type?: string;

  @Property({ type: 'numeric', nullable: true })
  min_price?: number;

  @Property({ type: 'numeric', nullable: true })
  max_price?: number;

  @Property({ type: 'numeric', nullable: true })
  purity_min?: number;

  @Property({ type: 'numeric', nullable: true })
  purity_max?: number;

  @Property({ type: 'numeric', nullable: true })
  aggregate_min?: number;

  @Property({ type: 'numeric', nullable: true })
  aggregate_max?: number;

  @Property({ type: 'numeric', nullable: true })
  markup_min_pct?: number;

  @Property({ type: 'numeric', nullable: true })
  markup_max_pct?: number;

  @Property({ type: 'numeric' })
  tax_rate!: number;

  @Property({ type: 'numeric', nullable: true })
  weight_min?: number;

  @Property({ type: 'numeric', nullable: true })
  weight_max?: number;

  @Property({ type: 'boolean', default: false })
  is_domestic!: boolean;

  @Property({ type: 'boolean', default: false })
  is_legal_tender!: boolean;
}
