import { getNestedValue, isDeepEqual, result, uniqueId, urlError } from "./utils.js";

import Events from "./events.js";
import sync, { type SyncOptions } from "./sync.js";
import Collection from "./collection.js";
import { NestedKeys, ResourceConfigObj } from "./types.js";
import CanonicalModel from "./canonical-model.js";
import CanonicalModelCache from "./canonical-model-cache.js";

export type ConstructorOptions = {
  collection?: Collection;
  parse?: boolean;
};

export type CanonicalModelSubscription<
  M extends Record<string, any> = Record<string, any>,
  C extends Record<string, any> = Record<string, any>,
> = {
  Model: typeof CanonicalModel<C>;
  // notably, for our subscriptions, this is the field that corresponds
  // to the canonical model's id, not the field for the subscribing model's id
  idField?: NestedKeys<M>;
  fromSource?: (attrs: Partial<C>, currentTarget: Partial<M>) => Partial<M>;
  toSource?: (attrs: Partial<M>, currentSource: Partial<C>) => Partial<C>;
};

export type SetOptions = {
  silent?: boolean;
  unset?: boolean;
  source?: "subscription" | "self";
  subscribe?: boolean;
};

const RESERVED_OPTION_KEYS = [
  "Model",
  "comparator",
  "parse",
  "collection",
  "silent",
  "method",
  "unset",
];

/**
 * The Model class should be extended for any resource that is singular, as in not a list of items.
 * It is the core class used to represent server data in the client application (Collections are
 * wrappers around lists of Model instances). Its responsibilities revolve around two aspects:
 *
 * 1. Keeping a reference to server data. This is kept within the `attributes` property, though you
 *    should never need to access `attributes` directly. Instead, use .toJSON() to get the full data
 *    object, .get() to get a single property, and .set() to set properties.
 * 2. Interfacing with the sync module to make server requests. These happen with the .fetch(),
 *    .save(), and .destroy() methods, the former two of which also update its representation using
 *    the methods listed in the first step.
 */
export default class Model<
  T extends Record<string, any> = Record<string, any>,
  O extends Record<string, any> = Record<string, any>,
> extends Events<[]> {
  cid: string;
  id: string | number;
  attributes: T;
  readonly urlOptions: O = {} as O;
  collection?: Collection;
  lazy?: boolean;
  refetching?: boolean;
  measure?: boolean | ((config: ResourceConfigObj) => boolean);
  isEmptyModel?: boolean;

  /**
   * @param {object} attributes - initial server data representation to be kept on the model
   * @param {object} options - generic map. in the default constructor, use:
   *     url() method
   *   * parse {boolean} - if true, runs the initial attributes through the parse function beefore
   *     setting on the model
   *   * collection {Collection} - links this model to a collection, if applicable
   *   * ...any other options that .set() takes, as well as any other key-value pair that can be
   *     passed to the `url` function
   */
  constructor(
    attributes?: Partial<T>,
    options: O & SetOptions & ConstructorOptions = {} as O & SetOptions & ConstructorOptions,
  ) {
    super();

    this.cid = uniqueId("c");
    this.attributes = {} as T;

    if (options.collection) {
      this.collection = options.collection;
    }

    if (options.parse) {
      attributes = this.parse(attributes, options) || ({} as T);
    }

    this.urlOptions = Object.keys(options).reduce(
      (memo, key) =>
        Object.assign(memo, !RESERVED_OPTION_KEYS.includes(key) ? { [key]: options[key] } : {}),
      {} as O,
    );

    const attrs = { ...result(this.constructor, "defaults"), ...attributes };

    if (options.subscribe !== false) {
      /**
       * In general, we want to subscribe to canonical models when a model is instantiated before we
       * set the attributes so that we can broadcast the set call. However, the model needs to have an
       * id field set before it can subscribe to a canonical model.
       *
       * So we pass the attributes to this fn as a fallback in case the id field is not yet set.
       */
      this._subscribe(attrs);
    }

    this.set(attrs, options);
  }

  /**
   * This is the field that collections will use to index models and also to consider models unique.
   * Override this on a Model if appropriate for the indexing to happen on a different field.
   * Regardless, the value at this attribute will be set to model.id, the id field directly on the
   * model (not in attributes).
   */
  static idAttribute = "id";

  /**
   * This is a list of keys (could be attribute keys, but also keys passed in from the options
   * object when instantiated) that resourcerer should take into account when determining how to
   * cache a model and consider models to be identical. Can also be a function that returns an
   * object.
   */
  static dependencies: Array<string | ((attrs: Record<string, any>) => Record<string, any>)> = [];

  /**
   * Use this to override the default library-wide cacheTimeout set in the config.
   */
  static cacheTimeout: number;

  /**
   * Default attributes on a model. Can be an object or a function that returns an object.
   */
  static defaults = {};

  /**
   * Use this to tell resourcerer to track this model's request time via the `track` method added
   * in the resourcerer configuration file. This can be a boolean or a function that returns a
   * boolean. If the latter, it takes a the resource config object as an argument.
   */
  static measure: boolean | ((config: ResourceConfigObj) => boolean) = false;

  static subscriptions: CanonicalModelSubscription[] = [];

  /**
   * Returns a copy of the model's `attributes` object. Use this method to get the current entire
   * server data representation.
   */
  toJSON(): T {
    return { ...this.attributes };
  }

  /**
   * Proxies the `sync` module by default, but this can be overridden for custom behavior.
   */
  sync(...args: Parameters<typeof sync>): Promise<[any, Response]> {
    return sync.call(this, ...args);
  }

  /**
   * Gets the value of an attribute.
   */
  get<K extends keyof T>(attr: K): T[K] {
    return this.attributes[attr];
  }

  /**
   * Gets the value of multiple attributes.
   */
  pick<K extends keyof T>(...attrs: K[]): Pick<T, K> {
    return attrs.reduce(
      (memo, attr) => Object.assign(memo, this.has(attr) ? { [attr]: this.get(attr) } : {}),
      {} as Pick<T, K>,
    );
  }

  /**
   * Returns true if there is a defined value at a given attribute key.
   */
  has(attr: keyof T): boolean {
    return ![undefined, null].includes(this.get(attr));
  }

  /**
   * This is how we change attribute values on a model. When we call .save(), this happens before
   * the request fires, and when we call .fetch(), this happens after the request returns. Unless
   * called with a {silent: true} flag, this will trigger an update for all subscribed components
   * to reflect the new changes.
   */
  set(attrs: Partial<T> = {}, options: SetOptions = {}): this {
    const prevId = this.id;
    let hasSomethingChanged = false;

    // For each `set` attribute, update or delete the current value.
    for (let attr of Object.keys(attrs)) {
      if (!hasSomethingChanged && !isDeepEqual(this.attributes[attr], attrs[attr] as T[keyof T])) {
        hasSomethingChanged = true;
      }

      options.unset ?
        delete this.attributes[attr]
      : (this.attributes[attr as keyof T] = attrs[attr] as T[keyof T]);
    }

    // the option.source check is to prevent infinite loops of updates
    // the option.subscribe check is to prevent updating from the empty model
    if (hasSomethingChanged && options.source !== "subscription" && options.subscribe !== false) {
      this._updateSubscriptions(attrs, options);
    }

    // Update the `id`.
    if ((this.constructor as typeof Model).idAttribute in attrs) {
      this.id = this.get((this.constructor as typeof Model).idAttribute);
    }

    // trigger updated for the change
    if (!options.silent && hasSomethingChanged) {
      this.triggerUpdate();

      if (this.collection && prevId && prevId !== this.id) {
        // @ts-ignore
        this.collection._updateModelReference(this.id, prevId, this);
      }
    }

    return this;
  }

  /**
   * Removes a model's attribute at a given key.
   */
  unset(attr: keyof T, options?: SetOptions): this {
    return this.set({ [attr]: undefined } as Partial<T>, { unset: true, ...options });
  }

  /**
   * Removes all attributes for a model.
   */
  clear(options?: SetOptions): this {
    const attrs: T = {} as T;

    for (let key of Object.keys(this.attributes)) {
      attrs[key as keyof T] = undefined as T[keyof T];
    }

    return this.set(attrs, { unset: true, ...options });
  }

  /**
   * Main method that preps a GET request at this model's url. This is the method the request module
   * uses to sync server data after instantiating a model. Upon returning, an update is triggered
   * for all registered components.
   */
  fetch(options: SyncOptions & SetOptions = {}) {
    options = { parse: true, method: "GET", ...options };

    return this.sync(this, options).then(([json, response]) => {
      const serverAttrs = options.parse ? this.parse(json, options) : json;

      this._subscribe(serverAttrs);
      this.set(serverAttrs, options);
      // sync update
      this.triggerUpdate();

      return [this, response] as const;
    });
  }

  /**
   * Whereas fetching data is handled declaratively by resourcerer, creates and updates occur
   * imperatively in your app via model.save(). It first sets the new properties on the model,
   * triggering an update (unless {wait: true} is passed). Then it preps a sync write request.
   */
  save(
    attrs: Partial<T>,
    options: { wait?: boolean; patch?: boolean } & SyncOptions & SetOptions = {},
  ): Promise<[this, Response]> {
    const previousAttributes = this.toJSON();

    options = { parse: true, ...options };
    attrs = attrs || this.toJSON();

    // If we're not waiting and attributes exist, save acts as `set(attr).save(null, opts)`
    if (!options.wait) {
      this.set(attrs, options);
    } else {
      options.attrs = { ...this.attributes, ...attrs };
    }

    options.method =
      this.isNew() ? "POST"
      : options.patch ? "PATCH"
      : "PUT";

    if (options.method === "PATCH") {
      options.attrs = attrs;
    }

    return this.sync(this as Model | Collection, options)
      .then(([json, response]) => {
        let serverAttrs = options.parse ? this.parse(json, options) : json;

        if (options.wait) {
          serverAttrs = { ...attrs, ...serverAttrs };
        }

        this._subscribe(serverAttrs);
        // avoid triggering any updates in the set call since we'll do it immediately after
        this.set(serverAttrs, { silent: true, ...options });
        // sync update
        this.triggerUpdate();

        return [this, response] as [this, Response];
      })
      .catch((response) => {
        if (!options.wait) {
          // keep the clear silent so that we only render when we reset attributes
          this.clear({ silent: true }).set(previousAttributes, options);
        } else {
          this.attributes = previousAttributes;
        }

        return Promise.reject(response);
      });
  }

  /**
   * Method used to send a DELETE request to the server. If part of a collection, also removes the
   * model from the collection. Pass {wait: true} for that to happen (along with an update) after
   * the request returns.
   */
  destroy(options: { wait?: boolean } & SyncOptions & SetOptions = {}): Promise<[this, Response]> {
    const request =
        this.isNew() ?
          Promise.resolve([])
        : this.sync(this as Model | Collection, { method: "DELETE", ...options }),
      collection = this.collection;

    if (!options.wait) {
      this.triggerUpdate();
      this.collection?.remove(this, { silent: true });
    }

    return request
      .then(([json, response]) => {
        if (options.wait && !this.isNew()) {
          this.triggerUpdate();
          this.collection?.remove(this, { silent: true });
        }

        // model orphans with subscriptions will never have a chance to unsubscribe automatically.
        this.unsubscribe();

        return [this, response] as [this, Response];
      })
      .catch((response) => {
        if (!options.wait && !this.isNew()) {
          collection?.add(this);
        }

        return Promise.reject(response);
      });
  }

  /**
   * Default url method on a model. This should only be invoked if the model belongs to a collection
   * or has a urlRoot method, both of which this method uses to append the model's id. Otherwise,
   * for models outside of a collection, they should have their own overriding url method defined.
   */
  url(options = this.urlOptions): string {
    const base =
      result(this, "urlRoot", options) || result(this.collection, "url", options) || urlError();

    if (this.isNew()) {
      return base;
    }

    return (
      base.replace(/[^/]$/, "$&/") +
      window.encodeURIComponent(this.get((this.constructor as typeof Model).idAttribute))
    );
  }

  /**
   * By default, parse() is the identity function. Override this if you need special business logic
   * to transform the server response into a different form for your application that will be set
   * as attributes on the model.
   */
  parse(response: any, options: SyncOptions & SetOptions): T {
    return response;
  }

  /**
   * A model by default is considered new if it doesn't have an id property, which makes sense--it
   * hasn't been saved to the server yet. Practically, this can also be overridden to get desired
   * behavior, ie forcing a request to be POST instead of PUT or vice versa.
   */
  isNew() {
    return !this.has((this.constructor as typeof Model).idAttribute);
  }

  /**
   * This gets called:
   * - when a model is instantiated (ie directly or when it is added to a collection)
   * - when a model completes a fetch
   * - when a model is saved
   *
   * This should only happen when the model has the id field set for the canonical model. And
   * if we've already subscribed, this should have no effect.
   */
  _subscribe(attrs: Partial<T> = {}) {
    const { subscriptions, idAttribute } = this.constructor as typeof Model;

    for (const { Model: CanonicalModel, idField = idAttribute, fromSource } of subscriptions) {
      const id = getNestedValue(this.toJSON(), idField) || getNestedValue(attrs || {}, idField);

      if (id && !this.isEmptyModel) {
        const canonicalModel = CanonicalModelCache.getOrInsert(CanonicalModel, id);

        // remove any existing subscriptions. this could be more efficient.
        canonicalModel.offUpdate(this);

        /**
         * This callback will get invoked when the canonical model is updated by any other
         * subscribing model.
         */
        canonicalModel.onUpdate((canonicalAttrs, context) => {
          // this will keep us from an infinite loop of updates
          if (context === this || !fromSource) {
            return;
          }

          this.set(fromSource(canonicalAttrs, this.toJSON()) as Partial<T>, {
            source: "subscription",
          });
        }, this);
      }
    }
  }

  /**
   * This gets called:
   * - when it or its collection is removed from the cache
   * - when a model is removed from a collection
   * - when a model is destroyed
   *
   * Notably, it is never called in the context of the react lifecycle.
   */
  unsubscribe() {
    const { subscriptions, idAttribute } = this.constructor as typeof Model;

    for (const { Model: CanonicalModel, idField = idAttribute } of subscriptions) {
      const id = getNestedValue(this.toJSON(), idField);

      if (id) {
        const canonicalModel = CanonicalModelCache.getOrInsert(CanonicalModel, id);

        canonicalModel.removeSubscription(this, id);
      }
    }
  }

  /**
   * This will get called when this model is set. It then needs to update any canonical models
   * it is subscribed to.
   */
  _updateSubscriptions(attrs: Partial<T> = {}, options: SetOptions = {}): void {
    const { subscriptions, idAttribute } = this.constructor as typeof Model;

    for (const { Model: CanonicalModel, idField = idAttribute, toSource } of subscriptions) {
      const id = getNestedValue(this.toJSON(), idField) || getNestedValue(attrs, idField);

      // TODO: this breaks if the id itself changes because it's no longer keyed correctly in the cache
      // should we prohibit the id attribute from being changed by not passing it to set?
      if (toSource && id && !this.isEmptyModel) {
        const canonicalModel = CanonicalModelCache.getOrInsert(CanonicalModel, id);

        canonicalModel.set(
          toSource({ ...this.attributes, ...attrs }, canonicalModel.toJSON()),
          this as Model,
          options,
        );
      }
    }
  }
}

// mix in events to the model
Object.assign(Model.prototype, Events);
