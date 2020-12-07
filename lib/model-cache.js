import {ResourcesConfig} from './config';

// this is where all of our cached resources are stored
const modelCache = new Map();
// this map is {{string: Set<React.Component>}} where each property is a cache
// key. this is how we keep track all components that have requested a resource.
// when a cache key's set is empty, we schedule that resource for cache removal
const componentManifest = new Map();
// resource timeouts for cache removal. we keep references to these so that if,
// during the cache grace period, another component requests the resource, we
// can cancel the cache removal.
const timeouts = {};

/**
 * This module holds references to all of our returned resources as well as a
 * set of components that have requested them. Ideally, this module is never
 * used in an application; withResources should handle everything behind the
 * scenes.
 *
 * When a component unmounts, it is removed from the set of components that have
 * requested a resource. If that resource no longer has any components in its
 * set, it is scheduled for cache removal. That time period can be configured
 * with the `cacheGracePeriod` config option with the `setConfig` function.
 */
export default {
  get(cacheKey) {
    return modelCache.get(cacheKey);
  },

  /**
   * Adds a model to the model cache and registers its first component.
   * A component might not exist, for example, while prefetching a resource.
   * In this case, the user may never actually click on the component, so we
   * preemptively schedule for removal. The timeout will be overridden when
   * an additional component is registered to the model.
   *
   * @param {string} cacheKey - The cache key of the model to be removed.
   * @param {Model | Collection} model - model to be cached
   * @param {React.Component} component - component to register to model in the component manifest
   */
  put(cacheKey, model, component) {
    modelCache.set(cacheKey, model);

    if (component) {
      this.register(cacheKey, component);
    } else {
      scheduleForRemoval(cacheKey);
    }
  },

  /**
   * Registers a component with a resource in the component manifest. Clears any
   * currently-scheduled cache removal timeout.
   *
   * @param {string} cacheKey
   * @param {React.Component} component
   */
  register(cacheKey, component) {
    window.clearTimeout(timeouts[cacheKey]);
    componentManifest.set(cacheKey, componentManifest.get(cacheKey) || new Set());
    componentManifest.get(cacheKey).add(component);
  },

  /**
   * Unregisters a component from the component manifest. If passed cache keys,
   * the component will only be unregistered from those resources. Otherwise,
   * it will be removed from all resources (ie, when the component unmounts).
   *
   * If, after the component is unregistered, a resource no longer has any
   * components registered, it will be scheduled for removal from the cache.
   *
   * @param {React.Component} component
   * @param {...<string>} cacheKeys - list of keys from which to unregister
   *    the component
   */
  unregister(component, ...cacheKeys) {
    cacheKeys = cacheKeys.length ? cacheKeys : componentManifest.keys();

    for (let cacheKey of cacheKeys) {
      let componentSet = componentManifest.get(cacheKey);

      if (componentSet && componentSet.has(component)) {
        componentSet.delete(component);

        if (!componentSet.size) {
          scheduleForRemoval(cacheKey);
        }
      }
    }
  },

  /**
   * Direct removal of a cache key from the cache. Should be used sparingly,
   * since it shortcuts the unregistration process and timeout.
   *
   * @param {string} cacheKey - The cache key of the model to be removed.
   */
  remove(cacheKey) {
    clearModel(cacheKey);
  },

  // internal only
  __removeAll__() {
    modelCache.forEach((val, key) => clearModel(key));
  }
};

/**
 * Sets a timeout for clearing the model from the model cache and stores the
 * timeout id in the timeouts object.
 *
 * @param {string} cacheKey - The cache key of the model to be removed.
 */
function scheduleForRemoval(cacheKey) {
  timeouts[cacheKey] = window.setTimeout(() => {
    clearModel(cacheKey);
  }, ResourcesConfig.cacheGracePeriod);
}

/**
 * Remove a model from the cache.
 *
 * @param {string} cacheKey - The cache key of the model to be removed.
 */
function clearModel(cacheKey) {
  window.clearTimeout(timeouts[cacheKey]);
  delete timeouts[cacheKey];
  modelCache.delete(cacheKey);
}
