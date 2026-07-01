import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

Meteor.startup(() => {
  Accounts.config({
    // The env var arrives as a string at runtime (or falls back to the numeric
    // default); Meteor coerces it, so narrow the string|number union here.
    loginExpirationInDays: (process.env.ACCOUNTS_COMMON_LOGIN_EXPIRATION_IN_DAYS ||
      90) as number,
  });
});
