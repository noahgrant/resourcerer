import Model from "./model";
import Collection from "./collection";
import ModelCache from "./model-cache";
import { SyncOptions } from "./sync";

interface RequestOptions extends Pick<SyncOptions, "params"> {
  data?: any;
  component?: NonNullable<unknown>;
  options?: Record<string, any>;
  path?: Record<string, any>;
  fetch?: boolean;
  force?: boolean;
  lazy?: boolean;
}

const loadingCache: Record<
  string,
  Promise<[Model | Collection] | [Model | Collection, number]>
> = {};

/**
 * Retrieves a model from the ModelCache. If needed, best to use this in an
 * application instead of importing the ModelCache directly.
 *
 * @param {string} key - cache lookup key
 * @return {Model?|Collection?} model instance from
 *   cache at the cache key if it exists
 */
export const getFromCache = (key: string) => ModelCache.get(key);

/**
 * Return whether or not a model exists within ModelCache for the given key. If
 * needed, best to use this in an application instead of importing the
 * ModelCache directly.
 *
 * @param {string} key - The cache key of the model to check for existence.
 * @return {boolean}
 */
export const existsInCache = (key: string) => !!ModelCache.get(key);

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
 *   * options {object} - options to pass to the Model constructor
 *
 * @return {promise} a promise that will resolve with the new Model/Collection instance
 */
export default (
  key: string,
  Model:
    | { new (data: Record<string, any>, options: RequestOptions["options"]): Model }
    | { new (data: Record<string, any>[], options: RequestOptions["options"]): Collection },
  options: RequestOptions = {} as RequestOptions
): Promise<[Model | Collection] | [Model | Collection, number]> => {
  let cachedModel = ModelCache.get(key);
  let addToLoadingCache;
  let _promise: Promise<[Model | Collection] | [Model | Collection, number]>;

  options = {
    data: Model && "prototype" in Model && Model.prototype instanceof Collection ? [] : {},
    params: {},
    options: {},
    fetch: true,
    force: false,
    lazy: false,
    ...options,
  };

  if (!loadingCache[key]) {
    _promise = new Promise((resolve, reject) => {
      if (!cachedModel || cachedModel.lazy || options.force) {
        const model =
          cachedModel || new Model(options.data, { ...options.options, ...options.path });

        if (options.fetch && !options.lazy) {
          addToLoadingCache = true;

          model.fetch({ params: options.params }).then(
            ([newModel, response]) => {
              delete loadingCache[key];
              // waiting to delete lazy property until after fetch completes ensures multiple
              // components that call non-lazy version of the resource all get put into a
              // loading state
              delete model.lazy;

              ModelCache.put(key, newModel, options.component);
              resolve([newModel, response?.status]);
            },
            (response) => {
              delete loadingCache[key];
              reject(response?.status);
            }
          );
        } else {
          // lazy means resolve but don't fetch yet; it will get updates from other components
          // we only want to do this if a model is not yet in the cache
          options.lazy && !ModelCache.get(key) ? (model.lazy = true) : null;

          ModelCache.put(key, model, options.component);
          resolve([model]);
        }
        // this block normally will not get invoked because previous-cached resources will bypass
        // the request module to avoid the async Promise tick. this will still get called for some
        // unconventional resource loading such as prefetch requests that are cached, both from the
        // prefetch module and from the `prefetches` resource config property
      } else {
        // this will cancel any in-flight timeouts and add the component
        // to the list of components using the resource
        ModelCache.register(key, options.component);

        // the model has been fetched and is stored in the cache, so just
        // immediately resolve with that as our value
        resolve([cachedModel]);
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
  return loadingCache[key] as Promise<[Model | Collection] | [Model | Collection, number]>;
};
