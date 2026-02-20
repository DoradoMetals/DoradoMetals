import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { User } from "@/db/entities/auth/users";
import { Order } from "@/db/entities/orders/orders";

@Entity({ tableName: "reviews", schema: "core" })
export class Review {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => User, { fieldName: "user_id" })
  user!: User;

  @ManyToOne(() => Order, { fieldName: "order_id" })
  order!: Order;

  @Property({ type: "text" })
  name!: string;

  @Property({ type: "text" })
  review_text!: string;

  @Property({ type: "integer" })
  rating!: number;

  @Property({ type: "boolean", default: false })
  hidden!: boolean;

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
