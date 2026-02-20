import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "images", schema: "core" })
export class Image {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "text" })
  bucket!: string;

  @Property({ type: "text" })
  mime_type!: string;

  @Property({ type: "integer" })
  size_bytes!: number;

  @Property({ type: "integer" })
  width!: number;

  @Property({ type: "integer" })
  height!: number;

  @Property({ type: "bytea", nullable: true })
  checksum?: Buffer;

  @Property({ type: "jsonb", nullable: true })
  metadata?: Record<string, any>;

  @Property({ type: "text" })
  path!: string;

  @Property({ type: "text" })
  filename!: string;
}
