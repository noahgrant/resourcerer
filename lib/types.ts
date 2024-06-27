import Model from "./model";
import { type ModelMap } from "./config";
import Collection from "./collection";

export type LoadingStates = "error" | "loading" | "loaded" | "pending";
export type Resource = [string, InternalResourceConfigObj];
export type Props = Record<string, any>;

// this will make CONST_CASE a camelCase but also leave camelCase alone
type Camelize<T extends string> =
  T extends `${infer A}_${infer B}` ? `${Lowercase<A>}${Camelize<Capitalize<B>>}`
  : T extends Uppercase<T> ? Capitalize<Lowercase<T>>
  : T extends `${infer A}${Uppercase<infer B>}` ? Lowercase<T>
  : T;

export type ResourceKeysType = Camelize<Extract<keyof ModelMap, string>>;

export type LoadingStateKey = `${string}LoadingState`;
export type LoadingStateObj = { [key: LoadingStateKey]: LoadingStates };

export type ResourceConfigObj = {
  data?: { [key: string]: any };
  dependsOn?: string[];
  force?: boolean;
  lazy?: boolean;
  modelKey?: ResourceKeysType;
  noncritical?: boolean;
  options?: { [key: string]: any };
  params?: { [key: string]: any };
  prefetches?: { [key: string]: any }[];
  provides?: { [key: string]: (model: Model | Collection, props: Record<string, any>) => any };
};

export type InternalResourceConfigObj = ResourceConfigObj & {
  modelKey: ResourceKeysType;
  prefetch?: boolean;
  refetch?: boolean;
};

export type ExecutorFunction = (
  ResourceKeys: { [key: string]: ResourceKeysType },
  props: { [key: string]: any }
  // return type either has a resource key as the object key or is just a string with a modelKey property
) =>
  | Partial<Record<ResourceKeysType, ResourceConfigObj>>
  | Partial<Record<string, ResourceConfigObj & { modelKey: ResourceKeysType }>>;
