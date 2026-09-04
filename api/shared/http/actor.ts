import { AsyncLocalStorage } from "node:async_hooks";

export type ActorContext = { actor_id: string | null };

const storage = new AsyncLocalStorage<ActorContext>();

export function runWithActor<T>(actor_id: string | null, fn: () => T): T {
  return storage.run({ actor_id }, fn);
}

export function currentActor(): string | null {
  return storage.getStore()?.actor_id ?? null;
}
