import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import Avatars from '../../models/avatars';
import { ReactiveCache } from '/imports/reactiveCache';

Meteor.publish('my-avatars', async function() {
  const ret = (await ReactiveCache.getAvatars({ userId: this.userId }, {}, true)).cursor;
  return ret;
});

Meteor.publish('avatars-for-user', async function(targetUserId: string) {
  check(targetUserId, String);
  // Allow admins to view avatars for any user.
  // `this.userId` is `string | null` (null when the subscription is
  // unauthenticated); findOneAsync then resolves to undefined and the guard
  // below returns this.ready(). Cast preserves that pre-existing behavior.
  const currentUser = await Meteor.users.findOneAsync(this.userId as string);
  if (!currentUser || !currentUser.isAdmin) {
    return this.ready();
  }
  const ret = (await ReactiveCache.getAvatars({ userId: targetUserId }, {}, true)).cursor;
  return ret;
});
