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
) as SyncedCronInstance;

interface SyncedCronConfig {
  log?: boolean;
  collectionName?: string;
  utc?: boolean;
  collectionTTL?: number;
}

interface SyncedCronInstance {
  config(options: SyncedCronConfig): void;
  start(): void;
  // The quave:synced-cron package exposes many other members that the Proxy
  // above forwards verbatim; they are untyped, so any is unavoidable here.
  [key: string]: any;
  [key: symbol]: any;
}
