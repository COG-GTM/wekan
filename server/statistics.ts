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
      const statistics: AppStatistics = {};
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
        const mongo = MongoInternals.defaultRemoteCollectionDriver()
          .mongo as WekanMongoConnection;
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
      const client = (MongoInternals.defaultRemoteCollectionDriver()?.mongo as
        WekanMongoConnection | undefined)?.client;
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

interface OsStatistics {
  type: string;
  platform: string;
  arch: string;
  release: string;
  uptime: number;
  loadavg: number[];
  totalmem: number;
  freemem: number;
  // node's os.cpus() detail array; its per-core shape is not consumed here.
  cpus: WekanDocumentField;
}

interface ProcessStatistics {
  nodeVersion: string;
  pid: number;
  uptime: number;
}

interface NodeHeapStatistics {
  totalHeapSize: number;
  totalHeapSizeExecutable: number;
  totalPhysicalSize: number;
  totalAvailableSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
  mallocedMemory: number;
  peakMallocedMemory: number;
  doesZapGarbage: number;
  numberOfNativeContexts: number;
  numberOfDetachedContexts: number;
}

interface NodeMemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
}

interface MeteorStatistics {
  meteorVersion: string;
}

interface MongoStatistics {
  // Values come from the untyped Mongo `serverStatus`/`buildinfo` commands or a
  // literal 'unknown' fallback, so they arrive through the interop alias.
  mongoVersion: WekanDocumentField;
  mongoStorageEngine: WekanDocumentField;
  mongoOplogEnabled: boolean;
}

interface SessionStatistics {
  sessionsCount?: number;
}

interface AppStatistics {
  version?: string;
  os?: OsStatistics;
  process?: ProcessStatistics;
  nodeHeapStats?: NodeHeapStatistics;
  nodeMemoryUsage?: NodeMemoryUsage;
  meteor?: MeteorStatistics;
  mongo?: MongoStatistics;
  session?: SessionStatistics;
}
