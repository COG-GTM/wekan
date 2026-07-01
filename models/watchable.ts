import { Mongo } from 'meteor/mongo';
import Boards from '/models/boards';
import Lists from '/models/lists';
import Cards from '/models/cards';

type WatchableCollection = Mongo.Collection<WekanDocumentField>;
type WatchLevel = string | boolean | null | undefined;

// simple version, only toggle watch / unwatch
const simpleWatchable = (collection: WatchableCollection) => {
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

    async setWatcher(userId: string, level: WatchLevel) {
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

const complexWatchable = (collection: WatchableCollection) => {
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
      return (this.watchers || []).map((x: WekanDocumentField) => x.userId).indexOf(userId);
    },

    findWatcher(userId: string) {
      return (this.watchers || []).find((w: WekanDocumentField) => w.userId === userId);
    },

    getWatchLevel(userId: string) {
      const watcher = this.findWatcher(userId);
      return watcher ? watcher.level : complexWatchDefault;
    },

    async setWatcher(userId: string, level: WatchLevel) {
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
