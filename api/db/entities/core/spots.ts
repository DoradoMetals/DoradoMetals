import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { Metal } from "@/db/entities/core/metals";

@Entity({ tableName: "spots", schema: "core" })
export class Spot {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Metal, { fieldName: "metal_id" })
  metal!: Metal;

  @Property({ type: "numeric" })
  ask!: number;

  @Property({ type: "numeric" })
  bid!: number;

  @Property({ type: "numeric", nullable: true })
  percent_change?: number;

  @Property({ type: "numeric", nullable: true })
  dollar_change?: number;
}
