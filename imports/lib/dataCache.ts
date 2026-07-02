import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';

class ReactiveValueCache {
  // Cached values are arbitrary reactive query/document results; this is a
  // general-purpose string-keyed cache, so the stored value type is `any`.
  shouldStop: (key: string) => boolean;
  compare: (a: any, b: any) => boolean;
  values: Record<string, any>;
  deps: Record<string, Tracker.Dependency>;

  constructor(
    compare?: (a: any, b: any) => boolean,
    shouldStop?: (key: string) => boolean,
  ) {
    this.shouldStop = shouldStop || (() => true);
    this.compare = compare || ((a, b) => a === b);
    this.values = {};
    this.deps = {};
  }

  ensureDependency(key: string) {
    if (!this.deps[key]) {
      this.deps[key] = new Tracker.Dependency();
    }
    return this.deps[key];
  }

  checkDeletion(key: string) {
    const dep = this.ensureDependency(key);
    if (dep.hasDependents()) {
      return false;
    }
    delete this.values[key];
    delete this.deps[key];
    return true;
  }

  del(key: string) {
    const dep = this.ensureDependency(key);
    delete this.values[key];
    if (this.checkDeletion(key)) {
      return;
    }
    dep.changed();
  }

  // `data` is the arbitrary cached value (see class note above).
  set(key: string, data: any, bypassCompare?: boolean) {
    const dep = this.ensureDependency(key);
    const current = this.values[key];
    this.values[key] = data;
    if (!this.compare(current, data) || bypassCompare) {
      dep.changed();
    }
  }

  get(key: string) {
    const data = this.values[key];
    if (Tracker.currentComputation) {
      const dep = this.ensureDependency(key);
      dep.depend();
      Tracker.currentComputation!.onStop(() => {
        if (!this.shouldStop(key)) {
          return;
        }
        this.checkDeletion(key);
      });
    }
    return data;
  }
}

class DataCache {
  // `getData` returns arbitrary reactive data keyed by string, so its result
  // type is `any` (this is a general-purpose cache).
  options: { timeout: number; compare?: DataCacheCompare };
  getData: (key: string) => any;
  cache: ReactiveValueCache;
  timeouts: Record<string, ReturnType<typeof setTimeout>>;
  computations: Record<string, Tracker.Computation>;

  constructor(
    getData: (key: string) => any,
    options?: DataCacheOptions | DataCacheCompare,
  ) {
    this.options = {
      timeout: 60 * 1000,
      ...(typeof options === 'function' ? { compare: options } : options),
    };
    this.getData = getData;
    this.cache = new ReactiveValueCache(this.options.compare, () => false);
    this.timeouts = {};
    this.computations = {};
  }

  ensureComputation(key: string) {
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key]);
      delete this.timeouts[key];
    }
    if (this.computations[key] && !this.computations[key].stopped) {
      return;
    }
    this.computations[key] = Tracker.nonreactive(() =>
      Tracker.autorun(() => {
        this.cache.set(key, this.getData(key));
      }),
    );

    this.computations[key].onInvalidate(() => this.checkStop(key));
  }

  checkStop(key: string) {
    if (this.cache.ensureDependency(key).hasDependents()) {
      return;
    }
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key]);
      delete this.timeouts[key];
    }
    this.timeouts[key] = setTimeout(() => {
      delete this.timeouts[key];
      if (!this.computations[key]) {
        return;
      }
      // A dependent may have re-attached during the timeout window (e.g. the
      // board view re-rendered). Re-check before tearing down, otherwise we
      // stop the live computation and delete a value something is still using,
      // which surfaces as a transient `undefined` (the board-not-found flicker).
      if (this.cache.ensureDependency(key).hasDependents()) {
        return;
      }
      this.computations[key].stop();
      delete this.computations[key];
      this.cache.del(key);
    }, this.options.timeout);
  }

  get(key: string) {
    if (!Tracker.currentComputation) {
      let data = this.cache.get(key);
      if (data == null) {
        data = this.getData(key);
        this.cache.set(key, data);
        this.checkStop(key);
      }
      return data;
    }

    this.ensureComputation(key);
    const data = this.cache.get(key);
    Tracker.currentComputation!.onStop(() => this.checkStop(key));
    return data;
  }
}

// `compare` receives two arbitrary cached values (see DataCache class note).
type DataCacheCompare = (a: any, b: any) => boolean;

interface DataCacheOptions {
  timeout?: number;
  compare?: DataCacheCompare;
}

export { DataCache };
export default DataCache;
