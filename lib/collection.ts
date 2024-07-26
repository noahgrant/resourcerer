import { isDeepEqual, sortBy } from "./utils.js";

import Events from "./events.js";
import Model, { type ConstructorOptions, type SetOptions } from "./model.js";
import sync, { type SyncOptions } from "./sync.js";
import { ResourceConfigObj } from "./types.js";

type CSetOptions = {
  parse?: boolean;
  silent?: boolean;
  [key: string]: any;
} & SetOptions &
  ConstructorOptions;

type ModelArg<A extends Record<string, any>, O extends Record<string, any>> =
  | Model<A, O>
  | Record<string, any>;

type comparator =
  | string
  | ((arg: Model) => number | string)
  | ((arg1: Model, arg2?: Model) => number | undefined);

/**
 * A Collection instance represents a list of items in a RESTful sense. Each item returned at the
 * GET endpoint will be instantiated as a Model instance in the collection's `models` property. When
 * an update happens on a model, its events get filtered up to the collection, making it only
 * necessary to ever listen on the collection itself, which is what resourcerer does.
 *
 * The Collection's responsibilities largely lie around managing its models. But it's important to
 * note that all write requests occur on the model, not the collection. It has a .fetch() method
 * for GETting it's items from the server, but its .create() method is really a small wrapper around
 * Model#save that adds it to the collection when it is finished.
 */
export default class Collection<
  T extends Record<string, any> = object,
  O extends Record<string, any> = object,
> extends Events {
  lazy?: boolean;
  refetching?: boolean;
  measure?: boolean | ((config: ResourceConfigObj) => boolean);
  isEmptyModel?: boolean;

  Model: typeof Model<T, O>;

  comparator?: comparator;

  models: InstanceType<this["Model"]>[] = [];

  length: number;

  _byId: Record<string, Model<T, O>>;

  /**
   * @param {object[]} models - initial models to be set on the collection
   * @param {object} options - options map used in .set(), like {parse: true} to run the models
   *   through the parse method and {silent: true} to not trigger any updates. in the default
   *   constructor, use:
   *
   *   * Model {Model} - dynamically overrides the static model property for the type of Model that
   *     this collection's models should be instances of
   *   * comparator {function|string} - dynamically overrides the static comparator property used to
   *     sort the collection
   */
  constructor(
    models?: ModelArg<T, O> | ModelArg<T, O>[],
    options: O & {
      Model?: typeof Model<T, O>;
      comparator?: comparator;
    } & CSetOptions = {} as O
  ) {
    super();

    const RESERVED_OPTION_KEYS = ["Model", "comparator", "silent", "parse"];

    this.Model = options.Model || this._getModelClass<T, O>();
    this.comparator = options.comparator || (this.constructor as typeof Collection).comparator;

    this._reset();

    this.urlOptions = Object.keys(options).reduce(
      (memo, key) =>
        Object.assign(memo, !RESERVED_OPTION_KEYS.includes(key) ? { [key]: options[key] } : {}),
      {}
    );

    if (models) {
      // silent for completeness, i guess. but a nothing triggered here because it's impossible for
      // a listener to have been attached at this point
      this.reset(models, { silent: true, ...options });
    }
  }

  urlOptions: Record<string, any> = {};

  /**
   * The default model for a collection is just a Model, but this can be overridden by any other
   * custom Model subclass.
   */
  static Model = Model;

  /**
   * Defines the property by which we can uniquely identify models in the collection. Override this
   * if you're not defining your own custom Model class but still need to index by a different field
   * than the default ('id').
   */
  static idAttribute: string;

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

  static comparator: comparator;

  /**
   * Use this to tell resourcerer to track this collection's request time via the `track` method
   * added in the resourcerer configuration file. This can be a boolean or a function that returns a
   * boolean. If the latter, it takes a the resource config object as an argument.
   */
  static measure: boolean | ((config: ResourceConfigObj) => boolean) = false;

  /**
   * Similar to the method for an individual model, this maps through each model in the collection
   * and returns its data attributes.
   *
   * @return {object[]} list of all models' data representations
   */
  toJSON(): T[] {
    return this.map((model) => model.toJSON());
  }

  /**
   * Proxies the `sync` module by default, but this can be overridden for custom behavior.
   */
  sync(...args: Parameters<typeof sync>): Promise<[any, Response]> {
    return sync.call(this, ...args);
  }

  /**
   * Adds a model or models to the collection. If a comparator exists, the collection will be
   * re-sorted, as well. This will also create a reference on the collection to the model and apply
   * listeners on the collection to events on the new model.
   */
  add(models: ModelArg<T, O> | ModelArg<T, O>[], options: CSetOptions = {}) {
    return this.set(models, options);
  }

  /**
   * Removes a model or list of models from the collection, which will also remove any references
   * as well as any listeners.
   */
  remove(
    models: Model<T, O>["id"] | Model<T, O>["id"][] | ModelArg<T, O> | ModelArg<T, O>[],
    options: CSetOptions = {}
  ) {
    const removed = this._removeModels(!Array.isArray(models) ? [models] : models);

    if (!options.silent && removed.length) {
      // update trigger on collection, necessary because removed models won't trigger collection
      // response at this point
      this.triggerUpdate();
    }

    return this;
  }

  /**
   * Sets a model or list of models on the collection, adding new ones and updating existing ones,
   * as appropriate. Note that this is NOT for removing models. That should be done exclusively
   * via the .remove() method (or effectively the .reset() method).
   */
  set(models?: ModelArg<T, O> | ModelArg<T, O>[], options: CSetOptions = {}) {
    let shouldSort = false;

    if (!models) {
      return this;
    } else if (options.parse && !this._isModel(models)) {
      models = this.parse(models, options);
    }

    // models can be passed as a single model or a list
    for (let model of Array.isArray(models) ? models : [models]) {
      // if model already exists, swap in new attributes
      if (this.get(model)) {
        let attrs = this._isModel(model) ? model.attributes : model;

        this.get(model)!.set(options.parse ? this.get(model)!.parse(attrs, options) : attrs);
        // otherwise add it to the collection
      } else {
        model = this._prepareModel(model, options);

        this.models.push(model);
        this._addReference(model);
        shouldSort = true;
      }
    }

    // reset the length
    this.length = this.models.length;

    // sort the collection if appropriate.
    if (this.comparator && shouldSort) {
      this.sort();
    }

    if (!options.silent) {
      // 'update' trigger on collection
      this.triggerUpdate();
    }

    return this;
  }

  /**
   * Sets a model or list of models on the collection after completely removing all references and
   * listeners to previous models.
   */
  reset(models: ModelArg<T, O> | ModelArg<T, O>[] = [], options: CSetOptions = {}) {
    for (let i = 0; i < this.models.length; i++) {
      this._removeReference(this.models[i] as InstanceType<this["Model"]>);
    }

    this._reset();
    // this is silent so that we don't trigger until we are all done. this is extra
    // important after a request returns because as of React 17 those are still synchronous udpates
    this.add(models, { silent: true, ...options });

    if (!options.silent) {
      // reset trigger
      this.triggerUpdate();
    }

    return this;
  }

  /**
   * When adding a model to a collection, the collection makes shorthand references to it, and it
   * does it both by its idAttribute as well as its client id attribute.
   */
  get(obj: Model<T, O>["id"] | ModelArg<T, O>): InstanceType<this["Model"]> | undefined {
    if (!obj && typeof obj !== "number") {
      return undefined;
    }

    return typeof obj === "string" || typeof obj === "number" ?
        this._byId[obj]
      : this._byId[(this._isModel(obj) ? obj.attributes : obj)[this.Model.idAttribute]] ||
          (obj.cid && this._byId[obj.cid]);
  }

  /**
   * Looks up by id/client id/object containing either whether the collection has a model in its
   * collection.
   */
  has(obj: Model<T, O>["id"] | ModelArg<T, O>) {
    // @ts-ignore
    return ![undefined, null].includes(this.get(obj));
  }

  /**
   * Retuns a model at the given collection index, which can be negative.
   */
  at(index: number): InstanceType<this["Model"]> | undefined {
    if (index < 0) {
      index += this.length;
    }

    return this.models[index];
  }

  /** COLLECTION HELPER METHODS */
  map(predicate: (model: InstanceType<this["Model"]>) => any) {
    return this.models.map(predicate);
  }

  find(predicate: (model: InstanceType<this["Model"]>) => boolean) {
    return this.models.find(predicate);
  }

  filter(predicate: (model: InstanceType<this["Model"]>) => boolean) {
    return this.models.filter(predicate);
  }

  findWhere(attrs: Partial<T>) {
    return this.where(attrs, true);
  }

  /**
   * @param {object} attrs - object of properties and values to match models against
   * @param {boolean} first - whether to take all matched models or just the first
   * @return {Model[]} list of models found with the matched properties in `attrs`
   */
  where<B extends boolean = false>(
    attrs: Partial<T>,
    first?: B
  ): B extends true ? InstanceType<this["Model"]> | undefined : InstanceType<this["Model"]>[] {
    const predicate = (model: InstanceType<this["Model"]>) => {
      for (let [attr, val] of Object.entries(attrs)) {
        if (!isDeepEqual(model.get(attr), val)) {
          return false;
        }
      }

      return true;
    };

    if (first === true) {
      return this.find(predicate) as any;
    }

    return this.filter(predicate) as any;
  }

  pluck<K extends keyof T>(attr: K): T[K][] {
    return this.map((model) => model.get(attr));
  }

  slice(...args: number[]) {
    return this.models.slice(...args);
  }

  /**
   * Sorts the collection by its comparator property. In most cases, you shouldn't need to call this
   * method directly; it happens automatically when new models are added.
   */
  sort() {
    if (!this.comparator) {
      throw new Error("Cannot sort a set without a comparator");
    }

    // Run sort based on type of `comparator`.
    if (typeof this.comparator === "function" && this.comparator.length > 1) {
      // @ts-ignore
      this.models.sort(this.comparator.bind(this));
    } else {
      this.models = sortBy(this.models, (model) =>
        typeof this.comparator === "function" ? this.comparator(model) : model.get(this.comparator)
      );
    }

    return this;
  }

  /**
   * Main method that preps a GET request at this collection's url. This is the method the request
   * module uses to sync server data after instantiating a collection. Upon returning, an update is
   * triggered for all registered components.
   */
  fetch(options: SyncOptions & CSetOptions = {}) {
    options = { parse: true, method: "GET", ...options };

    // @ts-ignore
    return this.sync(this, options).then(([json, response]) => {
      this.reset(json, { silent: true, ...options });
      // sync trigger
      this.triggerUpdate();

      return [this, response] as const;
    });
  }

  /**
   * This method is shorthand for adding a new model to the collection and then calling .save() on
   * it.
   */
  create(
    model: ModelArg<T, O>,
    options: { wait?: boolean } & SyncOptions & CSetOptions = {}
  ): Promise<[InstanceType<this["Model"]>, Response]> {
    model = this._prepareModel(model, options);

    if (!options.wait) {
      this.add(model, options);
    }

    return model
      .save(null, options)
      .then((...args: [InstanceType<this["Model"]>, Response]) => {
        if (options.wait) {
          // note that this is NOT silent because even though we are already triggering an update
          // after the model sync, because the model isn't added, the collection doesn't also get
          // an update
          this.add(model, options);
        }

        // model should now have an id property if it didn't previously
        this._addReference(model as InstanceType<this["Model"]>);

        return args[0];
      })
      .catch((response: Response) => {
        if (!options.wait) {
          this.remove(model);
        }

        return Promise.reject(response);
      });
  }

  /**
   * By default, parse() is the identity function. Override this if you need special business logic
   * to transform the server response into a different form for your application that will be set
   * as models on the collection.
   */
  parse(response: any, options: SyncOptions & CSetOptions): T[] {
    return response;
  }

  /**
   * This function gets called when the collection is instantiated, and its return value is set to
   * its Model property (and used to instantiate all its models). It's only used if a `Model`
   * option isn't passed to the constructor, and by default it returns the Model base class. But
   * if the collection has an `idAttribute` static property, it will create a new Model class
   * with the corresponding `idAttribute` property and return that.
   */
  _getModelClass<T extends Record<string, any>, O extends Record<string, any>>() {
    if ((this.constructor as typeof Collection).idAttribute) {
      let attr = (this.constructor as typeof Collection).idAttribute;

      return class extends Model<T, O> {
        static idAttribute = attr;
      };
    }

    return (this.constructor as typeof Collection).Model<T, O>;
  }

  /**
   * Private method to reset all internal state. Called when the collection
   * is first initialized or reset.
   */
  _reset() {
    this.length = 0;
    this.models = [];
    this._byId = {};
  }

  /**
   * Turns a set of attributes into an instance of the collection's model. If it is already a model,
   * it assigns the collection instance to the model's `collection` property and returns the model.
   */
  _prepareModel(attrs: ModelArg<T, O>, options: CSetOptions = {}): Model<T, O> {
    if (this._isModel(attrs)) {
      if (!attrs.collection) {
        attrs.collection = this;
      }

      return attrs as Model<T, O>;
    }

    // @ts-ignore
    return new this.Model(attrs as T, { ...this.urlOptions, ...options, collection: this });
  }

  /**
   * Internal method called by .remove() that, in addition to taking models out of the collection,
   * also removes their references in the collection as well as their listeners.
   */
  _removeModels(models: (Model<T, O>["id"] | ModelArg<T, O>)[]) {
    const removed = [];

    for (let i = 0; i < models.length; i++) {
      let model = this.get(models[i] as Model<T, O>["id"] | ModelArg<T, O>);

      if (!model) {
        continue;
      }

      let index = this.models.indexOf(model);

      this.models.splice(index, 1);
      this.length--;

      delete this._byId[model.cid];

      if (model.attributes[this.Model.idAttribute]) {
        delete this._byId[model.attributes[this.Model.idAttribute]];
      }

      removed.push(model);
      this._removeReference(model);
    }

    return removed;
  }

  /**
   * Helper method to determine whether an object is a Model.
   */
  _isModel(model: any): boolean {
    return model instanceof Model;
  }

  /**
   * Internal method used by .set() when adding a model to a collection. Adds reference properties
   * on the collection for direct access to the model and subscribes the collection to model
   * updates. This allows components to listen only on a collection and not an individual model and
   * still see the updates they expect.
   */
  _addReference(model: Model<T, O>) {
    this._byId[model.cid] = model;

    let id = model.attributes[this.Model.idAttribute];

    if (id || typeof id === "number") {
      this._byId[id] = model;
    }

    model.onUpdate(this.triggerUpdate, this);
  }

  /**
   * Internal method used by .remove() when removing a model from a collection. Basically the
   * inverse of _addReference: it removes reference properties on the collection and unsubscribes
   * listeners on model updates.
   */
  _removeReference(model: Model<T, O>) {
    delete this._byId[model.cid];

    let id = model.attributes[this.Model.idAttribute];

    if (id) {
      delete this._byId[id];
    }

    delete model.collection;

    model.offUpdate(this);
  }

  /**
   * Used by models when they are given a new id, which should, frankly, rarely happen. Removes the
   * old reference and adds the new one so that `.get()` still works.
   *
   * @param {string} id - the new id to make a reference with
   * @param {string} prevId - the old id to remove
   * @param {Model} model - Model instance for new reference
   */
  _updateModelReference(id: string | number, prevId: string | number, model: Model<T, O>) {
    if (id) {
      delete this._byId[prevId];
      this._byId[id] = model;
    }
  }
}
