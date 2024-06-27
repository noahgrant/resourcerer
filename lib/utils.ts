import type { LoadingStates } from "./types";

/**
 * Whether or not any loading state has errored. If a state is passed in,
 * check only that one, else we check for any.
 *
 * @param {string|string[]|object} loadingStates - specifics state to check for an error
 * @return {boolean}
 */
export const hasErrored = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).some((state) => state === "error");

/**
 * Whether or not any render-blocking loading state is still loading. If a
 * state is passed in, check only that one, else we check for any.
 *
 * @param {string|string[]|object} loadingStates - specific states to check if one is loading
 * @return {boolean}
 */
export const isLoading = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).some((state) => state === "loading");

/**
 * Whether or not all render-blocking loading states have loaded. If a
 * state is passed in, check only that one, else we check for all.
 *
 * @param {string|string[]|object} loadingStates - specific states to check that all have loaded
 * @return {boolean}
 */
export const hasLoaded = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).every((state) => state === "loaded");

/**
 * Whether or not any loading state is pending. If a state is passed in,
 * check only that one, else we check for any.
 *
 * @param {string|string[]|object} loadingStates - specifics state to check for an error
 * @return {boolean}
 */
export const isPending = (loadingStates: LoadingStates | LoadingStates[]): boolean =>
  qualifyLoadingStates(loadingStates).some((state) => state === "pending");

/* eslint-disable @typescript-eslint/no-empty-function */
export function noOp() {}

/**
 * Turns a snake-, spine-, or space-cased word into camelCase. Used to turn
 * resource keys (as input by the model map) into strings for prop prefixing.
 *
 * @param {string} word - string to camelcase
 * @return {string} camelCased word
 */
export function camelize(word = "") {
  const SPACERS = /[-_\s]+(.)?/g;

  // let words that are already camelCase pass, but still catch SINGLE WORD ALL CAPS
  if (!SPACERS.test(word) && word.toUpperCase() !== word) {
    return word;
  }

  return word
    .trim()
    .toLowerCase()
    .replace(SPACERS, (match, char) => char?.toUpperCase());
}

/**
 * @param {function} fn - method to invoke only once
 * @return {function} function, that, after getting invoked once, gets set to null
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
 *
 * @param {object} obj - object to pick properties from
 * @param {string[]} keys - list of keys to pick from obj
 * @return {object} new object with only those properties listed
 */
export function pick<T, K extends keyof T>(obj: T = {} as T, ...keys: K[]) {
  return keys.reduce(
    (memo, key) => {
      memo[key] = obj[key];

      return memo;
    },
    {} as { [P in K]: T[P] }
  );
}

/**
 * Inverse of pick; returns a new object with all properties _except_ those listed in keys.
 *
 * @param {object} obj - object to omit properties from
 * @param {string[]} keys - list of keys to omit from obj
 * @return {object} new object with only those properties not listed in keys
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T = {} as T,
  ...keys: K[]
) {
  return pick(obj, ...(Object.keys(obj).filter((key) => !keys.includes(key as K)) as K[]));
}

/**
 * Our helper loading methods can take many types: a single loading state, an
 * array of loading states. This method takes the different shapes and returns
 * an array of loading state values to be processed by the rest of the helper methods.
 *
 * @param {string|string[]} loadingStates - specific states to transform into an array
 * @return {string[]} - list of LoadingState values
 */
function qualifyLoadingStates(loadingStates: LoadingStates | LoadingStates[]) {
  if (!Array.isArray(loadingStates)) {
    if (loadingStates && typeof loadingStates === "object") {
      return Object.values(loadingStates);
    }

    return [loadingStates];
  }

  return loadingStates;
}

/**
 * Function that returns an optionally-prefixed unique value every time it's called (unpersisted,
 * of course).
 *
 * @return {function}
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
 *
 * @param {object} obj1 - first object to compare
 * @param {object} obj2 - second object to compare
 * @return {boolean} whether the two objects are equivalent by value
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
 *
 * @param {any[]} list - list of items to sort
 * @param {function} comparator - takes the list item and should return a value to compare with
 *   other items in the list
 * @param {any[]} - sorted list
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
 *
 * @param {object} obj - parent object of which to find property value
 * @param {any} prop - property of object to evaluate
 * @return {any} evaluated value of object at property
 */
export function result(obj: Record<string, any> = {}, prop: string, ...args: any[]) {
  return typeof obj[prop] === "function" ? obj[prop](...args) : obj[prop];
}
