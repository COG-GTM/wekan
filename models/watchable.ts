import { Mongo } from 'meteor/mongo';
import Boards from '/models/boards';
import Lists from '/models/lists';
import Cards from '/models/cards';

// simple version, only toggle watch / unwatch
const simpleWatchable = (collection: Mongo.Collection<any>) => {
  collection.attachSchema({
    watchers: {
      type: Array,
      optional: true,
    },
    'watchers.$': {
      type: String,
    },
  });

  collection.helpers({
    getWatchLevels() {
      return [true, false];
    },

    watcherIndex(userId: string) {
      return this.watchers.indexOf(userId);
    },

    findWatcher(userId: string) {
      return (this.watchers || []).includes(userId);
    },

    async setWatcher(userId: string, level: any) {
      // if level undefined or null or false, then remove
      if (!level) {
        return await collection.updateAsync(this._id, { $pull: { watchers: userId } });
      }
      return await collection.updateAsync(this._id, { $addToSet: { watchers: userId } });
    },
  });
};

// more complex version of same interface, with 3 watching levels
const complexWatchOptions = ['watching', 'tracking', 'muted'];
const complexWatchDefault = 'muted';

const complexWatchable = (collection: Mongo.Collection<any>) => {
  collection.attachSchema({
    watchers: {
      type: Array,
      optional: true,
    },
    'watchers.$': {
      type: Object,
    },
    'watchers.$.userId': {
      type: String,
    },
    'watchers.$.level': {
      type: String,
      allowedValues: complexWatchOptions,
    },
  });

  collection.helpers({
    getWatchOptions() {
      return complexWatchOptions;
    },

    getWatchDefault() {
      return complexWatchDefault;
    },

    watcherIndex(userId: string) {
      return (this.watchers || []).map((x: any) => x.userId).indexOf(userId);
    },

    findWatcher(userId: string) {
      return (this.watchers || []).find((w: any) => w.userId === userId);
    },

    getWatchLevel(userId: string) {
      const watcher = this.findWatcher(userId);
      return watcher ? watcher.level : complexWatchDefault;
    },

    // `level` is a dynamic watch level (string | null | false), hence `any`.
    async setWatcher(userId: string, level: any) {
      // if level undefined or null or false, then remove
      if (level === complexWatchDefault) level = null;
      if (!level) {
        return await collection.updateAsync(this._id, { $pull: { watchers: { userId } } });
      }
      const index = this.watcherIndex(userId);
      if (index < 0) {
        return await collection.updateAsync(this._id, { $push: { watchers: { userId, level } } });
      }
      return await collection.updateAsync(this._id, {
        $set: { [`watchers.${index}.level`]: level },
      });
    },
  });
};

complexWatchable(Boards);
simpleWatchable(Lists);
simpleWatchable(Cards);
