let syncedCronConfigured = false;
let syncedCronInstance: SyncedCronInstance | null = null;

function getSyncedCronInstance(): SyncedCronInstance {
  if (!syncedCronInstance) {
    syncedCronInstance = require('meteor/quave:synced-cron').SyncedCron;
  }
  return syncedCronInstance!;
}

export function configureSyncedCron() {
  if (syncedCronConfigured) {
    return;
  }

  const SyncedCron = getSyncedCronInstance();
  SyncedCron.config({
    log: false,
    collectionName: 'cronJobs',
    utc: false,
    collectionTTL: 172800,
  });

  syncedCronConfigured = true;
}

export function startSyncedCron() {
  configureSyncedCron();
  getSyncedCronInstance().start();
}

export const SyncedCron = new Proxy(
  {},
  {
    get(_target, prop) {
      return getSyncedCronInstance()[prop];
    },
    set(_target, prop, value) {
      getSyncedCronInstance()[prop] = value;
      return true;
    },
  },
);

// The quave:synced-cron community package (loaded lazily via require) ships no
// type definitions. Only the `config`/`start` surface Wekan calls directly is
// modelled precisely; the Proxy above forwards every other member access, so the
// remaining surface comes through the documented interop index signatures.
interface SyncedCronInstance {
  config(options: {
    log?: boolean;
    collectionName?: string;
    utc?: boolean;
    collectionTTL?: number;
  }): void;
  start(): void;
  [member: string]: WekanDocumentField;
  [member: symbol]: WekanDocumentField;
}
