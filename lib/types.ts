import Model from "./model.js";
import Collection from "./collection.js";

export type LoadingStates = "error" | "loading" | "loaded" | "pending";
export type Props = Record<string, any>;

// this will be filled out by users
export interface ModelMap {
  [key: string]: new (...args: any[]) => any;
}

export type ResourceKeys = Extract<keyof ModelMap, string>;
export type Resource<K extends ResourceKeys> = [K, InternalResourceConfigObj<K>];

export type LoadingStateKey = `${string}LoadingState`;
export type LoadingStateObj = { [key: LoadingStateKey]: LoadingStates };
export type WithModelSuffix<K extends string, C> =
  C extends Collection<any, any> ? `${K}Collection` : `${K}Model`;

export type ResourceConfigObj<K extends ResourceKeys> = {
  data?: { [key: string]: any };
  dependsOn?: boolean;
  force?: boolean;
  lazy?: boolean;
  noncritical?: boolean;
  options?: { [key: string]: any };
  path?: { [key: string]: any };
  params?: { [key: string]: any };
  prefetches?: { [key: string]: any }[];
  provides?: (
    model: InstanceType<ModelMap[K]>,
    props: Record<string, any>
  ) => { [key: string]: any };
};

export type InternalResourceConfigObj<K> = ResourceConfigObj<K> & {
  resourceKey: K;
  prefetch?: boolean;
  refetch?: boolean;
};

/*
export type ExecutorFunction<T extends ResourceKeys> = (props: { [key: string]: any }) => {
  [Key in T | string]: Key extends T ? ResourceConfigObj : ResourceConfigObj & { resourceKey: T };
};
*/
export type ExecutorFunction<
  T extends ResourceKeys = ResourceKeys,
  O extends { [key: string]: any } = any,
> = (props: O) => {
  [Key in T]?: ResourceConfigObj<Key>;
};

export type UseResourcesResponse = {
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
};
