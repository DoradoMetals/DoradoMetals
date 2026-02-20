import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from '@/db/entities/auth/users'

@Entity({ tableName: 'account', schema: 'auth' })
export class Account {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'userId' })
  user!: User;

  @Property({ type: 'text' })
  accountId!: string;

  @Property({ type: 'text' })
  providerId!: string;

  @Property({ type: 'text', nullable: true })
  accessToken?: string;

  @Property({ type: 'text', nullable: true })
  refreshToken?: string;

  @Property({ type: 'timestamp', nullable: true })
  accessTokenExpiresAt?: Date;

  @Property({ type: 'timestamp', nullable: true })
  refreshTokenExpiresAt?: Date;

  @Property({ type: 'text', nullable: true })
  scope?: string;

  @Property({ type: 'text', nullable: true })
  idToken?: string;

  @Property({ type: 'text', nullable: true })
  password?: string;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'timestamp', defaultRaw: 'now()' })
  updatedAt!: Date;
}
