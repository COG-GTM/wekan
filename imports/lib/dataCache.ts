import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';

class ReactiveValueCache<V> {
  private shouldStop: ShouldStopFn;
  private compare: CompareFn<V>;
  private values: Record<string, V>;
  private deps: Record<string, Tracker.Dependency>;

  constructor(compare?: CompareFn<V>, shouldStop?: ShouldStopFn) {
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

  private checkDeletion(key: string) {
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

  set(key: string, data: V, bypassCompare?: boolean) {
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
      Tracker.currentComputation.onStop(() => {
        if (!this.shouldStop(key)) {
          return;
        }
        this.checkDeletion(key);
      });
    }
    return data;
  }
}

class DataCache<V> {
  private options: { timeout: number; compare?: CompareFn<V> };
  private getData: (key: string) => V;
  private cache: ReactiveValueCache<V>;
  private timeouts: Record<string, ReturnType<typeof setTimeout>>;
  private computations: Record<string, Tracker.Computation>;

  constructor(
    getData: (key: string) => V,
    options?: CompareFn<V> | DataCacheOptions<V>,
  ) {
    this.options = {
      timeout: 60 * 1000,
      ...(typeof options === 'function' ? { compare: options } : options),
    };
    this.getData = getData;
    this.cache = new ReactiveValueCache<V>(this.options.compare, () => false);
    this.timeouts = {};
    this.computations = {};
  }

  private ensureComputation(key: string) {
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

  private checkStop(key: string) {
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

  get(key?: string) {
    // Some callers use DataCache as a single-value (keyless) cache and invoke
    // get() with no key; the legacy runtime coerces the absent key to the
    // "undefined" string when indexing, which this cast preserves.
    const cacheKey = key as string;
    if (!Tracker.currentComputation) {
      let data = this.cache.get(cacheKey);
      if (data == null) {
        data = this.getData(cacheKey);
        this.cache.set(cacheKey, data);
        this.checkStop(cacheKey);
      }
      return data;
    }

    this.ensureComputation(cacheKey);
    const data = this.cache.get(cacheKey);
    Tracker.currentComputation.onStop(() => this.checkStop(cacheKey));
    return data;
  }
}

type CompareFn<V> = (a: V, b: V) => boolean;
type ShouldStopFn = (key: string) => boolean;

interface DataCacheOptions<V> {
  timeout?: number;
  compare?: CompareFn<V>;
}

export { DataCache };
export default DataCache;
