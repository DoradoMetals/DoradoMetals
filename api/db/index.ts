import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { DB } from "@/db/types";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool })
});
