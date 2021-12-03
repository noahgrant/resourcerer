import {isDeepEqual, sortBy} from './utils';

import Events from './events';
import Model from './model';
import sync from './sync';

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
export default class Collection {
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
  constructor(models, options={}) {
    const RESERVED_OPTION_KEYS = ['Model', 'comparator', 'silent', 'parse'];

    this.Model = options.Model || this.constructor.Model;
    this.comparator = options.comparator || this.constructor.comparator;

    this._reset();

    this.urlOptions = Object.keys(options).reduce((memo, key) => Object.assign(
      memo,
      !RESERVED_OPTION_KEYS.includes(key) ? {[key]: options[key]} : {}
    ), {});

    if (models) {
      // silent for completeness, i guess. but a nothing triggered here because it's impossible for
      // a listener to have been attached at this point
      this.reset(models, {silent: true, ...options});
    }
  }

  /**
   * The default model for a collection is just a Model, but this can be overridden by any other
   * custom Model subclass.
   */
  static Model = Model

  /**
   * This is a list of keys (could be attribute keys, but also keys passed in from the options
   * object when instantiated) that resourcerer should take into account when determining how to
   * cache a model and consider models to be identical. Can also be a function that returns an
   * object.
   */
  static cacheFields = []

  /**
   * Use this to tell resourcerer to track this collection's request time via the `track` method
   * added in the resourcerer configuration file. This can be a boolean or a function that returns a
   * boolean. If the latter, it takes a the resource config object as an argument.
   */
  static measure = false

  /**
   * Similar to the method for an individual model, this maps through each model in the collection
   * and returns its data attributes.
   *
   * @return {object[]} list of all models' data representations
   */
  toJSON() {
    return this.map((model) => model.toJSON());
  }

  /**
   * Proxies the `sync` module by default, but this can be overridden for custom behavior.
   */
  sync(...args) {
    return sync.call(this, ...args);
  }

  /**
   * Adds a model or models to the collection. If a comparator exists, the collection will be
   * re-sorted, as well. This will also create a reference on the collection to the model and apply
   * listeners on the collection to events on the new model.
   *
   * @param {object|object[]} models - model or list of models to be added to the collection
   * @param {object} options - .set() options hash
   * @return {Collection} collection instance
   */
  add(models, options={}) {
    return this.set(models, options);
  }

  /**
   * Removes a model or list of models from the collection, which will also remove any references
   * as well as any listeners.
   *
   * @param {object|object[]} models - model or list of models to be removed to the collection
   * @param {object} options - .set() options hash
   * @return {Collection} collection instance
   */
  remove(models, options={}) {
    var removed = this._removeModels(!Array.isArray(models) ? [models] : models);

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
   *
   * @param {object|object[]} models - model or list of models to be set on the collection
   * @param {object} options - map with the following options:
   *   * parse {boolean} - whether to run the models through the parse method (both the collection's
   *     parse method as well each model's) before setting them.
   *   * silent {boolean} - if true, does not trigger an update after setting
   * @return {Collection} collection instance
   */
  set(models, options={}) {
    var shouldSort = false;

    if (!models) {
      return this;
    } else if (options.parse && !this._isModel(models)) {
      models = this.parse(models, options) || [];
    }

    // models can be passed as a single model or a list
    models = !Array.isArray(models) ? [models] : models;

    for (let model of models) {
      // if model already exists, swap in new attributes
      if (this.get(model)) {
        let attrs = this._isModel(model) ? model.attributes : model;

        this.get(model).set(
          options.parse ?
            this.get(model).parse(attrs, options) :
            attrs
        );
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
   *
   * @param {object|object[]} models - model or list of models to be set on the collection
   * @param {object} options - .set() options hash
   * @return {Collection} collection instance
   */
  reset(models=[], options={}) {
    for (let i = 0; i < this.models.length; i++) {
      this._removeReference(this.models[i]);
    }

    this._reset();
    // this is silent so that we don't trigger until we are all done. this is extra
    // important after a request returns because as of React 17 those are still synchronous udpates
    this.add(models, {silent: true, ...options});

    if (!options.silent) {
      // reset trigger
      this.triggerUpdate();
    }

    return this;
  }

  /**
   * When adding a model to a collection, the collection makes shorthand references to it, and it
   * does it both by its idAttribute as well as its client id attribute.
   *
   * @param {string} obj - identifier to lookup a model, which can be its id attribute, its client
   *   id, or an object containing either
   * @return {Model} collection's model, if found
   */
  get(obj) {
    if (!obj && typeof obj !== 'number') {
      return undefined;
    }

    return this._byId[obj] ||
      this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj)] ||
      obj.cid && this._byId[obj.cid];
  }

  /**
   * Looks up by id/client id/object containing either whether the collection has a model in its
   * collection.
   *
   * @param {string} obj - identifier to lookup a model, which can be its id attribute, its client
   *   id, or an object containing either
   * @return {boolean} whether the model is in the collection
   */
  has(obj) {
    return ![undefined, null].includes(this.get(obj));
  }

  /**
   * Retuns a model at the given collection index, which can be negative.
   *
   * @param {number} index
   * @return {Model}
   */
  at(index) {
    if (index < 0) {
      index += this.length;
    }

    return this.models[index];
  }

  /** COLLECTION HELPER METHODS */
  /**
   * @param {function} predicate - mapping function taking each model as an argument
   * @return {any[]}
   */
  map(predicate) {
    return this.models.map(predicate);
  }

  /**
   * @param {function} predicate - function taking each model as an argument and returning a boolean
   * @return {Model?} the first model where the predicate returned true
   */
  find(predicate) {
    return this.models.find(predicate);
  }

  /**
   * @param {function} predicate - function taking each model as an argument and returning a boolean
   * @return {Model[]} the list of models where the predicate returned true
   */
  filter(predicate) {
    return this.models.filter(predicate);
  }

  /**
   * @param {object} attrs - object of properties and values to match models against
   * @return {Model?} the first model found with the matched properties in `attrs`
   */
  findWhere(attrs) {
    return this.where(attrs, true);
  }

  /**
   * @param {object} attrs - object of properties and values to match models against
   * @param {boolean} first - whether to take all matched models or just the first
   * @return {Model[]} list of models found with the matched properties in `attrs`
   */
  where(attrs, first) {
    var predicate = (model) => {
      for (let [attr, val] of Object.entries(attrs)) {
        if (!isDeepEqual(model.get(attr), val)) {
          return false;
        }
      }

      return true;
    };

    return this[first ? 'find' : 'filter'](predicate);
  }

  /**
   * @param {string} attr - an attribute to get from each model in the collectionn
   * @return {string[]} list of that attribute's values in the collection
   */
  pluck(attr) {
    return this.map((model) => model.get(attr));
  }

  /**
   * @param {any[]} args - same args for an array's .slice() method
   * @return {Model[]} collection model subset
   */
  slice(...args) {
    return this.models.slice(...args);
  }

  /**
   * Sorts the collection by its comparator property. In most cases, you shouldn't need to call this
   * method directly; it happens automatically when new models are added.
   */
  sort() {
    if (!this.comparator) {
      throw new Error('Cannot sort a set without a comparator');
    }

    // Run sort based on type of `comparator`.
    if (typeof this.comparator === 'function' && this.comparator.length > 1) {
      this.models.sort(this.comparator.bind(this));
    } else {
      this.models = sortBy(
        this.models,
        (model) => typeof this.comparator === 'function' ?
          this.comparator(model) :
          model.get(this.comparator)
      );
    }

    return this;
  }

  /**
   * Main method that preps a GET request at this collection's url. This is the method the request
   * module uses to sync server data after instantiating a collection. Upon returning, an update is
   * triggered for all registered components.
   *
   * @param {object} options - can include any property used by the sync module
   * @return {promise} - resolves with a tuple of the instance and response object
   */
  fetch(options={}) {
    options = {parse: true, method: 'GET', ...options};

    return this.sync(this, options)
        .then(([json, response]) => {
          this.reset(json, {silent: true, ...options});
          // sync trigger
          this.triggerUpdate();

          return [this, response];
        })
        .catch((response) => Promise.reject(response));
  }

  /**
   * This method is shorthand for adding a new model to the collection and then calling .save() on
   * it.
   *
   * @param {object|Model} model - new model to be added to the collection and synced with the
   *   server
   * @param {object} options - can include any property used by the sync module. pass {wait: true}
   *   to wait to add the model to the collection until after the save request succeeds
   * @return {promise} - resolves with a tuple of the instance and response object
   */
  create(model, options={}) {
    model = this._prepareModel(model, options);

    if (!options.wait) {
      this.add(model, options);
    }

    return model.save(null, options)
        .then((...args) => {
          if (options.wait) {
            // note that this is NOT silent because even though we are already triggering an update
            // after the model sync, because the model isn't added, the collection doesn't also get
            // an update
            this.add(model, options);
          }

          // model should now have an id property if it didn't previously
          this._addReference(model);

          return args[0];
        })
        .catch((response) => {
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
   *
   * @param {any} response - server response data
   * @param {object} options - options map
   * @return {object} data object transformed from the server response to be applied as the
   *   collections' models' data attributes
   */
  parse(response, options) {
    return response;
  }

  /**
   * Defines how to uniquely identify models in the collection, which defaults to looking up a
   * model's idAttribute (which itself defaults to 'id').
   *
   * @param {object} attrs - a model's data attribute
   * @return {string} that model's unique identifier
   */
  modelId(attrs) {
    return attrs[this.Model.idAttribute];
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
   *
   * @param {object|Model} attrs - attributes to turn into a model
   * @param {object} options - options to be passed to the model's constructor
   * @return {Model}
   */
  _prepareModel(attrs, options) {
    if (this._isModel(attrs)) {
      if (!attrs.collection) {
        attrs.collection = this;
      }

      return attrs;
    }

    return new this.Model(attrs, {...options, collection: this});
  }

  /**
   * Internal method called by .remove() that, in addition to taking models out of the collection,
   * also removes their references in the collection as well as their listeners.
   *
   * @param {Model[]} models - list of models to be removed from the collection
   * @return {Model[]} list of models actually removed, since they won't get removed if they don't
   *   exist in the collection in the first place
   */
  _removeModels(models) {
    var removed = [];

    for (let i = 0; i < models.length; i++) {
      let model = this.get(models[i]);

      if (!model) {
        continue;
      }

      let index = this.models.indexOf(model);

      this.models.splice(index, 1);
      this.length--;

      delete this._byId[model.cid];

      if (this.modelId(model.attributes)) {
        delete this._byId[this.modelId(model.attributes)];
      }

      removed.push(model);
      this._removeReference(model);
    }

    return removed;
  }

  /**
   * Helper method to determine whether an object is a Model.
   *
   * @param {any} model - object in question
   * @return {boolean} whether the object is an instance of Model
   */
  _isModel(model) {
    return model instanceof Model;
  }

  /**
   * Internal method used by .set() when adding a model to a collection. Adds reference properties
   * on the collection for direct access to the model and subscribes the collection to model
   * updates. This allows components to listen only on a collection and not an individual model and
   * still see the updates they expect.
   *
   * @param {Model} model
   */
  _addReference(model) {
    this._byId[model.cid] = model;

    let id = this.modelId(model.attributes);

    if (id || typeof id === 'number') {
      this._byId[id] = model;
    }

    model.onUpdate(this.triggerUpdate, this);
  }

  /**
   * Internal method used by .remove() when removing a model from a collection. Basically the
   * inverse of _addReference: it removes reference properties on the collection and unsubscribes
   * listeners on model updates.
   *
   * @param {Model} model
   */
  _removeReference(model) {
    delete this._byId[model.cid];

    let id = this.modelId(model.attributes);

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
  _updateModelReference(id, prevId, model) {
    if (id) {
      delete this._byId[prevId];
      this._byId[id] = model;
    }
  }
}

// mix in events to the Collection
Object.assign(Collection.prototype, Events);
