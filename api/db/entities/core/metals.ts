import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "metals", schema: "core" })
export class Metal {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "text" })
  type!: string;
}
