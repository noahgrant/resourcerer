// TODO(noah): make actual maps
export const ResourceKeys = {};
export const ModelMap = {};
export const UnfetchedResources = new Set();

export const addResourceKeys = (keys) => Object.assign(ResourceKeys, keys);
export const addModels = (getModels) => Object.assign(ModelMap, getModels(ResourceKeys));
export const addUnfetchedResources = (getUnfetchedKeys) =>
  (getUnfetchedKeys(ResourceKeys) || []).forEach((key) => UnfetchedResources.add(key));
