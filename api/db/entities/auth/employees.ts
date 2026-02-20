import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from '@/db/entities/auth/users'

@Entity({ tableName: 'employees', schema: 'auth' })
export class Employee {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: User;

  @Property({ type: 'text', nullable: true })
  role?: string;

  @Property({ type: 'boolean', default: true })
  enabled!: boolean;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  created_at!: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  updated_at!: Date;

  @Property({ type: 'text', nullable: true })
  created_by?: string;

  @Property({ type: 'text', nullable: true })
  updated_by?: string;
}
