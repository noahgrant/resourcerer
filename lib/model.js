import {isDeepEqual, uniqueId, urlError} from './utils';

import Events from './events';
import sync from './sync';

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
export default class Model {
  /**
   * @param {object} attributes - initial server data representation to be kept on the model
   * @param {object} options - generic map. in the default constructor, use:
   *   * parse {boolean} - if true, runs the initial attributes through the parse function beefore
   *     setting on the model
   *   * collection {Collection} - links this model to a collection, if applicable
   *   * ...any other options that .set() takes
   */
  constructor(attributes={}, options={}) {
    this.cid = uniqueId('c');
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

  /**
   * This is the field that collections will use to index models and also to consider models unique.
   * Override this on a Model if appropriate for the indexing to happen on a different field.
   * Regardless, the value at this attribute will be set to model.id, the id field directly on the
   * model (not in attributes).
   */
  static idAttribute = 'id'

  /**
   * This is a list of keys (could be attribute keys, but also keys passed in from the options
   * object when instantiated) that resourcerer should take into account when determining how to
   * cache a model and consider models to be identical. Can also be a function that returns an
   * object.
   */
  static cacheFields = []

  /**
   * Default attributes on a model. Can be an object or a function that returns an object.
   */
  static defaults = {}

  /**
   * Returns a copy of the model's `attributes` object. Use this method to get the current entire
   * server data representation.
   *
   * @return {object} model attributes
   */
  toJSON() {
    return {...this.attributes};
  }

  /**
   * Proxies the `sync` module by default, but this can be overridden for custom behavior.
   */
  sync(...args) {
    return sync.call(this, ...args);
  }

  /**
   * Gets the value of an attribute.
   *
   * @param {string} attr - attribute key
   * @return {any} data attribute at that key
   */
  get(attr) {
    return this.attributes[attr];
  }

  /**
   * Gets the value of multiple attributes.
   *
   * @param {string[]} attrs - attribute keys for which to get values
   * @return {object} subsection of model data containing the specified keys
   */
  pick(...attrs) {
    return attrs.reduce((memo, attr) => Object.assign(
      memo,
      this.has(attr) ? {[attr]: this.get(attr)} : {}
    ), {});
  }

  /**
   * Returns true if there is a defined value at a given attribute key.
   *
   * @param {string} attr - attribute key
   * @return {boolean} whether the model has a value at that key
   */
  has(attr) {
    return ![undefined, null].includes(this.get(attr));
  }

  /**
   * This is how we change attribute values on a model. When we call .save(), this happens before
   * the request fires, and when we call .fetch(), this happens after the request returns. Unless
   * called with a {silent: true} flag, this will trigger an update for all subscribed components
   * to reflect the new changes.
   *
   * @param {object} attrs - key-value map of new attributes to set on the model
   * @param {object} options - map including the following options:
   *   unset: {boolean} whether to delete the given attributes keys from the model
   *          instead of set them
   *   silent: {boolean} if true, skips the triggerUpdate() call after setting the attributes
   * @return {Model} model instance
   */
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
        this.collection._updateModelReference(this.id, prevId, this);
      }
    }

    return this;
  }

  /**
   * Removes a model's attribute at a given key.
   *
   * @param {string} attr - attribute key
   * @param {object} options - set options
   * @return {Model} model instance
   */
  unset(attr, options) {
    return this.set({attr: undefined}, {unset: true, ...options});
  }

  /**
   * Removes all attributes for a model.
   *
   * @param {object} options - set options
   * @return {Model} model instance
   */
  clear(options) {
    var attrs = {};

    for (let key of Object.keys(this.attributes)) {
      attrs[key] = undefined;
    }

    return this.set(attrs, {unset: true, ...options});
  }

  /**
   * Main method that preps a GET request at this model's url. This is the method the request module
   * uses to sync server data after instantiating a model. Upon returning, an update is triggered
   * for all registered components.
   *
   * @param {object} options - can include any property used by the sync module
   * @return {promise} - resolves with a tuple of the instance and response object
   */
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

  /**
   * Whereas fetching data is handled declaratively by resourcerer, creates and updates occur
   * imperatively in your app via model.save(). It first sets the new properties on the model,
   * triggering an update (unless {wait: true} is passed). Then it preps a sync write request.
   *
   * @param {object} attrs - new attributes to set on the model and send as a POST/PUT/PATCH body.
   *   if null then the current model attributes are used.
   * @param {object} options - can include any property used by the sync module. pass {wait: true}
   *   to wait to set properties on the model until after the save request succeeds
   * @return {promise} - resolves with a tuple of the instance and response object
   */
  save(attrs, options) {
    var previousAttributes = this.toJSON();

    options = {parse: true, ...options};
    attrs = attrs || this.toJSON();

    // If we're not waiting and attributes exist, save acts as `set(attr).save(null, opts)`
    if (!options.wait) {
      this.set(attrs, options);
    } else {
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

          // avoid triggering any updates in the set call since we'll do it immediately after
          this.set(serverAttrs, {silent: true, ...options});
          // sync update
          this.triggerUpdate();

          return [this, response];
        })
        .catch((response) => {
          if (!options.wait) {
            this.clear().set(previousAttributes, options);
          }

          return Promise.reject(response);
        });
  }

  /**
   * Method used to send a DELETE request to the server. If part of a collection, also removes the
   * model from the collection. Pass {wait: true} for that to happen (along with an update) after
   * the request returns.
   *
   * @param {object} options - can include any property used by the sync module. pass {wait: true}
   *   to wait to set properties on the model until after the request succeeds
   * @return {promise} - resolves with a tuple of the instance and response object
   */
  destroy(options={}) {
    var request = this.isNew() ?
      Promise.resolve() :
      this.sync(this, {method: 'DELETE', ...options});

    if (!options.wait) {
      this.triggerUpdate();
      this.collection?.remove(this, {silent: true});
    }

    return request.then(([json, response]) => {
      if (options.wait || !this.isNew()) {
        this.triggerUpdate();
        this.collection?.remove(this, {silent: true});
      }

      return [this, response];
    }).catch((response) => {
      if (!options.wait && !this.isNew()) {
        this.collection?.add(this);
      }

      return Promise.reject(response);
    });
  }

  /**
   * Default url method on a model. This should only be invoked if the model belongs to a collection
   * or has a urlRoot method, both of which this method uses to append the model's id. Otherwise,
   * for models outside of a collection, they should have their own overriding url method defined.
   *
   * @return {string} the url endpoint to request for this particular model instance
   */
  url() {
    var base = this.urlRoot?.() || this.collection.url?.() || urlError();

    if (this.isNew()) {
      return base;
    }

    return base.replace(/[^/]$/, '$&/') +
      window.encodeURIComponent(this.get(this.constructor.idAttribute));
  }

  /**
   * By default, parse() is the identity function. Override this if you need special business logic
   * to transform the server response into a different form for your application that will be set
   * as attributes on the model.
   *
   * @param {any} response - server response data
   * @param {object} options - options map
   * @return {object} data object transformed from the server response to be applied as the model's
   *   data attributes
   */
  parse(response, options) {
    return response;
  }

  /**
   * A model by default is considered new if it doesn't have an id property, which makes sense--it
   * hasn't been saved to the server yet. Practically, this can also be overridden to get desired
   * behavior, ie forcing a request to be POST instead of PUT or vice versa.
   *
   * @return {boolean}
   */
  isNew() {
    return !this.has(this.constructor.idAttribute);
  }
}

// mix in events to the model
Object.assign(Model.prototype, Events);
