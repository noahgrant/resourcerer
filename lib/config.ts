import { noOp } from "./utils.js";
import React, { type ReactElement } from "react";
import { type SyncOptions, setRequestPrefilter } from "./sync.js";
import { ResourceConfigObj, type ModelMap as _ModelMap } from "./types.js";

export interface ResourcererConfig {
  cacheGracePeriod: number;
  errorBoundaryChild: ReactElement;
  stringify: (
    params: string | URLSearchParams | string[][] | Record<string, string>,
    options: Record<string, any>
  ) => string;
  track: (...args: any[]) => void;
  log: (...args: any[]) => void;
  prefilter: (options: SyncOptions) => SyncOptions | void;
  set: (config: Partial<ResourcererConfig>) => void;
}

export const register = (models: _ModelMap) => {
  Object.assign(ModelMap, models);
};

/**
 * This module contains all the required setup for implementing withResources
 * within an application.
 */

/**
 * ModelMap: Record<ResourceKeys, Model | Collection>. This will be set in user-land.
 */
export const ModelMap: _ModelMap = {};

/**
 * ResourcerConfig: A general config object for a limited amount of customization with the resourcerer library.
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
   * Method that should be used to stringify GET requests. By default, this uses URLSearchParams,
   * but that won't handle complex values (arrays and objects). To add support for that, override
   * this method with any logic or stringify library you want.
   */
  stringify(params, options) {
    return new URLSearchParams(params).toString();
  },

  /** {function}: Hook to send resource request times to a tracking service. */
  track: noOp,

  /**
   * @param {ResourcerConfig} config - config object with config overrides to add to the
   *  ResourcesConfig configuration object
   */
  set(config) {
    if (config.prefilter) {
      setRequestPrefilter(config.prefilter);
    }

    return Object.assign(this, config);
  },
};
