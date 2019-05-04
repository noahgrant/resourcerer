import {noOp} from './utils';
import React from 'react';

export const ResourceKeys = {};
export const ModelMap = {};
export const UnfetchedResources = new Set();
export const ResourcesConfig = {
  // keep models around for an extra two minutes after all
  // components using them have unmounted.
  cacheGracePeriod: 120000,
  // use vanilla js instead of jsx here to avoid issues keeping this a .js file
  errorBoundaryChild: React.createElement(
    'div',
    {className: 'caught-error'},
    React.createElement('p', null, 'An error occurred.')
  ),
  log: noOp,
  queryParamsPropName: 'urlParams',
  track: noOp
};

export const addResourceKeys = (keys) => Object.assign(ResourceKeys, keys);
export const addModels = (getModels) =>
  Object.assign(ModelMap, typeof getModels === 'object' ? getModels : getModels(ResourceKeys));
export const addUnfetchedResources = (getUnfetchedKeys) =>
  (getUnfetchedKeys(ResourceKeys) || []).forEach((key) => UnfetchedResources.add(key));
export const setConfig = (config) => Object.assign(ResourcesConfig, config);
