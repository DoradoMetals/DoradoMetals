import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'verification', schema: 'auth' })
export class Verification {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text' })
  identifier!: string;

  @Property({ type: 'text' })
  value!: string;

  @Property({ type: 'timestamp' })
  expiresAt!: Date;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  updatedAt!: Date;
}
