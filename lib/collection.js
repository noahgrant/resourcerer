import {isEqual, sortBy} from 'underscore';

import Events from './events.js';
import Model from './model.js';
import sync from './sync.js';
import {wrapError} from './utils.js';

// Schmackbone.Collection
// -------------------

// If models tend to represent a single row of data, a Schmackbone Collection is
// more analogous to a table full of data ... or a small slice or page of that
// table, or a collection of rows that belong together for a particular reason
// -- all of the messages in this particular folder, all of the documents
// belonging to this particular author, and so on. Collections maintain
// indexes of their models, both in order, and for lookup by `id`.

// Create a new **Collection**, perhaps to contain a specific type of `model`.
// If a `comparator` is specified, the Collection will maintain
// its models in sort order, as they're added and removed.
/* eslint-disable eqeqeq */
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

  // The JSON representation of a Collection is an array of the
  // models' attributes.
  toJSON(options) {
    return this.map((model) => model.toJSON(options));
  }

  map(predicate) {
    return this.models.map(predicate);
  }

  // Proxy `Schmackbone.sync` by default.
  sync() {
    return sync.apply(this, arguments);
  }

  // Add a model, or list of models to the set. `models` may be Schmackbone
  // Models or raw JavaScript objects to be converted to Models, or any
  // combination of the two.
  add(models, options) {
    return this.set(models, {merge: false, ...options, add: true, remove: false});
  }

  // Remove a model, or a list of models from the set.
  remove(models, options={}) {
    var singular = !Array.isArray(models),
        removed;

    models = singular ? [models] : models.slice();
    removed = this._removeModels(models, options);

    if (!options.silent && removed.length) {
      options.changes = {added: [], merged: [], removed};
      this.triggerUpdate('update', this, options);
    }

    return singular ? removed[0] : removed;
  }

  // Update a collection by `set`-ing a new list of models, adding new ones,
  // removing models that are no longer present, and merging models that
  // already exist in the collection, as necessary. Similar to **Model#set**,
  // the core operation for updating the data contained by the collection.
  set(models, options) {
    if (!models) {
      return;
    }

    options = {add: true, remove: true, merge: true, ...options};

    if (options.parse && !this._isModel(models)) {
      models = this.parse(models, options) || [];
    }

    let singular = !Array.isArray(models);

    models = singular ? [models] : models.slice();

    let at = options.at;

    if (at != null) {
      at = +at;
    }

    if (at > this.length) {
      at = this.length;
    }

    if (at < 0) {
      at += this.length + 1;
    }

    let set = [];
    let toAdd = [];
    let toMerge = [];
    let toRemove = [];
    let modelMap = {};

    let add = options.add;
    let merge = options.merge;
    let remove = options.remove;

    let sort = false;
    let sortable = this.comparator && at == null && options.sort !== false;
    let sortAttr = typeof this.comparator === 'string' ? this.comparator : null;

    // Turn bare objects into model references, and prevent invalid models
    // from being added.
    let model;
    let i;

    for (i = 0; i < models.length; i++) {
      model = models[i];

      // If a duplicate is found, prevent it from being added and
      // optionally merge it into the existing model.
      let existing = this.get(model);

      if (existing) {
        if (merge && model !== existing) {
          let attrs = this._isModel(model) ? model.attributes : model;

          if (options.parse) {
            attrs = existing.parse(attrs, options);
          }

          existing.set(attrs, options);
          toMerge.push(existing);

          if (sortable && !sort) {
            sort = existing.hasChanged(sortAttr);
          }
        }

        if (!modelMap[existing.cid]) {
          modelMap[existing.cid] = true;
          set.push(existing);
        }

        models[i] = existing;

      // If this is a new, valid model, push it to the `toAdd` list.
      } else if (add) {
        model = models[i] = this._prepareModel(model, options);

        if (model) {
          toAdd.push(model);
          this._addReference(model, options);
          modelMap[model.cid] = true;
          set.push(model);
        }
      }
    }

    // Remove stale models.
    if (remove) {
      for (i = 0; i < this.length; i++) {
        model = this.models[i];

        if (!modelMap[model.cid]) {
          toRemove.push(model);
        }
      }

      if (toRemove.length) {
        this._removeModels(toRemove, options);
      }
    }

    // See if sorting is needed, update `length` and splice in new models.
    let replace = !sortable && add && remove;

    if (set.length && replace) {
      this.models.length = 0;
      this.models.splice(0, 0, ...set);
      this.length = this.models.length;
    } else if (toAdd.length) {
      if (sortable) {
        sort = true;
      }

      this.models.splice(at == null ? this.length : at, 0, ...toAdd);
      this.length = this.models.length;
    }

    // Silently sort the collection if appropriate.
    if (sort) {
      this.sort({silent: true});
    }

    // Unless silenced, it's time to fire all appropriate add/sort/update events.
    if (!options.silent) {
      for (i = 0; i < toAdd.length; i++) {
        if (at != null) {
          options.index = at + i;
        }

        model = toAdd[i];
        model.triggerUpdate('add', model, this, options);
      }

      if (toAdd.length || toRemove.length || toMerge.length) {
        options.changes = {
          added: toAdd,
          removed: toRemove,
          merged: toMerge
        };
        this.triggerUpdate('update', this, options);
      }
    }

    // Return the added (or merged) model (or models).
    return singular ? models[0] : models;
  }

  // When you have more items than you want to add or remove individually,
  // you can reset the entire set with a new list of models, without firing
  // any granular `add` or `remove` events. Fires `reset` when finished.
  // Useful for bulk operations and optimizations.
  reset(models, options={}) {
    options = {...options};

    for (let i = 0; i < this.models.length; i++) {
      this._removeReference(this.models[i], options);
    }

    options.previousModels = this.models;
    this._reset();
    models = this.add(models, {silent: true, ...options});

    if (!options.silent) {
      this.triggerUpdate('reset', this, options);
    }

    return models;
  }

  // Add a model to the end of the collection.
  push(model, options) {
    return this.add(model, {at: this.length, ...options});
  }

  // Remove a model from the end of the collection.
  pop(options) {
    var model = this.at(this.length - 1);

    return this.remove(model, options);
  }

  // Add a model to the beginning of the collection.
  unshift(model, options) {
    return this.add(model, {at: 0, ...options});
  }

  // Remove a model from the beginning of the collection.
  shift(options) {
    var model = this.at(0);

    return this.remove(model, options);
  }

  // Slice out a sub-array of models from the collection.
  slice() {
    return [].slice.apply(this.models, arguments);
  }

  // Get a model from the set by id, cid, model object with id or cid
  // properties, or an attributes object that is transformed through modelId.
  get(obj) {
    if (obj == null) {
      return undefined;
    }

    return this._byId[obj] ||
      this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj)] ||
      obj.cid && this._byId[obj.cid];
  }

  // Returns `true` if the model is in the collection.
  has(obj) {
    return this.get(obj) != null;
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

  first() {
    return this.at(0);
  }

  last() {
    return this.at(this.length - 1);
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
        if (!isEqual(model.get(attr), val)) {
          return false;
        }
      }

      return true;
    };

    return this[first ? 'find' : 'filter'](predicate);
  }

  // Force the collection to re-sort itself. You don't need to call this under
  // normal circumstances, as the set will maintain sort order as each item
  // is added.
  sort(options={}) {
    var comparator = this.comparator;

    if (!comparator) {
      throw new Error('Cannot sort a set without a comparator');
    }

    if (typeof comparator === 'function') {
      comparator = comparator.bind(this);
    }

    // Run sort based on type of `comparator`.
    if (comparator.length === 1 || typeof comparator === 'string') {
      this.models = sortBy(
        this.models,
        (model) => typeof comparator === 'function' ? comparator(model) : model.get(comparator)
      );
    } else {
      this.models.sort(comparator);
    }

    return this;
  }

  // Pluck an attribute from each model in the collection.
  pluck(attr) {
    return this.map((model) => model.get(attr + ''));
  }

  // Fetch the default set of models for this collection, resetting the
  // collection when they arrive. If `reset: true` is passed, the response
  // data will be passed through the `reset` method instead of `set`.
  fetch(options={}) {
    var success = options.success;

    options = {parse: true, ...options};

    options.success = (resp) => {
      var method = options.reset ? 'reset' : 'set';

      this[method](resp, options);
      this.triggerUpdate('sync', this, resp, options);

      if (success) {
        success.call(options.context, this, resp, options);
      }

      return [this, resp, options];
    };

    wrapError(this, options);

    return this.sync('read', this, options);
  }

  // Create a new instance of a model in this collection. Add the model to the
  // collection immediately, unless `wait: true` is passed, in which case we
  // wait for the server to agree.
  create(model, options={}) {
    var success = options.success;

    model = this._prepareModel(model, options);

    if (!model) {
      return false;
    }

    if (!options.wait) {
      this.add(model, options);
    }

    options.success = (_model, resp, callbackOpts) => {
      if (options.wait) {
        this.add(_model, callbackOpts);
      }

      if (success) {
        success.call(callbackOpts.context, _model, resp, callbackOpts);
      }
    };

    return model.save(null, options);
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

    options = {...options};
    options.collection = this;

    /* eslint-disable new-cap */
    let model = new this.model(attrs, options);

    return model;
  }

  // Internal method called by both remove and set.
  _removeModels(models, options) {
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

      let id = this.modelId(model.attributes);

      if (id != null) {
        delete this._byId[id];
      }

      removed.push(model);
      this._removeReference(model, options);
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

    if (id != null) {
      this._byId[id] = model;
    }

    model.onUpdate('all', this._onModelEvent, this);
  }

  // Internal method to sever a model's ties to a collection.
  _removeReference(model, options) {
    delete this._byId[model.cid];

    let id = this.modelId(model.attributes);

    if (id != null) {
      delete this._byId[id];
    }

    if (this === model.collection) {
      delete model.collection;
    }

    model.offUpdate('all', this._onModelEvent, this);
  }

  // Internal method called every time a model in the set fires an event.
  // Sets need to update their indexes when models change ids. All other
  // events simply proxy through. "add" and "remove" events that originate
  // in other collections are ignored.
  _onModelEvent(event, model, collection, options) {
    if (model) {
      if ((event === 'add' || event === 'remove') && collection !== this) {
        return;
      }

      if (event === 'destroy') {
        this.remove(model, options);
      }

      if (event === 'change') {
        let prevId = this.modelId(model.previousAttributes());
        let id = this.modelId(model.attributes);

        if (prevId !== id) {
          if (prevId != null) {
            delete this._byId[prevId];
          }

          if (id != null) {
            this._byId[id] = model;
          }
        }
      }
    }

    this.triggerUpdate(...arguments);
  }
}

// Define the Collection's inheritable methods.
Object.assign(Collection.prototype, Events);
