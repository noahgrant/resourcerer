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
   *   * model {Model} - dynamically overrides the static model property for the type of Model that
   *     this collection's models should be instances of
   *   * comparator {function|string} - dynamically overrides the static comparator property used to
   *     sort the collection
   */
  constructor(models, options={}) {
    this.model = options.model || this.constructor.model;
    this.comparator = options.comparator || this.constructor.comparator;

    this._reset();

    if (models) {
      this.reset(models, {silent: true, ...options});
    }
  }

  /**
   * The default model for a collection is just a Model, but this can be overridden by any other
   * custom Model subclass.
   */
  static model = Model

  /**
   * This is a list of keys (could be attribute keys, but also keys passed in from the options
   * object when instantiated) that resourcerer should take into account when determining how to
   * cache a model and consider models to be identical. Can also be a function that returns an
   * object.
   */
  static cacheFields = []

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
  add(models, options) {
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
  set(models, options) {
    var shouldSort = false;

    if (!models) {
      return;
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
      // otheerwise add it to the collection
      } else {
        model = this._prepareModel(model, options);

        this.models.push(model);
        this._addReference(model, options);
        shouldSort = true;
      }
    }

    // reset the length
    this.length = this.models.length;

    // sort the collection if appropriate.
    if (this.comparator && shouldSort) {
      this.sort();
    }

    // Unless silenced, it's time to fire all appropriate add/sort/update events.
    if (!options.silent) {
      // 'update' trigger on collection
      this.triggerUpdate();
    }

    return this;
  }

  // When you have more items than you want to add or remove individually,
  // you can reset the entire set with a new list of models, without firing
  // any granular `add` or `remove` events. Fires `reset` when finished.
  // Useful for bulk operations and optimizations.
  /**
   * Sets a model or list of models on the collection after completely removing all references and
   * listeners to previous models.
   *
   * @param {object|object[]} models - model or list of models to be set on the collection
   * @param {object} options - .set() options hash
   * @return {Collection} collection instance
   */
  reset(models, options={}) {
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
    return [undefined, null].includes(this.get(obj));
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
          this.reset(json, options);
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
            // this is silent because we are already triggering an update after the model sync, and
            // as of React 17 those are still synchronous udpates
            this.add(model, {silent: true, ...options});
          }

          return args[0];
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
    return attrs[this.model.constructor.idAttribute];
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

  // Prepare a hash of attributes (or other model) to be added to this
  // collection.
  _prepareModel(attrs, options={}) {
    if (this._isModel(attrs)) {
      if (!attrs.collection) {
        attrs.collection = this;
      }

      return attrs;
    }

    /* eslint-disable new-cap */
    return new this.model(attrs, {...options, collection: this});
  }

  // Internal method called by both remove and set.
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

  // Method for checking whether an object should be considered a model for
  // the purposes of adding to the collection.
  _isModel(model) {
    return model instanceof Model;
  }

  // Internal method to create a model's ties to a collection.
  _addReference(model, options) {
    this._byId[model.cid] = model;

    let id = this.modelId(model.attributes);

    if (id) {
      this._byId[id] = model;
    }

    model.onUpdate(this.triggerUpdate, this);
  }

  // Internal method to sever a model's ties to a collection.
  _removeReference(model) {
    delete this._byId[model.cid];

    let id = this.modelId(model.attributes);

    if (id) {
      delete this._byId[id];
    }

    if (this === model.collection) {
      delete model.collection;
    }

    model.offUpdate(this);
  }

  _updateModelId(id, prevId, model) {
    if (prevId) {
      delete this._byId[prevId];
    }

    if (id) {
      this._byId[id] = model;
    }
  }
}

// mix in events to the Collection
Object.assign(Collection.prototype, Events);