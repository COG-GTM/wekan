// a map of notification service, like email, web, IM, qq, etc.
import { ReactiveCache } from '/imports/reactiveCache';

// serviceName -> callback(user, title, description, params)
// expected arguments to callback:
// - user: Meteor user object
// - title: String, TAPi18n key
// - description, String, TAPi18n key
// - params: Object, values extracted from context, to used for above two TAPi18n keys
//   see example call to Notifications.notify() in models/activities.js
const notifyServices: { [serviceName: string]: NotifyCallback } = {};

export const Notifications = {
  subscribe: (serviceName: string, callback: NotifyCallback) => {
    notifyServices[serviceName] = callback;
  },

  unsubscribe: (serviceName: string) => {
    if (typeof notifyServices[serviceName] === 'function')
      delete notifyServices[serviceName];
  },

  getUsers: async (watchers: string[]) => {
    const users = [];
    for (const userId of watchers) {
      const user = await ReactiveCache.getUser(userId);
      if (user && user._id) users.push(user);
    }
    return users;
  },

  // `user` is a Wekan user model instance (dynamic helper surface), hence `any`.
  notify: (user: any, title: string, description: string, params: NotifyParams) => {
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

// A notification's template params: a dynamic bag of context values (card/list/
// board titles, urls, ids, etc.) interpolated into TAPi18n message keys. The
// keys and value types vary per activity, hence the `any` index signature.
export interface NotifyParams {
  [key: string]: any;
}

// A notification delivery callback (email/web/profile/...). `user` is a Wekan
// user model instance whose helper method surface varies per service, hence
// `any`.
export type NotifyCallback = (
  user: any,
  title: string,
  description: string,
  params: NotifyParams,
) => void | Promise<void>;
