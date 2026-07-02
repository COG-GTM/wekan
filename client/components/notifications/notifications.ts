import { ReactiveCache } from '/imports/reactiveCache';
import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';

// this hides the notifications drawer if anyone clicks off of the panel
Template.body.events({
  click(event: Meteor.Event) {
    if (
      !$(event.target).is('#notifications *') &&
      Session.get('showNotificationsDrawer')
    ) {
      toggleNotificationsDrawer();
    }
  },
});

Template.notifications.helpers({
  unreadNotifications() {
    const notifications = ReactiveCache.getCurrentUser().notifications();
    const unreadNotifications = notifications.filter((v: any) => !v.read);
    return unreadNotifications.length;
  },
});

Template.notifications.events({
  'click .notifications-drawer-toggle'() {
    toggleNotificationsDrawer();
  },
});

export function toggleNotificationsDrawer() {
  Session.set(
    'showNotificationsDrawer',
    !Session.get('showNotificationsDrawer'),
  );
}
