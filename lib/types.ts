import Model from "./model.js";
import { type ModelMap } from "./config.js";
import Collection from "./collection.js";

export type LoadingStates = "error" | "loading" | "loaded" | "pending";
export type Resource = [string, InternalResourceConfigObj];
export type Props = Record<string, any>;

export type ResourceKeys = Extract<keyof ModelMap, string>;

export type LoadingStateKey = `${string}LoadingState`;
export type LoadingStateObj = { [key: LoadingStateKey]: LoadingStates };

export type ResourceConfigObj = {
  data?: { [key: string]: any };
  dependsOn?: string[];
  force?: boolean;
  lazy?: boolean;
  modelKey?: ResourceKeys;
  noncritical?: boolean;
  options?: { [key: string]: any };
  path?: { [key: string]: any };
  params?: { [key: string]: any };
  prefetches?: { [key: string]: any }[];
  provides?: (model: Model | Collection, props: Record<string, any>) => { [key: string]: any };
};

export type InternalResourceConfigObj = ResourceConfigObj & {
  modelKey: ResourceKeys;
  prefetch?: boolean;
  refetch?: boolean;
};

export type ExecutorFunction = (props: {
  [key: string]: any;
}) => // return type either has a resource key as the object key or is just a string with a modelKey property
| Partial<Record<ResourceKeys, ResourceConfigObj>>
  | Partial<Record<string, ResourceConfigObj & { modelKey: ResourceKeys }>>;

export interface UseResourcesResponse {
  isLoading: boolean;
  hasErrored: boolean;
  hasLoaded: boolean;
  hasInitiallyLoaded: boolean;
  refetch: (keys: ResourceKeys[]) => void;
  invalidate: (keys: ResourceKeys[]) => void;
  setResourceState(newState: { [key: string]: any }): void;
  [key: `${string}LoadingState`]: LoadingStates;
  [key: `${string}Collection`]: Collection;
  [key: `${string}Model`]: Model;
  [key: `${string}Status`]: number;
}
