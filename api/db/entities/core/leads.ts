import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "leads", schema: "core" })
export class Lead {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "text" })
  name!: string;

  @Property({ type: "text", nullable: true })
  phone?: string;

  @Property({ type: "text", nullable: true })
  email?: string;

  @Property({ type: "boolean", default: false })
  converted!: boolean;

  @Property({ type: "boolean", default: false })
  contacted!: boolean;

  @Property({ type: "boolean", default: false })
  responded!: boolean;

  @Property({ type: "text", nullable: true })
  notes?: string;

  @Property({ type: "uuid", nullable: true })
  contact?: string;

  @Property({ type: "timestamp", nullable: true })
  last_contacted?: Date;

  @Property({ type: "timestamp" })
  created_at!: Date;

  @Property({ type: "timestamp" })
  updated_at!: Date;

  @Property({ type: "text", nullable: true })
  created_by?: string;

  @Property({ type: "text", nullable: true })
  updated_by?: string;
}
