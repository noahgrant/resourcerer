import {LoadingStates} from './constants';

/**
 * Whether or not any loading state has errored. If a state is passed in,
 * check only that one, else we check for any.
 *
 * @param {string|string[]|object} loadingStates - specifics state to check for an error
 * @return {boolean}
 */
export const hasErrored = (loadingStates) =>
  qualifyLoadingStates(loadingStates).some((state) => state === LoadingStates.ERROR);

/**
 * Whether or not any render-blocking loading state is still loading. If a
 * state is passed in, check only that one, else we check for any.
 *
 * @param {string|string[]|object} loadingStates - specific states to check if one is loading
 * @return {boolean}
 */
export const isLoading = (loadingStates) =>
  qualifyLoadingStates(loadingStates).some((state) => state === LoadingStates.LOADING);

/**
 * Whether or not all render-blocking loading states have loaded. If a
 * state is passed in, check only that one, else we check for all.
 *
 * @param {string|string[]|object} loadingStates - specific states to check that all have loaded
 * @return {boolean}
 */
export const hasLoaded = (loadingStates) =>
  qualifyLoadingStates(loadingStates).every((state) => state === LoadingStates.LOADED);

/**
 * Whether or not any loading state is pending. If a state is passed in,
 * check only that one, else we check for any.
 *
 * @param {string|string[]|object} loadingStates - specifics state to check for an error
 * @return {boolean}
 */
export const isPending = (loadingStates) =>
  qualifyLoadingStates(loadingStates).some((state) => state === LoadingStates.PENDING);

export function noOp() {}

/**
 * Turns a snake-, spine-, or space-cased word into camelCase. Used to turn
 * resource keys (as input by the model map) into strings for prop prefixing.
 *
 * @param {string} word - string to camelcase
 * @return {string} camelCased word
 */
export function camelize(word='') {
  const SPACERS = /[-_\s]+(.)?/g;

  // let words that are already camelCase pass, but still catch SINGLE WORD ALL CAPS
  if (!SPACERS.test(word) && word.toUpperCase() !== word) {
    return word;
  }

  return word.trim().toLowerCase()
      .replace(SPACERS, (match, char) => char ? char.toUpperCase() : '');
}

/**
 * @param {function} fn - method to invoke only once
 * @return {function} function, that, after getting invoked once, gets set to null
 */
export function once(fn) {
  return (...args) => {
    if (fn) {
      fn.call(null, ...args);
      fn = null;
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
export function pick(obj={}, ...keys) {
  return keys.reduce((memo, key) => {
    if (obj.hasOwnProperty(key)) {
      memo[key] = obj[key];
    }

    return memo;
  }, {});
}

/**
 * Inverse of pick; returns a new object with all properties _except_ those listed in keys.
 *
 * @param {object} obj - object to omit properties from
 * @param {string[]} keys - list of keys to omit from obj
 * @return {object} new object with only those properties not listed in keys
 */
export function omit(obj={}, ...keys) {
  return pick(obj, ...Object.keys(obj).filter((key) => !keys.includes(key)));
}

/**
 * Our helper loading methods can take many types: a single loading state, an
 * array of loading states, or an object whose values are loading states. This
 * method takes the different shapes and returns an array of loading state
 * values to be processed by the rest of the helper methods.
 *
 * @param {string|string[]|object} loadingStates - specific states to transform into an array
 * @return {string[]} - list of LoadingState values
 */
function qualifyLoadingStates(loadingStates) {
  if (!Array.isArray(loadingStates)) {
    if (loadingStates && typeof loadingStates === 'object') {
      return Object.values(loadingStates);
    }

    return [loadingStates];
  }

  return loadingStates;
}

export const uniqueId = (() => {
  var count = 0;

  return (prefix='') => {
    count++;

    return `${prefix}${count}`;
  };
})();

// Throw an error when a URL is needed, and none is supplied.
export function urlError() {
  throw new Error('A "url" property or function must be specified');
}

// Wrap an optional error callback with a fallback error event.
export function wrapError(model, options) {
  var error = options.error;

  options.error = function(resp) {
    if (error) {
      error.call(options.context, model, resp, options);
    }

    return Promise.reject([model, resp, options]);
  };
}

export function isDeepEqual(obj1, obj2) {
  if (obj1 === obj2) {
    return true;
  } else if ((typeof obj1 === 'object' && obj1 !== null) &&
    (typeof obj2 === 'object' && obj2 !== null)) {
    if (Object.keys(obj1).length !== Object.keys(obj2).length) {
      return false;
    }

    for (let prop in obj1) {
      if (obj2.hasOwnProperty(prop)) {
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

export function sortBy(list=[], comparator) {
  /* eslint-disable id-length */
  return list.map((value, index) => ({value, index, criteria: comparator(value)}))
      .sort((left, right) => {
        var a = left.criteria,
            b = right.criteria;

        if (a !== b) {
          if (a > b || a === undefined) {
            return 1;
          } else if (a < b || b === undefined) {
            return -1;
          }
        }

        return left.index - right.index;
      })
      .map(({value}) => value);
  /* eslint-enable id-length */
}

export function extendAll(target, ...sources) {
  sources.forEach((source) => {
    Object.getOwnPropertyNames(source).forEach((property) => {
      target[property] = source[property];
    });
  });
}
