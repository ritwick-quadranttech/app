export * from './schema';
export * as schema from './schema';
export {
  createDatabaseClient,
  type DatabaseClient,
  type Db,
  type QueryMethod,
  type SqlExecutor,
} from './client';
export {
  migrate,
  MigrationError,
  MIGRATIONS_TABLE,
  SCHEMA_VERSION_KEY,
  type MigrateResult,
} from './migrations/migrate';
export { migrations } from './migrations/generated';
export type { Migration } from './migrations/types';
export {
  DEFAULT_ACCOUNTS,
  DEFAULT_UNITS,
  seedCompanyDefaults,
  type DefaultAccount,
  type DefaultUnit,
  type SeedResult,
} from './seed';
export {
  allocateDocumentNumber,
  formatDocNumber,
  NumberSeriesError,
  type AllocatedNumber,
} from './numbering';
