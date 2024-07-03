import Model from "./model.js";
import Collection from "./collection.js";

export type LoadingStates = "error" | "loading" | "loaded" | "pending";
export type Resource = [string, InternalResourceConfigObj];
export type Props = Record<string, any>;

// this will be filled out by users
export interface ModelMap {
  [key: string]: new <T extends Model | Collection>() => T;
}

export type ResourceKeys = Extract<keyof ModelMap, string>;

export type LoadingStateKey = `${string}LoadingState`;
export type LoadingStateObj = { [key: LoadingStateKey]: LoadingStates };
export type WithModelSuffix<K extends string, C> =
  C extends Collection ? `${K}Collection` : `${K}Model`;

export type ResourceConfigObj<T extends Model | Collection = Model> = {
  data?: { [key: string]: any };
  dependsOn?: boolean;
  force?: boolean;
  lazy?: boolean;
  modelKey?: ResourceKeys;
  noncritical?: boolean;
  options?: { [key: string]: any };
  path?: { [key: string]: any };
  params?: { [key: string]: any };
  prefetches?: { [key: string]: any }[];
  provides?: (model: T, props: Record<string, any>) => { [key: string]: any };
};

export type InternalResourceConfigObj<T extends Model | Collection = Model> =
  ResourceConfigObj<T> & {
    modelKey: ResourceKeys;
    prefetch?: boolean;
    refetch?: boolean;
  };

type ResponseObj = {
  [Key in Extract<keyof ModelMap, string>]?: ResourceConfigObj<InstanceType<ModelMap[Key]>>;
};

type AlternateResponseObj = {
  [Key in Extract<keyof ModelMap, string> as string]?: ResourceConfigObj<
    InstanceType<ModelMap[Key]>
  > & {
    modelKey: Key;
  };
};

// return type either has a resource key as the object key or is just a string with a modelKey property
export type ExecutorFunction = (props: Props) => ResponseObj | AlternateResponseObj;

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
} & {
  [Key in keyof Required<ReturnType<ExecutorFunction>> as WithModelSuffix<
    Key,
    InstanceType<ModelMap[Key]>
  >]: InstanceType<ModelMap[Key]>;
};
