import { Meteor } from 'meteor/meteor';
import type { ConnectionDoc } from './types';

export default new Meteor.Collection<ConnectionDoc>('AccountsLockout.Connections');
