import {noOp} from './utils';
import React from 'react';

/**
 * This module contains all the required setup for implementing withResources
 * within an application.
 */

/**
 * ResourceKeys {{string: string}}: an object that should contain a key for each
 *   model whose value is a string, ie: `USER: 'user'` for a userModel. The
 *   string becomes the prefix for all props related to this resource, for
 *   example, props.userModel and props.userLoadingState. These keys are passed
 *   as the second argument to the withResources function and are used to
 *   declaritively request a model for a component.
 */
export const ResourceKeys = {
  /**
   * @param {{string: string}} keys - resource keys to assign to the
   *   ResourceKeys configuration object
   */
  add(keys) {
    return Object.assign(this, keys);
  }
};

/**
 * ModelMap {{string: Schmackbone.Model|Schmackbone.Collection}}: an object that
 *   should link the key established in ResourceKeys to Model/Collection
 *   constructors, ie: `[ResourceKeys.USER]: UserModel`. Entries in ResourceKeys
 *   and ModelMap for a resource are required in to use a resource with
 *   withResources.
 */
export const ModelMap = {
  /**
   * @param {{string: Backbone.Model|Backbone.Collection}} models - an object of
   *   ResourceKeys as keys and Models as values
   */
  add(models) {
    return Object.assign(this, models);
  }
};

/**
 * UnfetchedResources {ResourceKeys[]}: a Set of ResourceKeys that, when
 *   declaratively requested, should not be fetched because they are known to
 *   have been provided by the response of a parent resource. For use with the
 *   `providesModels` static property on a Schmackbone Model.
 */
export const UnfetchedResources = new Set();

/**
 * ResourcesConfig {object}: A general config object for a limited amount of
 *   customization with the withResources library.
 */
export const ResourcesConfig = {
  /**
  * {number}: milliseconds to keep a resource in the cache after the last
  * registered component is unmounted. Default 2 minutes.
  */
  cacheGracePeriod: 120000,
  /**
  * {React.Element}: Component to display when a withResources ErrorBoundary
  * catches an error.
  */
  errorBoundaryChild: React.createElement(
    'div',
    {className: 'caught-error'},
    React.createElement('p', null, 'An error occurred.')
  ),
  /** {function}: Hook to send errors to a logging service. */
  log: noOp,
  /**
   * {string}: the name of the prop object that will contain url query
   * parameters. This object gets spread to flatten them as individual props
   * within a withResources client. default 'urlParams'.
   */
  queryParamsPropName: 'urlParams',
  /** {function}: Hook to send resource request times to a tracking service. */
  track: noOp,

  /**
   * @param {object} config - config object with config overrides to add to the
   *  ResourcesConfig configuration object
   */
  set(config) {
    return Object.assign(this, config);
  }
};
