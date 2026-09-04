import type { PoolClient } from "pg";

export const TEST_ACTOR = {
  id: "00000000-0000-4000-8000-0000000ac700",
  name: "Test Actor",
  email: "zz-test-actor@dorado.test",
} as const;

export const TEST_CUSTOMER = {
  id: "00000000-0000-4000-8000-0000000c5700",
  name: "Test Customer",
  email: "zz-test-customer@dorado.test",
} as const;

export async function actingAs(c: PoolClient, id: string | null): Promise<void> {
  await c.query("SELECT set_config('app.actor_id', $1, true)", [id ?? ""]);
}
