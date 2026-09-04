import type { ZodObject } from "zod/v4";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entity = ZodObject<any>;

export function columnsOf<T extends Entity>(
  entity: T
): readonly (keyof T["shape"] & string)[] {
  return Object.keys(entity.shape) as (keyof T["shape"] & string)[];
}

export function returningOf(entity: Entity): string {
  return Object.keys(entity.shape).join(", ");
}

export const ACTOR_IDS = { created_by_id: true, updated_by_id: true } as const;
