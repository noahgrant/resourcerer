const modelCache = new Map();
const componentManifest = new Map();
const timeouts = {};

// keep models around for an extra two minutes after all
// components using them have unmounted.
const GRACE_PERIOD = 120000;

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
   * @param {Backbone.Model | Backbone.Collection} model - model to be cached
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
  }, GRACE_PERIOD);
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
