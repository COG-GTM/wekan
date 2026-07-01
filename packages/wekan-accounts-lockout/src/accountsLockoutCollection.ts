import { Meteor } from 'meteor/meteor';

export default new Meteor.Collection<LockoutConnectionDoc>('AccountsLockout.Connections');
