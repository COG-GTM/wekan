// Ambient module declarations for Meteor packages that are not covered by
// @types/meteor. Kept in a dedicated script (non-module) declaration file so the
// `declare module` blocks register as ambient module declarations.

// Meteor's `logging` package. Each method takes a message and forwards any
// number of additional values to the underlying logger.
declare module 'meteor/logging' {
  export const Log: {
    // Extra values are passed straight through to the logger and may be of any
    // shape, so the variadic rest is typed as `any[]`.
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
  };
}

// The `quave:synced-cron` package used to schedule the background LDAP sync.
declare module 'meteor/quave:synced-cron' {
  interface SyncedCronRecur {
    on(...values: number[]): SyncedCronRecur;
    minute(): SyncedCronRecur;
  }

  interface SyncedCronParser {
    text(input: string): object;
    recur(): SyncedCronRecur;
  }

  interface SyncedCronJob {
    name: string;
    schedule(parser: SyncedCronParser): object;
    job(): void | Promise<void>;
  }

  export const SyncedCron: {
    add(job: SyncedCronJob): void;
    remove(name: string): void;
    nextScheduledAtDate(name: string): Date | undefined;
    start(): void;
    stop(): void;
  };
}
