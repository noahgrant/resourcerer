import type { LoadingStates } from "./types.js";

/**
 * Returns true if any loadingStates are "error". Can take a single or a list of LoadingStates.
 */
export const hasErrored = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).some((state) => state === "error");

/**
 * Returns true if any loadingStates are "loading" and none have errored, since once one has errored
 * we know the whole group must be in an error state. Can take a single or a list of LoadingStates.
 */
export const isLoading = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).some((state) => state === "loading") &&
  !qualifyLoadingStates(loadingStates).some((state) => state === "error");

/**
 * Returns true if all loadingStates are "loaded". Can take a single or a list of LoadingStates.
 */
export const hasLoaded = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).every((state) => state === "loaded");

/**
 * Returns true if any loadingStates are "pending". Can take a single or a list of LoadingStates.
 */
export const isPending = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).some((state) => state === "pending");

/* eslint-disable @typescript-eslint/no-empty-function */
export function noOp() {}

/**
 * Returns a function that will only ever be invoked once.
 */
export function once(fn: (...args: any[]) => void) {
  let invoked = false;

  return (...args: any[]) => {
    if (!invoked) {
      fn.call(null, ...args);
      invoked = true;
    }
  };
}

/**
 * Returns a new object with only those properties listed in keys.
 */
export function pick<T, K extends keyof T>(obj: T = {} as T, ...keys: K[]) {
  return keys.reduce(
    (memo, key) => {
      if (obj[key]) {
        memo[key] = obj[key];
      }

      return memo;
    },
    {} as { [P in K]: T[P] }
  );
}

/**
 * Inverse of pick; returns a new object with all properties _except_ those listed in keys.
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T = {} as T,
  ...keys: K[]
) {
  return pick(obj, ...(Object.keys(obj).filter((key) => !keys.includes(key as K)) as K[]));
}

function qualifyLoadingStates(loadingStates: LoadingStates | LoadingStates[]): LoadingStates[] {
  if (!Array.isArray(loadingStates)) {
    return [loadingStates];
  }

  return loadingStates;
}

/**
 * Function that returns an optionally-prefixed unique value every time it's called (unpersisted,
 * of course).
 */
export const uniqueId = (() => {
  let count = 0;

  return (prefix = "") => {
    count++;

    return `${prefix}${count}`;
  };
})();

/**
 * Used to throw when a url function or property has not been specified on a Model or Collection.
 */
export function urlError() {
  throw new Error('A "url" property or function must be specified');
}

/**
 * Does a nested comparison between two objects to determine whether or not they are equivalent by
 * value.
 */
export function isDeepEqual(obj1: Record<string, any>, obj2: Record<string, any>) {
  if (obj1 === obj2) {
    return true;
  } else if (
    typeof obj1 === "object" &&
    obj1 !== null &&
    typeof obj2 === "object" &&
    obj2 !== null
  ) {
    if (Object.keys(obj1).length !== Object.keys(obj2).length) {
      return false;
    }

    for (let prop in obj1) {
      if (prop in obj2) {
        if (!isDeepEqual(obj1[prop], obj2[prop])) {
          return false;
        }
      } else {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Sorting function that mirrors the underscore version. This is used by collections with comparator
 * properties.
 */
export function sortBy(list: any[] = [], comparator: (val: any) => string | number) {
  return list
    .map((value, index) => ({ value, index, criteria: comparator(value) }))
    .sort((left, right) => {
      const a = left.criteria;
      const b = right.criteria;

      if (a !== b) {
        if (a > b || a === undefined) {
          return 1;
        } else if (a < b || b === undefined) {
          return -1;
        }
      }

      return left.index - right.index;
    })
    .map(({ value }) => value);
}

/**
 * Helper method for those properties that can optionally be functions.
 */
export function result(obj: Record<string, any> = {}, prop: string, ...args: any[]) {
  return typeof obj[prop] === "function" ? obj[prop](...args) : obj[prop];
}
