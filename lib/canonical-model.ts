import { isDeepEqual } from "./utils.js";
import Events from "./events.js";
import Model from "./model.js";
import CanonicalModelCache from "./canonical-model-cache.js";

/**
 * This is a very basic class for canonical models. It really has one responsibility: trigger
 * updates when its attributes change via its `set` method. It extends the Events class to allow
 * for regular models to subscribe to its updates.
 *
 * Only models subscribe to canonical models - collections do not; they just have their models
 * within them subscribe. When a subscribing model is updated, it updates the canonical model,
 * as well. This in turn triggers updates for all other subscribing models, and is how we can
 * keep related but different models in sync throughout an application.
 *
 * There's no notion of an id in this file, but a canonical model won't be instantiated
 * without one. It's from this id that we put the instance in the cache and then can refrenece
 * it when a subscribing model is updated (as in, an entire model class will be defined as
 * subscribing to a canonical model class, but in reality it's a model instance that will get
 * subscribed to a canonical model instance of the same id.
 */
export default class CanonicalModel<T extends Record<string, any>> extends Events<
  [Partial<T>, Model]
> {
  attributes: T = {} as T;

  get<K extends keyof T>(attr: K): T[K] {
    return this.attributes[attr];
  }

  set(attrs: Partial<T> = {}, context: Model, options: { unset?: boolean } = {}): void {
    let hasSomethingChanged = false;

    // for each `set` attribute, update or delete the current value, and mark whether any in the
    // lot have changed. this will be used to determine whether to trigger an update.
    for (let attr of Object.keys(attrs)) {
      if (!hasSomethingChanged && !isDeepEqual(this.attributes[attr], attrs[attr] as T[keyof T])) {
        hasSomethingChanged = true;
      }

      options.unset ?
        delete this.attributes[attr]
      : (this.attributes[attr as keyof T] = attrs[attr] as T[keyof T]);
    }

    if (hasSomethingChanged) {
      // the context is important here - we don't want to update the same model that just
      // set the canonical model's attributes in the first place
      this.triggerUpdate(this.toJSON(), context);
    }
  }

  /**
   * Canonical models are totally kept outside the React lifecycle, which is nice. We don't boot
   * them from the cache when components get unmounted, for example. We only remove them when there
   * are no more subscriptions. Models will unsubscribe they are deleted (destroyed), when they're
   * removed from a collection, or when they or their collection is removed from the cache.
   */
  removeSubscription(context: Model<any, any>, id: string | number) {
    this.offUpdate(context);

    if (!this._callbacks.length) {
      CanonicalModelCache.remove(this.constructor as typeof CanonicalModel<any>, id);
    }
  }

  toJSON(): T {
    return { ...this.attributes };
  }
}

Object.assign(CanonicalModel.prototype, Events);
