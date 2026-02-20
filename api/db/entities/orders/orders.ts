import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { User } from "@/db/entities/auth/users";
import { Refiner } from "@/db/entities/refiners/refiners";

@Entity({ tableName: "orders", schema: "orders" })
export class Order {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => User, { fieldName: "user_id" })
  user!: User;

  @ManyToOne(() => Refiner, {
    fieldName: "refiner_id",
    nullable: true,
  })
  refiner?: Refiner;

  @Property({ type: "text" })
  direction!: string;

  @Property({ type: "text" })
  status!: string;

  @Property({ type: "bigint" })
  number!: number;

  @Property({ type: "text", nullable: true })
  notes?: string;

  @Property({ type: "boolean", default: false })
  review_created!: boolean;

  @Property({ type: "text", nullable: true })
  created_by?: string;

  @Property({ type: "text", nullable: true })
  updated_by?: string;

  @Property({ type: "timestamp" })
  created_at!: Date;

  @Property({ type: "timestamp" })
  updated_at!: Date;
}
