import { MikroORM } from "@mikro-orm/postgresql";
import config from "@/mikro-orm.config";

let orm: MikroORM | null = null;

export async function getOrm(): Promise<MikroORM> {
  if (!orm) {
    orm = await MikroORM.init(config);

    // const entities = orm.getMetadata().getAll();
    // console.log("[MikroORM] Entities:", Object.keys(entities));
  }

  return orm;
}
