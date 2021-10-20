import {isDeepEqual, sortBy} from './utils';

import Events from './events';
import Model from './model';
import sync from './sync';

export default class Collection {
  constructor(models, options={}) {
    this.model = options.model || this.constructor.model;
    this.comparator = options.comparator || this.constructor.comparator;

    this._reset();

    if (models) {
      this.reset(models, {silent: true, ...options});
    }
  }

  // The default model for a collection is just a **Schmackbone.Model**.
  // This should be overridden in most cases.
  static model = Model

  static cacheFields = []

  // The JSON representation of a Collection is an array of the
  // models' attributes.
  toJSON() {
    return this.map((model) => model.toJSON());
  }

  map(predicate) {
    return this.models.map(predicate);
  }

  // proxy `sync` module by default, but this can be overridden for custom behavior
  sync(...args) {
    return sync.call(this, ...args);
  }

  // Add a model, or list of models to the set. `models` may be Schmackbone
  // Models or raw JavaScript objects to be converted to Models, or any
  // combination of the two.
  add(models, options) {
    return this.set(models, {add: true, ...options});
  }

  // Remove a model, or a list of models from the set.
  remove(models, options={}) {
    var removed = this._removeModels(!Array.isArray(models) ? [models] : models);

    if (!options.silent && removed.length) {
      // update trigger on collection, necessary because removed models won't trigger collection
      // response at this point
      this.triggerUpdate();
    }

    return this;
  }

  // Update a collection by `set`-ing a new list of models, adding new ones,
  // removing models that are no longer present, and merging models that
  // already exist in the collection, as necessary. Similar to **Model#set**,
  // the core operation for updating the data contained by the collection.
  // NOT FOR REMOVING. for removing, use #remove or #reset.
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
  reset(models, options={}) {
    for (let i = 0; i < this.models.length; i++) {
      this._removeReference(this.models[i]);
    }

    this._reset();
    this.add(models, {silent: true, ...options});

    if (!options.silent) {
      // reset trigger
      this.triggerUpdate();
    }

    return this;
  }

  // Get a model from the set by id, cid, model object with id or cid
  // properties, or an attributes object that is transformed through modelId.
  get(obj) {
    if (!obj && typeof obj !== 'number') {
      return undefined;
    }

    return this._byId[obj] ||
      this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj)] ||
      obj.cid && this._byId[obj.cid];
  }

  // Returns `true` if the model is in the collection.
  has(obj) {
    return [undefined, null].includes(this.get(obj));
  }

  // Get the model at the given index.
  at(index) {
    if (index < 0) {
      index += this.length;
    }

    return this.models[index];
  }

  // some easy proxies
  find(predicate) {
    return this.models.find(predicate);
  }

  filter(predicate) {
    return this.models.filter(predicate);
  }

  // Return the first model with matching attributes. Useful for simple cases
  // of `find`.
  findWhere(attrs) {
    return this.where(attrs, true);
  }

  // Return models with matching attributes. Useful for simple cases of
  // `filter`.
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

  // Pluck an attribute from each model in the collection.
  pluck(attr) {
    return this.map((model) => model.get(attr + ''));
  }

  // Slice out a sub-array of models from the collection.
  slice(...args) {
    return this.models.slice(...args);
  }

  // Force the collection to re-sort itself. You don't need to call this under
  // normal circumstances, as the set will maintain sort order as each item
  // is added.
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

  // Fetch the default set of models for this collection, resetting the
  // collection when they arrive.
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

  // Create a new instance of a model in this collection. Add the model to the
  // collection immediately, unless `wait: true` is passed, in which case we
  // wait for the server to agree.
  create(model, options={}) {
    model = this._prepareModel(model, options);

    if (!options.wait) {
      this.add(model, options);
    }

    return model.save(null, options)
        .then((...args) => {
          if (options.wait) {
            this.add(model, options);
          }

          return args[0];
        });
  }

  // **parse** converts a response into a list of models to be added to the
  // collection. The default implementation is just to pass it through.
  parse(resp, options) {
    return resp;
  }

  // Define how to uniquely identify models in the collection.
  modelId(attrs) {
    return attrs[this.model.idAttribute || 'id'];
  }

  // Private method to reset all internal state. Called when the collection
  // is first initialized or reset.
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
