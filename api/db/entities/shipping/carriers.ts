import { Entity, PrimaryKey, ManyToOne } from '@mikro-orm/core';
import { Organization } from '@/db/entities/core/organizations';

@Entity({ tableName: 'carriers', schema: 'shipping' })
export class ShippingCarrier {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Organization, { fieldName: 'organization_id' })
  organization!: Organization;
}
