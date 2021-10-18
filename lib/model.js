import {isDeepEqual, uniqueId, urlError} from './utils';

import Events from './events';
import sync from './sync';

// The prefix is used to create the client id which is used to identify models locally.
// You may want to override this if you're experiencing name clashes with model ids.
const CID_PREFIX = 'c';

// Schmackbone **Models** are the basic data object in the framework --
// frequently representing a row in a table in a database on your server.
// A discrete chunk of data and a bunch of useful, related methods for
// performing computations and transformations on that data.

// Create a new model with the specified attributes. A client id (`cid`)
// is automatically generated and assigned for you, but this should be internal
// only.
export default class Model {
  constructor(attributes={}, options={}) {
    this.cid = uniqueId(CID_PREFIX);
    this.attributes = {};

    if (options.collection) {
      this.collection = options.collection;
    }

    if (options.parse) {
      attributes = this.parse(attributes, options) || {};
    }

    this.set({
      ...typeof this.constructor.defaults === 'function' ?
        this.constructor.defaults() :
        this.constructor.defaults,
      ...attributes
    }, options);
  }

  static idAttribute = 'id'

  static cacheFields = []

  // Return a copy of the model's `attributes` object.
  toJSON() {
    return {...this.attributes};
  }

  // proxy `sync` module by default, but this can be overridden for custom behavior
  sync() {
    return sync.apply(this, arguments);
  }

  // Get the value of an attribute.
  get(attr) {
    return this.attributes[attr];
  }

  // get the values of multiple attributes
  pick(...attrs) {
    return attrs.reduce((memo, attr) => Object.assign(
      memo,
      this.has(attr) ? {[attr]: this.get(attr)} : {}
    ), {});
  }

  // Returns `true` if the attribute contains a value that is not null
  // or undefined.
  has(attr) {
    return ![undefined, null].includes(this.get(attr));
  }

  // Set a hash of model attributes on the object, firing `"change"`. This is
  // the core primitive operation of a model, updating the data and notifying
  // anyone who needs to know about the change in state. The heart of the beast.
  set(attrs={}, options={}) {
    var prevId = this.id,
        hasSomethingChanged = false;

    // For each `set` attribute, update or delete the current value.
    for (let attr of Object.keys(attrs)) {
      if (!hasSomethingChanged && !isDeepEqual(this.attributes[attr], attrs[attr])) {
        hasSomethingChanged = true;
      }

      options.unset ? delete this.attributes[attr] : this.attributes[attr] = attrs[attr];
    }

    // Update the `id`.
    if (this.constructor.idAttribute in attrs) {
      this.id = this.get(this.constructor.idAttribute);
    }

    // trigger updated for the change
    if (!options.silent && hasSomethingChanged) {
      this.triggerUpdate();

      if (this.collection && prevId !== this.id) {
        this.collection._updateModelId(this.id, prevId, this);
      }
    }

    return this;
  }

  // Remove an attribute from the model, firing `"change"`. `unset` is a noop
  // if the attribute doesn't exist.
  unset(attr, options) {
    return this.set(attr, undefined, {unset: true, ...options});
  }

  // Clear all attributes on the model, firing `"change"`.
  clear(options) {
    var attrs = {};

    for (let key of Object.keys(this.attributes)) {
      attrs[key] = undefined;
    }

    return this.set(attrs, {unset: true, ...options});
  }

  // Fetch the model from the server, merging the response with the model's
  // local attributes. Any changed attributes will trigger a "change" event.
  fetch(options={}) {
    options = {parse: true, method: 'GET', ...options};

    return this.sync(this, options)
        .then(([json, response]) => {
          var serverAttrs = options.parse ? this.parse(json, options) : json;

          this.set(serverAttrs, options);
          // sync update
          this.triggerUpdate();

          return [this, response];
        })
        .catch((response) => Promise.reject(response));
  }

  // Set a hash of model attributes, and sync the model to the server.
  // If the server returns an attributes hash that differs, the model's
  // state will be `set` again.
  save(attrs, options) {
    options = {parse: true, ...options};
    attrs = attrs || this.toJSON();

    // If we're not waiting and attributes exist, save acts as `set(attr).save(null, opts)`
    if (!options.wait) {
      this.set(attrs, options);
    }

    // Set temporary attributes if `{wait: true}` to properly find new ids.
    if (options.wait) {
      this.attributes = {...this.attributes, ...attrs};
    }

    options.method = this.isNew() ? 'POST' : options.patch ? 'PATCH' : 'PUT';

    if (options.method === 'PATCH' && !options.attrs) {
      options.attrs = attrs;
    }

    return this.sync(this, options)
        .then(([json, response]) => {
          var serverAttrs = options.parse ? this.parse(json, options) : json;

          if (options.wait) {
            serverAttrs = {...attrs, ...serverAttrs};
          }

          this.set(serverAttrs, options);
          // sync update
          this.triggerUpdate();

          return [this, response];
        })
        .catch((response) => Promise.reject(response));
  }

  // Destroy this model on the server if it was already persisted.
  // Optimistically removes the model from its collection, if it has one.
  // If `wait: true` is passed, waits for the server to respond before removal.
  destroy(options={}) {
    var request = this.isNew() ?
      Promise.resolve() :
      this.sync(this, {method: 'DELETE', ...options});

    if (!options.wait) {
      this.triggerUpdate();
      this.collection?.remove(this);
    }

    return request.then(([json, response]) => {
      if (options.wait || !this.isNew()) {
        // delayed destroy update or sync update
        this.triggerUpdate();
        this.collection?.remove(this);
      }

      return [this, response];
    }).catch((response) => Promise.reject(response));
  }

  // Default URL for the model's representation on the server -- if you're
  // using Schmackbone's restful methods, override this to change the endpoint
  // that will be called.
  url() {
    var base = this.urlRoot?.() || this.collection.url?.() || urlError();

    if (this.isNew()) {
      return base;
    }

    return base.replace(/[^/]$/, '$&/') +
      window.encodeURIComponent(this.get(this.constructor.idAttribute));
  }

  // **parse** converts a response into the hash of attributes to be `set` on
  // the model. The default implementation is just to pass the response along.
  parse(resp, options) {
    return resp;
  }

  // A model is new if it has never been saved to the server, and lacks an id.
  isNew() {
    return !this.has(this.constructor.idAttribute);
  }
}

// mix in events to the model
Object.assign(Model.prototype, Events);
