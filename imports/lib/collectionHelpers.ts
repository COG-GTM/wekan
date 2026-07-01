/**
 * Collection helper functions replacing underscore.js utilities.
 * These are used across both client and server code.
 */

/**
 * Find the first object in an array where all key-value pairs in `props` match.
 * Replacement for _.findWhere(arr, props)
 */
export function findWhere<T extends object>(
  arr: T[] | null | undefined,
  props: Partial<T>,
) {
  if (!arr) return undefined;
  const keys = Object.keys(props) as (keyof T)[];
  return arr.find(item => keys.every(k => item[k] === props[k]));
}

/**
 * Find all objects in an array where all key-value pairs in `props` match.
 * Replacement for _.where(arr, props)
 */
export function where<T extends object>(
  arr: T[] | null | undefined,
  props: Partial<T>,
) {
  if (!arr) return [];
  const keys = Object.keys(props) as (keyof T)[];
  return arr.filter(item => keys.every(k => item[k] === props[k]));
}

/**
 * Deduplicate an array of objects by a property name, keeping first occurrence.
 * Replacement for _.uniq(arr, prop)
 */
export function uniqBy<T extends object>(
  arr: T[] | null | undefined,
  prop: keyof T,
) {
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
export function groupBy<T extends object>(
  arr: T[] | null | undefined,
  keyOrFn: keyof T | ((item: T) => PropertyKey),
) {
  if (!arr) return {} as Record<string, T[]>;
  const getKey: (item: T) => PropertyKey =
    typeof keyOrFn === 'function' ? keyOrFn : (item: T) => item[keyOrFn] as PropertyKey;
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = getKey(item) as string;
    (result[key] || (result[key] = [])).push(item);
  }
  return result;
}

/**
 * Index an array by a property, mapping each key to a single item (last wins).
 * Replacement for _.indexBy(arr, prop)
 */
export function indexBy<T extends object>(
  arr: T[] | null | undefined,
  prop: keyof T,
) {
  if (!arr) return {} as Record<string, T>;
  const result: Record<string, T> = {};
  for (const item of arr) {
    result[item[prop] as PropertyKey as string] = item;
  }
  return result;
}

/**
 * Create a debounced version of a function.
 * Replacement for _.debounce(fn, wait)
 */
export function debounce<F extends (...args: never[]) => void>(
  fn: F,
  wait: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (this: ThisParameterType<F>, ...args: Parameters<F>) {
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
export function once<F extends (...args: never[]) => void>(fn: F) {
  let called = false;
  let result: ReturnType<F>;
  return function (this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    if (called) return result;
    called = true;
    result = fn.apply(this, args) as ReturnType<F>;
    return result;
  };
}
