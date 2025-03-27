import { ResourcesConfig } from "./config.js";
import Collection from "./collection.js";
import Model from "./model.js";
import { ResourceKeys } from "./types.js";

type Component = NonNullable<unknown>;

// this is where all of our cached resources are stored
const modelCache = new Map<string, Model | Collection>();
// this map is Map<string: Set<React.Component>> where each property is a cache
// key. this is how we keep track all components that have requested a resource.
// when a cache key's set is empty, we schedule that resource for cache removal
const componentManifest = new Map<string, Set<Component>>();
// resource timeouts for cache removal. we keep references to these so that if,
// during the cache grace period, another component requests the resource, we
// can cancel the cache removal.
const timeouts: Record<string, number> = {};

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
const ModelCache = {
  get(cacheKey: string) {
    return modelCache.get(cacheKey);
  },

  /**
   * Adds a model to the model cache and registers its first component.
   * A component might not exist, for example, while prefetching a resource.
   * In this case, the user may never actually click on the component, so we
   * preemptively schedule for removal. The timeout will be overridden when
   * an additional component is registered to the model.
   */
  put(cacheKey: string, model: Model | Collection, component?: Component) {
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
   */
  register(cacheKey: string, component?: Component) {
    if (component) {
      window.clearTimeout(timeouts[cacheKey]);
      componentManifest.set(cacheKey, componentManifest.get(cacheKey) || new Set());
      componentManifest.get(cacheKey)?.add(component);
    }
  },

  /**
   * Unregisters a component from the component manifest. If passed cache keys,
   * the component will only be unregistered from those resources. Otherwise,
   * it will be removed from all resources (ie, when the component unmounts).
   *
   * If, after the component is unregistered, a resource no longer has any
   * components registered, it will be scheduled for removal from the cache.
   */
  unregister(component: Component, ...cacheKeys: string[]) {
    cacheKeys = cacheKeys.length ? cacheKeys : [...componentManifest.keys()];

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
   */
  remove(cacheKey: string) {
    clearModel(cacheKey);
    componentManifest.delete(cacheKey);
  },

  /**
   * A shortcut to remove all models of a given resourceKey.
   */
  removeAllWithModel(resourceKey: string) {
    for (const key of modelCache.keys()) {
      if (key === resourceKey || key.startsWith(`${resourceKey}~`)) {
        this.remove(key);
      }
    }
  },

  /**
   * Remove all models except those specified.
   */
  removeAllExcept(resourceKeys: string[]) {
    for (const key of modelCache.keys()) {
      if (
        !resourceKeys.includes(key) &&
        !resourceKeys.some((resourceKey) => key.startsWith(`${resourceKey}~`))
      ) {
        this.remove(key);
      }
    }
  },

  // internal only
  __removeAll__() {
    modelCache.forEach((val, key) => clearModel(key));
    componentManifest.forEach((val, key) => componentManifest.delete(key));
  },
};

export default ModelCache;

/**
 * Sets a timeout for clearing the model from the model cache and stores the
 * timeout id in the timeouts object.
 */
function scheduleForRemoval(cacheKey: string) {
  const Constructor = modelCache.get(cacheKey)?.constructor as typeof Model | typeof Collection;
  const timeout = Constructor?.cacheTimeout || ResourcesConfig.cacheGracePeriod;

  timeouts[cacheKey] = window.setTimeout(() => clearModel(cacheKey), timeout);
}

/**
 * Remove a model from the cache.
 */
function clearModel(cacheKey: string) {
  window.clearTimeout(timeouts[cacheKey]);
  delete timeouts[cacheKey];
  modelCache.delete(cacheKey);
}

/**
 * For each resourceKey, find all entries in the cache and remove them. If the `except` option is
 * true, remove all entries except those specified.
 */
export function invalidate(
  keys: ResourceKeys | ResourceKeys[],
  { except }: { except?: boolean } = {},
) {
  keys = Array.isArray(keys) ? keys : [keys];

  except ?
    ModelCache.removeAllExcept(keys)
  : keys.forEach((key) => ModelCache.removeAllWithModel(key));
}
