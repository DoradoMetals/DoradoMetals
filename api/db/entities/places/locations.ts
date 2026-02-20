import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Organization } from '@/db/entities/core/organizations';
import { Image } from '@/db/entities/core/images';
import { Address } from '@/db/entities/places/addresses';

@Entity({ tableName: 'locations', schema: 'places' })
export class Location {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Organization, { fieldName: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Address, { fieldName: 'address_id' })
  address!: Address;

  @ManyToOne(() => Image, { fieldName: 'image_id', nullable: true })
  image?: Image;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text' })
  type!: string;

  @Property({ type: 'boolean', default: true })
  enabled!: boolean;
}
