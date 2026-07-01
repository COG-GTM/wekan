import KnownUser from './knownUser';
import UnknownUser from './unknownUser';
import type { LockoutSettings } from './types';

class AccountsLockout {
  private settings: AccountsLockoutSettings;

  constructor({
    knownUsers = {
      failuresBeforeLockout: 3,
      lockoutPeriod: 60,
      failureWindow: 15,
    },
    unknownUsers = {
      failuresBeforeLockout: 3,
      lockoutPeriod: 60,
      failureWindow: 15,
    },
  }: AccountsLockoutOptions) {
    this.settings = {
      knownUsers,
      unknownUsers,
    };
  }

  startup() {
    (new KnownUser(this.settings.knownUsers)).startup();
    (new UnknownUser(this.settings.unknownUsers)).startup();
  }
}

interface AccountsLockoutSettings {
  knownUsers: LockoutSettings;
  unknownUsers: LockoutSettings;
}

interface AccountsLockoutOptions {
  knownUsers?: LockoutSettings;
  unknownUsers?: LockoutSettings;
}

export default AccountsLockout;
