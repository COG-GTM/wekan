import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { TAPi18n } from '/imports/i18n';
import { ReactiveCache } from '/imports/reactiveCache';
import LockoutSettings from '/models/lockoutSettings';

Template.lockedUsersGeneral.onCreated(function (this: LockedUsersInstance) {
  this.lockedUsers = new ReactiveVar([]);
  this.isLoadingLockedUsers = new ReactiveVar(false);

  // Store refreshLockedUsers on the instance so it can be called from event handlers
  this.refreshLockedUsers = () => {
    // Set loading state initially, but we'll hide it if no users are found
    this.isLoadingLockedUsers.set(true);

    // err/users: any — untyped Meteor method callback.
    Meteor.call('getLockedUsers', (err: any, users: any) => {
      if (err) {
        this.isLoadingLockedUsers.set(false);
        const reason = err.reason || '';
        const message = `${TAPi18n.__(err.error)}\n${reason}`;
        alert(message);
        return;
      }

      // If no users are locked, don't show loading spinner and set empty array
      if (!users || users.length === 0) {
        this.isLoadingLockedUsers.set(false);
        this.lockedUsers.set([]);
        return;
      }

      // Format the remaining time to be more human-readable
      users.forEach((user: any) => {
        if (user.remainingLockTime > 60) {
          const minutes = Math.floor(user.remainingLockTime / 60);
          const seconds = user.remainingLockTime % 60;
          user.remainingTimeFormatted = `${minutes}m ${seconds}s`;
        } else {
          user.remainingTimeFormatted = `${user.remainingLockTime}s`;
        }
      });

      this.lockedUsers.set(users);
      this.isLoadingLockedUsers.set(false);
    });
  };

  // Don't load immediately to prevent unnecessary spinner
  // The data will be loaded when the tab is selected in peopleBody.js switchMenu
});

// lockedUsersGeneral instance: locked-user list, loading state, refresh helper.
interface LockedUsersInstance extends Blaze.TemplateInstance {
  lockedUsers: ReactiveVar<any>;
  isLoadingLockedUsers: ReactiveVar<any>;
  refreshLockedUsers: () => void;
}

Template.lockedUsersGeneral.helpers({
  knownFailuresBeforeLockout() {
    return LockoutSettings.findOne('known-failuresBeforeLockout')?.value || 3;
  },

  knownLockoutPeriod() {
    return LockoutSettings.findOne('known-lockoutPeriod')?.value || 60;
  },

  knownFailureWindow() {
    return LockoutSettings.findOne('known-failureWindow')?.value || 15;
  },

  unknownFailuresBeforeLockout() {
    return LockoutSettings.findOne('unknown-failuresBeforeLockout')?.value || 3;
  },

  unknownLockoutPeriod() {
    return LockoutSettings.findOne('unknown-lockoutPeriod')?.value || 60;
  },

  unknownFailureWindow() {
    return LockoutSettings.findOne('unknown-failureWindow')?.value || 15;
  },

  lockedUsers() {
    return (Template.instance() as LockedUsersInstance).lockedUsers.get();
  },

  isLoadingLockedUsers() {
    return (Template.instance() as LockedUsersInstance).isLoadingLockedUsers.get();
  },
});

Template.lockedUsersGeneral.events({
  'click button.js-refresh-locked-users'(event: JQuery.TriggeredEvent, tpl: LockedUsersInstance) {
    tpl.refreshLockedUsers();
  },
  'click button#refreshLockedUsers'(event: JQuery.TriggeredEvent, tpl: LockedUsersInstance) {
    tpl.refreshLockedUsers();
  },
  'click button.js-unlock-user'(event: JQuery.TriggeredEvent, tpl: LockedUsersInstance) {
    const userId = $(event.currentTarget).data('user-id');
    if (!userId) return;

    if (confirm(TAPi18n.__('accounts-lockout-confirm-unlock'))) {
      // err/result: any — untyped Meteor method callback.
      Meteor.call('unlockUser', userId, (err: any, result: any) => {
        if (err) {
          const reason = err.reason || '';
          const message = `${TAPi18n.__(err.error)}\n${reason}`;
          alert(message);
          return;
        }

        if (result) {
          alert(TAPi18n.__('accounts-lockout-user-unlocked'));
          tpl.refreshLockedUsers();
        }
      });
    }
  },
  'click button.js-unlock-all-users'(event: JQuery.TriggeredEvent, tpl: LockedUsersInstance) {
    if (confirm(TAPi18n.__('accounts-lockout-confirm-unlock-all'))) {
      // err/result: any — untyped Meteor method callback.
      Meteor.call('unlockAllUsers', (err: any, result: any) => {
        if (err) {
          const reason = err.reason || '';
          const message = `${TAPi18n.__(err.error)}\n${reason}`;
          alert(message);
          return;
        }

        if (result) {
          alert(TAPi18n.__('accounts-lockout-user-unlocked'));
          tpl.refreshLockedUsers();
        }
      });
    }
  },
  'click button.js-lockout-save'() {
    // Get values from form
    // parseInt args below cast to any — jQuery .val() returns string|number|string[].
    // .val() as string — jQuery typing is string|number|string[]; these inputs hold text.
    const knownFailuresBeforeLockout = parseInt($('#known-failures-before-lockout').val() as string, 10) || 3;
    const knownLockoutPeriod = parseInt($('#known-lockout-period').val() as string, 10) || 60;
    const knownFailureWindow = parseInt($('#known-failure-window').val() as string, 10) || 15;

    const unknownFailuresBeforeLockout = parseInt($('#unknown-failures-before-lockout').val() as string, 10) || 3;
    const unknownLockoutPeriod = parseInt($('#unknown-lockout-period').val() as string, 10) || 60;
    const unknownFailureWindow = parseInt($('#unknown-failure-window').val() as string, 10) || 15;

    // Update the database
    LockoutSettings.update('known-failuresBeforeLockout', {
      $set: { value: knownFailuresBeforeLockout },
    });
    LockoutSettings.update('known-lockoutPeriod', {
      $set: { value: knownLockoutPeriod },
    });
    LockoutSettings.update('known-failureWindow', {
      $set: { value: knownFailureWindow },
    });

    LockoutSettings.update('unknown-failuresBeforeLockout', {
      $set: { value: unknownFailuresBeforeLockout },
    });
    LockoutSettings.update('unknown-lockoutPeriod', {
      $set: { value: unknownLockoutPeriod },
    });
    LockoutSettings.update('unknown-failureWindow', {
      $set: { value: unknownFailureWindow },
    });

    // Reload the AccountsLockout configuration
    // err/ret: any — untyped Meteor method callback.
    Meteor.call('reloadAccountsLockout', (err: any, ret: any) => {
      if (!err && ret) {
        const message = TAPi18n.__('accounts-lockout-settings-updated');
        alert(message);
      } else {
        const reason = err?.reason || '';
        const message = `${TAPi18n.__(err?.error || 'error-updating-settings')}\n${reason}`;
        alert(message);
      }
    });
  },
});
