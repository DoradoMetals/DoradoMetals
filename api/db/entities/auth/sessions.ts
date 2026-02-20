import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from '@/db/entities/auth/users'

@Entity({ tableName: 'sessions', schema: 'auth' })
export class Session {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'userId' })
  user!: User;

  @Property({ type: 'text' })
  token!: string;

  @Property({ type: 'timestamp' })
  expiresAt!: Date;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  updatedAt!: Date;

  @Property({ type: 'text', nullable: true })
  ipAddress?: string;

  @Property({ type: 'text', nullable: true })
  userAgent?: string;

  @ManyToOne(() => User, {
    fieldName: 'impersonatedBy',
    nullable: true,
  })
  impersonator?: User;
}
