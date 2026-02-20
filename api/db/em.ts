import { getOrm } from '@/db/orm';
import { EntityManager } from '@mikro-orm/postgresql';

export async function getEm(): Promise<EntityManager> {
  const orm = await getOrm();
  return orm.em.fork();
}
