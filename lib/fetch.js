import ModelCache from './model_cache';

const loadingCache = {};

/**
 * Retrieves a model from the ModelCache.
 *
 * @param {string} key - cache lookup key
 * @return {Backbone.Model?|Backbone.Collection?} model instance from cache at
 *   the cache key if it exists
 */
export const getFromCache = (key) => ModelCache.get(key);

/**
 * Return whether or not a model exists within ModelCache for the given key.
 *
 * @param {string} key - The cache key of the model to check for existence.
 * @return {boolean}
 */
export const existsInCache = (key) => !!ModelCache.get(key);

/**
 * Main method for retrieving Backbone models/collections.
 *
 * Note that it utilizes the loadingCache while a model is being fetched, and
 * removes it from the loadingCache before resolve or reject is called. This
 * way, we can attach multiple .then()s to a promise that will all be
 * executed when the promise is fulfilled.
 *
 * @param {string} key - cache lookup key
 * @param {function} Model - the Backbone model constructor
 * @param {object} options - options object used for fetching that can include:
 *
 *   * attributes {object} - attributes to pass a Model instance
 *   * fetch {boolean} - whether fetch the model after creation
 *   * data {object} - data to pass into the fetch method
 *   * forceFetch {boolean} - force the fetch to be made if the model is already cached
 *   * method {string} - request type (GET|POST|PUT|DELETE)
 *   * models {array} - models to pass a Collection instance
 *   * options {object} - options to pass to the Model constructor
 *   * prefetch {boolean} - whether the request should be treated as a prefetched resource
 *
 * @return {promise} a promise that will resolve with the new Backbone Model/
 *    Collection instance
 */
export const request = (key, Model, options={}) => {
  var model = ModelCache.get(key),
      addToLoadingCache,
      _promise;

  options = {
    attributes: {},
    models: [],
    fetch: true,
    data: {},
    forceFetch: false,
    method: 'GET',
    ...options
  };

  if (!loadingCache[key]) {
    _promise = new Promise((resolve, reject) => {
      if (!model || options.forceFetch) {
        model = model || new Model(options.models || options.attributes, options.options || {});
        ModelCache.put(key, model, options.component);

        if (options.fetch) {
          addToLoadingCache = true;

          model.fetch({
            data: options.data,
            success: (newModel, json, opts={}) => {
              delete loadingCache[key];
              // TODO(zorah): Promises only ever return a single value, so we're going to attach
              // the status on the model. We should replace this with a cleaner (more involved)
              // solution.
              newModel.status = (opts.response || {}).status;
              resolve(newModel);
            },
            error: (newModel, response={}, opts={}) => {
              delete loadingCache[key];

              // don't cache errored requests
              ModelCache.remove(key);

              newModel.status = response.status;
              reject(newModel);
            },
            type: options.method
          });
        } else {
          resolve(model);
        }
      } else {
        // this will cancel any in-flight timeouts and add the component
        // to the list of components using the resource
        ModelCache.register(key, options.component);

        // the model has been fetched and is stored in the cache, so just
        // immediately resolve with that as our value
        resolve(model);
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
