import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Organization } from '@/db/entities/core/organizations';

@Entity({ tableName: 'mints', schema: 'core' })
export class Mint {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Organization, { fieldName: 'organization_id', nullable: true })
  organization?: Organization;

  @Property({ type: 'text' })
  type!: string;

  @Property({ type: 'text' })
  country!: string;
}
