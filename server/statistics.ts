import { ReactiveCache } from '/imports/reactiveCache';
import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';

// Sandstorm context is detected using the METEOR_SETTINGS environment variable
// in the package definition.
const isSandstorm =
  Meteor.settings && Meteor.settings.public && Meteor.settings.public.sandstorm;

Meteor.methods({
  async getStatistics() {
    const currentUser = await ReactiveCache.getCurrentUser();
    if (currentUser?.isAdmin) {
      const os = require('os');
      const pjson = require('/package.json');
      const statistics: Statistics = {};
      let wekanVersion = pjson.version;
      wekanVersion = wekanVersion.replace('v', '');
      statistics.version = wekanVersion;
      statistics.os = {
        type: os.type(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        cpus: os.cpus(),
      };
      let nodeVersion = process.version;
      nodeVersion = nodeVersion.replace('v', '');
      statistics.process = {
        nodeVersion,
        pid: process.pid,
        uptime: process.uptime(),
      };
      if (!isSandstorm) {
        const v8 = require('v8');
        statistics.nodeHeapStats = {
          totalHeapSize: v8.getHeapStatistics().total_heap_size,
          totalHeapSizeExecutable: v8.getHeapStatistics().total_heap_size_executable,
          totalPhysicalSize: v8.getHeapStatistics().total_physical_size,
          totalAvailableSize: v8.getHeapStatistics().total_available_size,
          usedHeapSize: v8.getHeapStatistics().used_heap_size,
          heapSizeLimit: v8.getHeapStatistics().heap_size_limit,
          mallocedMemory: v8.getHeapStatistics().malloced_memory,
          peakMallocedMemory: v8.getHeapStatistics().peak_malloced_memory,
          doesZapGarbage: v8.getHeapStatistics().does_zap_garbage,
          numberOfNativeContexts: v8.getHeapStatistics().number_of_native_contexts,
          numberOfDetachedContexts: v8.getHeapStatistics().number_of_detached_contexts,
        };
        let memoryUsage = process.memoryUsage();
        statistics.nodeMemoryUsage = {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
        };
      }
      let meteorVersion = Meteor.release;
      meteorVersion = meteorVersion.replace('METEOR@', '');
      statistics.meteor = {
        meteorVersion,
      };
      let mongoVersion;
      let mongoStorageEngine;
      let mongoOplogEnabled;
      try {
        const { mongo } = MongoInternals.defaultRemoteCollectionDriver() as { mongo: MongoConnection };
        mongoOplogEnabled = Boolean(
          mongo._oplogHandle && mongo._oplogHandle.onOplogEntry,
        );
        const { version, storageEngine } = await mongo.db.command({ serverStatus: 1 });
        mongoVersion = version;
        mongoStorageEngine = storageEngine.name;
      } catch (e) {
        try {
          const { mongo } = MongoInternals.defaultRemoteCollectionDriver();
          const { version } = await mongo.db.command({ buildinfo: 1 });
          mongoVersion = version;
          mongoStorageEngine = 'unknown';
          mongoOplogEnabled = false;
        } catch (e2) {
          mongoVersion = 'unknown';
          mongoStorageEngine = 'unknown';
          mongoOplogEnabled = false;
        }
      }
      statistics.mongo = {
        mongoVersion,
        mongoStorageEngine,
        mongoOplogEnabled,
      };
      const client = (MongoInternals.defaultRemoteCollectionDriver() as { mongo?: MongoConnection })?.mongo?.client;
      const sessionsCount = client?.s?.activeSessions?.size;
      statistics.session = {
        sessionsCount,
      };
      return statistics;
    } else {
      return false;
    }
  },
});

// The server statistics payload assembled by getStatistics. Each section is a
// grouped object; they are typed as `object` because the response is serialised
// verbatim and no field is read back after assignment.
interface Statistics {
  version?: string;
  os?: object;
  process?: object;
  nodeHeapStats?: object;
  nodeMemoryUsage?: object;
  meteor?: object;
  mongo?: object;
  session?: object;
}

// MongoInternals' remote driver connection exposes Meteor-internal fields
// (_oplogHandle, client) beyond the `{ db }` surface @types/meteor models.
interface MongoConnection {
  db: import('mongodb').Db;
  // Meteor oplog tailing handle; only tested for existence. `any` because its
  // onOplogEntry callback is a Meteor internal with no public type.
  _oplogHandle?: { onOplogEntry?: any };
  // Underlying mongodb driver client; only the active-session count is read.
  client?: { s?: { activeSessions?: { size?: number } } };
}
