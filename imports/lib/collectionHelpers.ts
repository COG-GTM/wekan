/**
 * Collection helper functions replacing underscore.js utilities.
 * These are used across both client and server code.
 */

/**
 * Find the first object in an array where all key-value pairs in `props` match.
 * Replacement for _.findWhere(arr, props)
 */
export function findWhere<T>(
  arr: T[] | null | undefined,
  props: Partial<T>,
): T | undefined {
  if (!arr) return undefined;
  const keys = Object.keys(props) as Array<keyof T>;
  return arr.find(item => keys.every(k => item[k] === props[k]));
}

/**
 * Find all objects in an array where all key-value pairs in `props` match.
 * Replacement for _.where(arr, props)
 */
export function where<T>(
  arr: T[] | null | undefined,
  props: Partial<T>,
): T[] {
  if (!arr) return [];
  const keys = Object.keys(props) as Array<keyof T>;
  return arr.filter(item => keys.every(k => item[k] === props[k]));
}

/**
 * Deduplicate an array of objects by a property name, keeping first occurrence.
 * Replacement for _.uniq(arr, prop)
 */
export function uniqBy<T>(
  arr: T[] | null | undefined,
  prop: keyof T,
): T[] {
  if (!arr) return [];
  const seen = new Set<T[keyof T]>();
  return arr.filter(item => {
    const val = item[prop];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

/**
 * Group an array by a property name or function.
 * Replacement for _.groupBy(arr, keyOrFn)
 */
export function groupBy<T>(
  arr: T[] | null | undefined,
  keyOrFn: keyof T | ((item: T) => PropertyKey),
): Record<string, T[]> {
  if (!arr) return {};
  const getKey =
    typeof keyOrFn === 'function' ? keyOrFn : (item: T) => item[keyOrFn];
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = String(getKey(item));
    (result[key] || (result[key] = [])).push(item);
  }
  return result;
}

/**
 * Index an array by a property, mapping each key to a single item (last wins).
 * Replacement for _.indexBy(arr, prop)
 */
export function indexBy<T>(
  arr: T[] | null | undefined,
  prop: keyof T,
): Record<string, T> {
  if (!arr) return {};
  const result: Record<string, T> = {};
  for (const item of arr) {
    result[String(item[prop])] = item;
  }
  return result;
}

/**
 * Create a debounced version of a function.
 * Replacement for _.debounce(fn, wait)
 */
// `A`/`this` are `any` because this is a generic wrapper over an arbitrary
// callback whose argument tuple and receiver are defined entirely by the caller.
export function debounce<A extends any[]>(
  fn: (...args: A) => void,
  wait: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (this: any, ...args: A) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}

/**
 * Create a function that executes at most once.
 * Replacement for _.once(fn)
 */
// `A`/`this` are `any` for the same reason as debounce(): the wrapped callback's
// argument tuple and receiver are entirely caller-defined.
export function once<A extends any[], R>(fn: (...args: A) => R) {
  let called = false;
  let result: R;
  return function (this: any, ...args: A) {
    if (called) return result;
    called = true;
    result = fn.apply(this, args);
    return result;
  };
}
