// a map of notification service, like email, web, IM, qq, etc.
import { Meteor } from 'meteor/meteor';
import { ReactiveCache } from '/imports/reactiveCache';

// serviceName -> callback(user, title, description, params)
// expected arguments to callback:
// - user: Meteor user object
// - title: String, TAPi18n key
// - description, String, TAPi18n key
// - params: Object, values extracted from context, to used for above two TAPi18n keys
//   see example call to Notifications.notify() in models/activities.js
const notifyServices: Record<string, NotificationCallback> = {};

export const Notifications = {
  subscribe: (serviceName: string, callback: NotificationCallback) => {
    notifyServices[serviceName] = callback;
  },

  unsubscribe: (serviceName: string) => {
    if (typeof notifyServices[serviceName] === 'function')
      delete notifyServices[serviceName];
  },

  getUsers: async (watchers: string[]) => {
    const users: Meteor.User[] = [];
    for (const userId of watchers) {
      const user = await ReactiveCache.getUser(userId);
      if (user && user._id) users.push(user);
    }
    return users;
  },

  notify: (
    user: Meteor.User,
    title: string,
    description: string,
    params: NotificationParams,
  ) => {
    // Skip if user is invalid
    if (!user || !user._id) return;

    for (const k in notifyServices) {
      const notifyImpl = notifyServices[k];
      if (notifyImpl && typeof notifyImpl === 'function') {
        try {
          Promise.resolve(
            notifyImpl(user, title, description, params),
          ).catch(error => {
            console.error(`Notification service "${k}" failed:`, error);
          });
        } catch (error) {
          console.error(`Notification service "${k}" failed:`, error);
        }
      }
    }
  },
};

// The context values extracted per activity and forwarded to notification
// services / TAPi18n interpolation. Different activity types carry different
// fields (card, list, board, comment, url, activityId, …), so the payload is
// modelled as an open shape.
interface NotificationParams {
  [key: string]: WekanDocumentField;
}

// A registered notification service (email, web, profile, …). Receives the
// recipient Meteor user plus the TAPi18n title/description keys and the context
// params; it may run synchronously or return a promise.
type NotificationCallback = (
  user: Meteor.User,
  title: string,
  description: string,
  params: NotificationParams,
) => void | Promise<void>;
