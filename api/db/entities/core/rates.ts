import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { Metal } from "@/db/entities/core/metals";

@Entity({ tableName: "rates", schema: "core" })
export class Rate {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Metal, { fieldName: "metal_id" })
  metal!: Metal;

  @Property({ type: "text" })
  unit!: string;

  @Property({ type: "numeric" })
  min_qty!: number;

  @Property({ type: "numeric" })
  max_qty!: number;

  @Property({ type: "numeric" })
  scrap_pct!: number;

  @Property({ type: "numeric" })
  bullion_pct!: number;

  @Property({ type: "timestamp" })
  created_at!: Date;

  @Property({ type: "timestamp" })
  updated_at!: Date;

  @Property({ type: "text", nullable: true })
  created_by?: string;

  @Property({ type: "text", nullable: true })
  updated_by?: string;
}
