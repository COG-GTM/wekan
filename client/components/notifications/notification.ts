import { ReactiveCache } from '/imports/reactiveCache';
import { formatDateByUserPreference } from '/imports/lib/dateUtils';
import Users from '/models/users';
import { Template } from 'meteor/templating';

Template.notification.events({
  async 'click .read-status .materialCheckBox'(this: any) {
    const update: { [key: string]: Date | null } = {};
    const newReadValue = this.read ? null : new Date();
    update[`profile.notifications.${this.index}.read`] = newReadValue;

    // error: any — Meteor updateAsync rejection is an untyped Meteor.Error.
    await Users.updateAsync(Meteor.userId()!, { $set: update }).catch((error: any) => {
      if (error) {
        console.error('Error updating notification:', error);
      }
    });
  },
  'click .remove a'(this: any) {
    ReactiveCache.getCurrentUser().removeNotification(this.activityData._id);
  },
});

Template.notification.helpers({
  mode: 'board',
  isOfActivityType(activityId: string, type: string) {
    const activity = ReactiveCache.getActivity(activityId);
    return activity && activity.activityType === type;
  },
  activityType(activityId: string) {
    const activity = ReactiveCache.getActivity(activityId);
    return activity ? activity.activityType : '';
  },
  activityUser(activityId: string) {
    const activity = ReactiveCache.getActivity(activityId);
    return activity && activity.userId;
  },
  activityDate(this: any) {
    const activity = this.activityData;
    if (!activity || !activity.createdAt) return '';

    const user = ReactiveCache.getCurrentUser();
    if (!user) return '';

    const dateObj = new Date(activity.createdAt);
    if (Number.isNaN(dateObj.getTime())) return '';

    const dateFormat = user.getDateFormat ? user.getDateFormat() : 'YYYY-MM-DD';
    const datePart = formatDateByUserPreference(dateObj, dateFormat, false);
    const timePart = dateObj.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${datePart} ${timePart}`.trim();
  },
});
