import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'users', schema: 'auth' })
export class User {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text', unique: true })
  email!: string;

  @Property({ type: 'text', nullable: true })
  name?: string;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  updatedAt!: Date;

  @Property({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @Property({ type: 'text', nullable: true })
  image?: string;

  @Property({ type: 'text', nullable: true })
  role?: string;

  @Property({ type: 'text', nullable: true })
  stripeCustomerId?: string;

  @Property({ type: 'numeric', nullable: true })
  dorado_funds?: number;

  @Property({ type: 'boolean', nullable: true })
  banned?: boolean;

  @Property({ type: 'text', nullable: true })
  banReason?: string;

  @Property({ type: 'timestamp', nullable: true })
  banExpires?: Date;

  @Property({ type: 'text', nullable: true })
  phone_number?: string;
}
