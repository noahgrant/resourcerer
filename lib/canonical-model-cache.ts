import CanonicalModel from "./canonical-model.js";

// canonical models are not managed in React, they are managed within our models
// exported for testing
export const canonicalModelCache = new Map<
  typeof CanonicalModel<any>,
  Map<string | number, CanonicalModel<any>>
>();

/**
 * This is the interface for interacting with our canonical model cache map. That map is where we
 * store all canonical models as long as they have subscriptions. It should never be used
 * externally; the only way to add to the cache is via the .getOrCreate method, which will always
 * return a model.
 *
 * The map is a map of model classes to maps of ids to canonical models:
 *   Map<ModelClass, Map<id, CanonicalModel>>
 */
const CanonicalModelCache = {
  /**
   * This getter method also actually sets if the model doesn't exist. When we call get from the
   * cache we want to know for sure that we are returning a new model for the given id.
   */
  getOrInsert(ModelClass: typeof CanonicalModel<any>, id: string | number) {
    const existingCachedModel = canonicalModelCache.get(ModelClass)?.get(id);

    if (existingCachedModel) {
      return existingCachedModel;
    }

    const newCanonicalModel = new ModelClass();

    this.set(ModelClass, id, newCanonicalModel);

    return newCanonicalModel;
  },

  /**
   * We should never call this directly; the only time we add to the cache is when we call
   * the .get and nothing exists yet.
   */
  set(ModelClass: typeof CanonicalModel<any>, id: string | number, model: CanonicalModel<any>) {
    // this is a map, for this class, of ids to canonical models. defaults to a new one
    const canonicalModelMap =
      canonicalModelCache.get(ModelClass) || new Map<string, CanonicalModel<any>>();

    canonicalModelMap.set(id, model);
    canonicalModelCache.set(ModelClass, canonicalModelMap);
  },

  remove(ModelClass: typeof CanonicalModel<any>, id: string | number) {
    const canonicalModelMap = canonicalModelCache.get(ModelClass);

    if (canonicalModelMap) {
      canonicalModelMap.delete(id);
    }
  },
};

export default CanonicalModelCache;
