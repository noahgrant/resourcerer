import {noOp} from './utils';

// TODO(noah): make actual maps
export const ResourceKeys = {};
export const ModelMap = {};
export const UnfetchedResources = new Set();
export const ResourcesConfig = {
  log: noOp,
  track: noOp
};

export const addResourceKeys = (keys) => Object.assign(ResourceKeys, keys);
export const addModels = (getModels) =>
  Object.assign(ModelMap, typeof getModels === 'object' ? getModels : getModels(ResourceKeys));
export const addUnfetchedResources = (getUnfetchedKeys) =>
  (getUnfetchedKeys(ResourceKeys) || []).forEach((key) => UnfetchedResources.add(key));
export const setConfig = (config) => Object.assign(ResourcesConfig, config);
