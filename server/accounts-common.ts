import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

Meteor.startup(() => {
  Accounts.config({
    // The env var is a string when set; narrow the `string | number` union to the
    // `number` this option expects (the value is only ever used as a day count).
    loginExpirationInDays: (process.env.ACCOUNTS_COMMON_LOGIN_EXPIRATION_IN_DAYS || 90) as number,
  });
});
