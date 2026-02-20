import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { Image } from "@/db/entities/core/images";

@Entity({ tableName: "organizations", schema: "core" })
export class Organization {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Image, { fieldName: "image_id", nullable: true })
  image?: Image;

  @Property({ type: "text" })
  type!: string;

  @Property({ type: "text" })
  name!: string;

  @Property({ type: "text", nullable: true })
  email?: string;

  @Property({ type: "text", nullable: true })
  phone?: string;

  @Property({ type: "text", nullable: true })
  website?: string;

  @Property({ type: "text", nullable: true })
  description?: string;

  @Property({ type: "boolean", default: true })
  enabled!: boolean;

  @Property({ type: "timestamp" })
  created_at!: Date;

  @Property({ type: "timestamp" })
  updated_at!: Date;

  @Property({ type: "text", nullable: true })
  created_by?: string;

  @Property({ type: "text", nullable: true })
  updated_by?: string;
}
