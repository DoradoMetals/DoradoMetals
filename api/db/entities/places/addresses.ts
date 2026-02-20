import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'addresses', schema: 'places' })
export class Address {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text' })
  line_1!: string;

  @Property({ type: 'text', nullable: true })
  line_2?: string;

  @Property({ type: 'text' })
  city!: string;

  @Property({ type: 'text' })
  state!: string;

  @Property({ type: 'text' })
  country!: string;

  @Property({ type: 'text' })
  zip!: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;

  @Property({ type: 'boolean', default: false })
  is_valid!: boolean;

  @Property({ type: 'boolean', default: false })
  is_residential!: boolean;

  @Property({ type: 'timestamp', nullable: true })
  validated_at?: Date;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;
}
