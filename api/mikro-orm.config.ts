import type { Options } from '@mikro-orm/core';
import { EntityCaseNamingStrategy, PostgreSqlDriver } from '@mikro-orm/postgresql';

const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,

  clientUrl: process.env.DATABASE_URL,

  entities: ['db/entities'],
  entitiesTs: ['db/entities'],
  namingStrategy: EntityCaseNamingStrategy,

  migrations: {
    path: 'db/migrations',
    pathTs: 'db/migrations',
    transactional: true,
    allOrNothing: true,
  },

  pool: {
    min: 1,
    max: 10,
  },
debug: true,
  // debug: process.env.NODE_ENV !== 'production',
};

export default config;
