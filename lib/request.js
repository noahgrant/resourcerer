import Collection from './collection';
import ModelCache from './model-cache';

const loadingCache = {};

/**
 * Retrieves a model from the ModelCache. If needed, best to use this in an
 * application instead of importing the ModelCache directly.
 *
 * @param {string} key - cache lookup key
 * @return {Model?|Collection?} model instance from
 *   cache at the cache key if it exists
 */
export const getFromCache = (key) => ModelCache.get(key);

/**
 * Return whether or not a model exists within ModelCache for the given key. If
 * needed, best to use this in an application instead of importing the
 * ModelCache directly.
 *
 * @param {string} key - The cache key of the model to check for existence.
 * @return {boolean}
 */
export const existsInCache = (key) => !!ModelCache.get(key);

/**
 * Main method for retrieving models/collections.
 *
 * Note that it utilizes the loadingCache while a model is being fetched, and
 * removes it from the loadingCache before resolve or reject is called. This
 * way, we can attach multiple .then()s to a promise that will all be
 * executed when the promise is fulfilled.
 *
 * @param {string} key - cache lookup key
 * @param {function} Model - the model constructor
 * @param {object} options - options object used for fetching that can include:
 *
 *   * data {object|object[]} - attributes or models to pass a Model or Collection instance, resp.
 *   * params {object} - query params to pass into the fetch method
 *   * fetch {boolean} - whether fetch the model after creation
 *   * force {boolean} - force the fetch to be made if the model is already cached
 *   * method {string} - request type (GET|POST|PUT|DELETE)
 *   * options {object} - options to pass to the Model constructor
 *   * prefetch {boolean} - whether the request should be treated as a prefetched resource
 *
 * @return {promise} a promise that will resolve with the new Model/Collection instance
 */
export default (key, Model, options={}) => {
  var model = ModelCache.get(key),
      addToLoadingCache,
      _promise;

  options = {
    data: Model && Model.prototype instanceof Collection ? [] : {},
    params: {},
    options: {},
    fetch: !options.lazy,
    force: false,
    lazy: false,
    method: 'GET',
    ...options
  };

  if (!loadingCache[key]) {
    _promise = new Promise((resolve, reject) => {
      if (!model || model.lazy || options.force) {
        model = model || new Model(options.data, options.options);

        if (options.fetch) {
          addToLoadingCache = true;

          delete model.lazy;

          model.fetch({params: options.params}).then(
            ([newModel, response]) => {
              delete loadingCache[key];
              ModelCache.put(key, newModel, options.component);
              resolve([newModel, response?.status]);
            },
            (response) => {
              delete loadingCache[key];
              reject(response?.status);
            }
          );
        } else {
          // lazy means resolove but don't fetch yet; it will get updates from other components
          // we only want to do this if a model is not yet in the cache
          options.lazy && !ModelCache.get(key) ? model.lazy = true : null;

          ModelCache.put(key, model, options.component);
          resolve([model]);
        }
      } else {
        // this will cancel any in-flight timeouts and add the component
        // to the list of components using the resource
        ModelCache.register(key, options.component);

        // the model has been fetched and is stored in the cache, so just
        // immediately resolve with that as our value
        resolve([model]);
      }
    });

    if (addToLoadingCache) {
      // add promise to loading cache, not model
      loadingCache[key] = _promise;
    }

    return _promise;
  }

  // a prefetch may have initiated the fetch and we need to
  // clear the timeout and register this component
  ModelCache.register(key, options.component);

  // return the existing promise if the promise hasn't yet been fulfilled.
  // this way we can attach more .then() handlers
  return loadingCache[key];
};
