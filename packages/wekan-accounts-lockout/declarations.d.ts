/*
 * Ambient type declarations for the Meteor globals/modules used by this
 * package. Meteor does not ship TypeScript types for these virtual modules,
 * so we declare the small surface actually referenced here with real
 * signatures instead of `any`.
 */

// --- Mongo-style dynamic selector/modifier objects -------------------------
// Mongo query selectors and update modifiers are genuinely dynamic documents
// keyed by arbitrary runtime strings (including operators like `$set`), so a
// recursive value type is the most precise shape we can express.
type MongoValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | MongoValue[]
  | { [key: string]: MongoValue };

interface MongoSelector {
  [key: string]: MongoValue;
}

interface MongoFieldSpecifier {
  [key: string]: number;
}

interface MongoFindOptions {
  fields?: MongoFieldSpecifier;
  sort?: MongoSelector;
  limit?: number;
  skip?: number;
}

interface MongoCursor<T> extends AsyncIterable<T> {
  fetchAsync(): Promise<T[]>;
  countAsync(): Promise<number>;
}

interface MongoUpsertResult {
  numberAffected?: number;
  insertedId?: string;
}

interface MeteorCollection<T> {
  find(selector?: MongoSelector, options?: MongoFindOptions): MongoCursor<T>;
  findOneAsync(selector?: MongoSelector, options?: MongoFindOptions): Promise<T>;
  updateAsync(
    selector: MongoSelector,
    modifier: MongoSelector,
    options?: MongoSelector,
  ): Promise<number>;
  upsertAsync(
    selector: MongoSelector,
    modifier: MongoSelector,
    options?: MongoSelector,
  ): Promise<MongoUpsertResult>;
}

// --- Domain shapes shared across this package ------------------------------
interface AccountsLockoutServiceData {
  unlockTime?: number;
  failedAttempts?: number;
  lastFailedAttempt?: number;
  firstFailedAttempt?: number;
}

interface AccountsLockoutUserServices {
  'accounts-lockout': AccountsLockoutServiceData;
}

interface LockoutUser {
  _id: string;
  services: AccountsLockoutUserServices;
}

interface LockoutConnectionDoc {
  _id?: string;
  clientAddress: string;
  services: AccountsLockoutUserServices;
}

interface MeteorConnection {
  id: string;
  clientAddress: string;
}

interface LockoutSettings {
  failuresBeforeLockout: number;
  lockoutPeriod: number;
  failureWindow: number;
}

interface LockoutSettingEntry {
  key: keyof LockoutSettings;
  value: number;
}

interface LoginAttemptInfo {
  type: string;
  allowed: boolean;
  user?: LockoutUser;
  error?: { reason?: string };
  connection: MeteorConnection;
}

interface LoginSuccessInfo {
  type: string;
  user: LockoutUser;
  connection: MeteorConnection;
}

// --- Virtual Meteor modules ------------------------------------------------
declare module 'meteor/meteor' {
  interface MeteorSettings {
    'accounts-lockout': {
      knownUsers?: LockoutSettingEntry[];
      unknownUsers?: LockoutSettingEntry[];
    };
  }

  interface MeteorErrorConstructor {
    new (error: number | string, reason?: string, details?: string): Error;
  }

  interface MeteorCollectionConstructor {
    new <T>(name: string, options?: MongoSelector): MeteorCollection<T>;
  }

  export namespace Meteor {
    const users: MeteorCollection<LockoutUser>;
    const settings: MeteorSettings;
    const Error: MeteorErrorConstructor;
    const Collection: MeteorCollectionConstructor;
    function setTimeout(callback: () => void, delay: number): number;
  }
}

declare module 'meteor/accounts-base' {
  export namespace Accounts {
    function validateLoginAttempt(
      callback: (attempt: LoginAttemptInfo) => boolean | void | Promise<boolean | void>,
    ): boolean;
    function onLogin(
      callback: (attempt: LoginSuccessInfo) => void | Promise<void>,
    ): void;
  }
}
