import {noOp} from './utils';
/* eslint-disable no-unused-vars */
import React from 'react';
/* eslint-enable no-unused-vars */

// TODO(noah): make actual maps
export const ResourceKeys = {};
export const ModelMap = {};
export const UnfetchedResources = new Set();
export const ResourcesConfig = {
  // keep models around for an extra two minutes after all
  // components using them have unmounted.
  cacheGracePeriod: 120000,
  errorBoundaryChild: (
    <div className='caught-error'>
      <p>An error occurred.</p>
    </div>
  ),
  log: noOp,
  track: noOp
};

export const addResourceKeys = (keys) => Object.assign(ResourceKeys, keys);
export const addModels = (getModels) =>
  Object.assign(ModelMap, typeof getModels === 'object' ? getModels : getModels(ResourceKeys));
export const addUnfetchedResources = (getUnfetchedKeys) =>
  (getUnfetchedKeys(ResourceKeys) || []).forEach((key) => UnfetchedResources.add(key));
export const setConfig = (config) => Object.assign(ResourcesConfig, config);
