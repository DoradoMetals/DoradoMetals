import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "auctions", schema: "auctions" })
export class Auction {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "text" })
  status!: string;

  @Property({ type: "timestamp", nullable: true })
  scheduled_date?: Date;

  @Property({ type: "bigint" })
  number!: number;

  @Property({ type: "string", nullable: true })
  created_by?: string;

  @Property({ type: "string", nullable: true })
  updated_by?: string;

  @Property({ type: "timestamp" })
  created_at!: Date;

  @Property({ type: "timestamp" })
  updated_at!: Date;
}
