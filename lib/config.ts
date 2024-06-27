import { noOp } from "./utils.js";
import Collection from "./collection";
import Model from "./model";
import React, { type ReactElement } from "react";
import { setRequestPrefilter } from "./sync.js";
import { ResourceKeysType } from "./types.js";

export interface ResourcererConfig {
  cacheGracePeriod: number;
  errorBoundaryChild: ReactElement;
  queryParamsPropName: string;
  stringify: (
    params: string | URLSearchParams | string[][] | Record<string, string>,
    options: Record<string, any>
  ) => string;
  track: (...args: any[]) => void;
  log: (...args: any[]) => void;
  prefilter: (options: Record<string, any>) => Record<string, any> | void;
  set: (config: Record<keyof ResourcererConfig, any>) => void;
}

interface ResourceKeysConfig {
  [key: string]: string;
}

export interface ModelMap {
  [key: string]: typeof Model | typeof Collection;
}

export const register = (models: ModelMap) => {
  Object.assign(
    ResourceKeys,
    Object.entries(models).reduce((memo, [modelKey]) => ({ [modelKey]: modelKey }), {})
  );
  Object.assign(ModelMap, models);
};

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
export const ResourceKeys: ResourceKeysConfig = {};

/**
 * ModelMap {{string: Model|Collection}}: an object that
 *   should link the key established in ResourceKeys to Model/Collection
 *   constructors, ie: `[ResourceKeys.USER]: UserModel`. Entries in ResourceKeys
 *   and ModelMap for a resource are required in to use a resource with
 *   withResources.
 */
export const ModelMap: ModelMap = {};

/**
 * UnfetchedResources {ResourceKeys[]}: a Set of ResourceKeys that, when
 *   declaratively requested, should not be fetched because they are known to
 *   have been provided by the response of a parent resource. For use with the
 *   `providesModels` static property on a Model.
 */
export const UnfetchedResources = new Set<ResourceKeysType>();

/**
 * ResourcesConfig {object}: A general config object for a limited amount of
 *   customization with the withResources library.
 */
export const ResourcesConfig: ResourcererConfig = {
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
    "div",
    { className: "caught-error" },
    React.createElement("p", null, "An error occurred.")
  ),
  /** {function}: Hook to send errors to a logging service. */
  log: noOp,
  /** {function}: Calls setRequestPrefilter */
  prefilter: noOp,
  /**
   * {string}: the name of the prop object that will contain url query
   * parameters. This object gets spread to flatten them as individual props
   * within a withResources client. default 'urlParams'. You can ignore this
   * if you flatten them yourselves.
   */
  queryParamsPropName: "urlParams",

  /**
   * Method that should be used to stringify GET requests. By default, this uses URLSearchParams,
   * but that won't handle complex values (arrays and objects). To add support for that, override
   * this method with any logic or stringify library you want.
   *
   * @param {object} params - request params
   * @param {object} options - request options map
   * @return {string} URL query parameter string
   */
  stringify(params, options) {
    return new URLSearchParams(params).toString();
  },

  /** {function}: Hook to send resource request times to a tracking service. */
  track: noOp,

  /**
   * @param {object} config - config object with config overrides to add to the
   *  ResourcesConfig configuration object
   */
  set(config) {
    if (config.prefilter) {
      setRequestPrefilter(config.prefilter);
    }

    return Object.assign(this, config);
  },
};