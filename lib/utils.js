import {LoadingStates} from './constants';

const LIFECYCLE_METHODS = [
  'componentWillMount',
  'componentDidMount',
  'shouldComponentUpdate',
  'componentWillReceiveProps',
  'componentDidUpdate',
  'componentWillUnmount'
];

/**
 * Whether or not any loading state has errored. If a state is passed in,
 * check only that one, else we check for any.
 *
 * @param {string|string[]} loadingStates - specifics state to check for an error
 * @return {boolean}
 */
export const _hasErrored = (loadingStates) => {
  if (!Array.isArray(loadingStates)) {
    loadingStates = [loadingStates];
  }

  return loadingStates.some((state) => state === LoadingStates.ERROR);
};

/**
 * Whether or not any render-blocking loading state is still loading. If a
 * state is passed in, check only that one, else we check for any.
 *
 * @param {string|string[]} loadingStates - specific states to check if one is loading
 * @return {boolean}
 */
export const _isLoading = (loadingStates) => {
  if (!Array.isArray(loadingStates)) {
    loadingStates = [loadingStates];
  }

  return loadingStates.some((state) => state === LoadingStates.LOADING);
};

/**
 * Whether or not all render-blocking loading states have loaded. If a
 * state is passed in, check only that one, else we check for all.
 *
 * @param {string|string[]} loadingStates - specific states to check that all have loaded
 * @return {boolean}
 */
export const _hasLoaded = (loadingStates) => {
  if (!Array.isArray(loadingStates)) {
    loadingStates = [loadingStates];
  }

  return loadingStates.every((state) => state === LoadingStates.LOADED);
};

/**
 * Negates the return value of an input function, like _.reject, but we can
 * use this within native filter methods.
 *
 * @param {function} fn - input function to negate
 * @return {function} a function that negates the return value of the input function
 */
export const not = (fn) => (...args) => !fn(...args);

/**
 * Inspired by Ragan Wald's post:
 * http://raganwald.com/2015/06/17/functional-mixins.html
 *
 * There's more we can do with this, but right now it assigns mixin methods
 * to a class's prototype if that prototype doesn't already have the method.
 *
 * If the method does have the method, and the method is a React lifecycle
 * method, it uses 'method advice' to invoke the original method first, followed
 * by the mixin's method, and then returns the return value of the original
 * method.
 *
 * This allows us to easily define mixins that can be used with decorator
 * syntactic sugar, like our ModelLoader mixin:
 *
 * ModelLoader = mixin({
 *   _hasLoaded() {
 *   },
 *
 *   ...
 * });
 *
 * @ModelLoader
 * export default class ListsPage extends React.Component {....
 *
 * @param {object} behavior - object with properties to be mixed-in to the class
 * @return {function} function that takes a class and addds the behavior methods
 *    to its prototype
 */
export const mixin = (behavior) =>
  (clazz) => {
    for (let method of Reflect.ownKeys(behavior)) {
      if (LIFECYCLE_METHODS.includes(method)) {
        let originalMethod = clazz.prototype[method] || noOp;

        Object.defineProperty(clazz.prototype, method, {
          value: function(...args) {
            var returnValue = originalMethod.apply(this, args);

            behavior[method].apply(this, args);

            return returnValue;
          },
          writable: true
        });
      } else if (!clazz.prototype[method]) {
        Object.defineProperty(clazz.prototype, method, {
          value: behavior[method],
          writable: true
        });
      }
    }

    return clazz;
  };

export function noOp() {}
