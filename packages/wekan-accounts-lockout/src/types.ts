import { Meteor } from 'meteor/meteor';

export interface LockoutSettings {
  failuresBeforeLockout: number;
  lockoutPeriod: number;
  failureWindow: number;
}

export interface AccountsLockoutService {
  unlockTime?: number;
  failedAttempts?: number;
  lastFailedAttempt?: number;
  firstFailedAttempt?: number;
}

export interface UserWithLockout {
  _id: string;
  services: {
    'accounts-lockout': AccountsLockoutService;
  };
}

export interface ConnectionDoc {
  _id?: string;
  clientAddress: string;
  services: {
    'accounts-lockout': AccountsLockoutService;
  };
}

export interface SettingEntry {
  key: keyof LockoutSettings;
  value: number;
}

export interface LoginInfo {
  type: string;
  allowed: boolean;
  error?: Meteor.Error;
  user: UserWithLockout;
  connection: Meteor.Connection;
}
