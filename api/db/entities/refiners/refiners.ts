import { Entity, PrimaryKey, ManyToOne } from '@mikro-orm/core';
import { Organization } from '@/db/entities/core/organizations';

@Entity({ tableName: 'refiners', schema: 'refiners' })
export class Refiner {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Organization, { fieldName: 'organization_id' })
  organization!: Organization;
}
