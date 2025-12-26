import Model from "./build/lib/model.js";
import Collection from "./build/lib/collection.js";
import { invalidate } from "./build/lib/model-cache.js";

export * from "./build/index.js";

type GetModelOptions<C> =
  C extends Model<infer A, infer O> ? [A, O]
  : C extends Collection<infer M, infer O> ? [M, O]
  : never;

declare module "resourcerer" {
  type WithModelSuffix<K extends string, C> =
    C extends Collection<any, any> ? `${K}Collection` : `${K}Model`;
  export type LoadingStates = "error" | "loading" | "loaded" | "pending";

  // empty interface for declaration merging - users extend this with their model definitions
  // @ts-ignore
  export interface ModelMap {}
  export type ResourceKeys = Extract<keyof ModelMap, string>;

  // Resource config for a specific resource key
  // K represents the ResourceKey, which can be either:
  // - The key itself (when the key IS a ResourceKey)
  // - The resourceKey field value (when using a custom key with resourceKey property)
  export type ResourceConfigObj<K extends ResourceKeys> = {
    data?: Partial<GetModelOptions<InstanceType<ModelMap[K]>>[0]>;
    dependsOn?: boolean;
    force?: boolean;
    lazy?: boolean;
    noncritical?: boolean;
    options?: { [key: string]: any };
    // ts is not happy with this but this will make our typings easier
    // @ts-ignore
    path?: Parameters<InstanceType<ModelMap[K]>["url"]>[0];
    params?: { [key: string]: any };
    prefetches?: { [key: string]: any }[];
    provides?: (
      model: InstanceType<ModelMap[K]>,
      props: Record<string, any>,
    ) => { [key: string]: any };
  };

  // Helper type to create a config object with resourceKey field
  // Used when the executor key is not a ResourceKey and needs a resourceKey property
  type ResourceConfigWithKey<RK extends ResourceKeys> = ResourceConfigObj<RK> & {
    resourceKey: RK;
  };

  // Helper to extract resourceKey from a config object
  // If the config has a resourceKey property, extract it
  // Otherwise, if the config is ResourceConfigObj<K>, K is the resourceKey
  type ExtractResourceKey<Config> =
    Config extends { resourceKey: infer RK } ?
      RK extends ResourceKeys ?
        RK
      : never
    : never;

  // Helper to get the resource key for a given key using the executor return type
  // If the key is a ResourceKeys, use it directly
  // Otherwise, extract the resourceKey from the config
  type GetResourceKey<K extends string, R extends Record<string, any>> =
    K extends ResourceKeys ? K
    : K extends keyof R ?
      R[K] extends infer Config ?
        Config extends undefined ?
          never
        : ExtractResourceKey<Config>
      : never
    : never;

  // Helper to get the model constructor type for a given key
  type GetModelConstructor<K extends string, R extends Record<string, any>> =
    GetResourceKey<K, R> extends keyof ModelMap ? ModelMap[GetResourceKey<K, R>] : never;

  // Helper to get the model instance type for a given key
  type GetModelType<K extends string, R extends Record<string, any>> =
    GetModelConstructor<K, R> extends new (...args: any[]) => infer ModelType ? ModelType : never;

  // Union type of all possible configs with resourceKey
  // TypeScript will narrow this discriminated union based on the literal resourceKey value
  // When you use resourceKey: "energySource", provides will be typed for energySourceModel
  type ConfigWithResourceKey = {
    [RK in ResourceKeys]: ResourceConfigWithKey<RK>;
  }[ResourceKeys];

  // ExecutorFunction with explicit resourceKey mapping
  // M maps executor keys to their resourceKeys (e.g., { gridEnergySource: "energySource" })
  // When a custom key is used with resourceKey property, TypeScript will narrow the provides type
  // based on the literal resourceKey value provided
  export type ExecutorFunction<
    T extends string,
    O = Record<string, never>,
    M extends Partial<Record<T, ResourceKeys>> = Partial<Record<T, ResourceKeys>>,
  > = (props: O) => {
    [Key in T]?: Key extends ResourceKeys ? ResourceConfigObj<Key>
    : Key extends keyof M ?
      M[Key] extends ResourceKeys ?
        ResourceConfigWithKey<M[Key]>
      : ConfigWithResourceKey
    : ConfigWithResourceKey;
  };

  export type UseResourcesResponse = {
    isLoading: boolean;
    hasErrored: boolean;
    hasLoaded: boolean;
    hasInitiallyLoaded: boolean;
    refetch: (keys: ResourceKeys | ResourceKeys[]) => void;
    invalidate: typeof invalidate;
    setResourceState(newState: { [key: string]: any }): void;
  };

  export function useResources<
    O extends Record<string, any>,
    F extends (props: O) => Record<string, any>,
    T extends string = Extract<keyof ReturnType<F>, string>,
    R extends ReturnType<F> = ReturnType<F>,
  >(
    getResources: F,
    _props: O,
  ): UseResourcesResponse & {
    [Key in T as GetResourceKey<Key, R> extends ResourceKeys ?
      GetModelType<Key, R> extends infer C ?
        C extends Collection<any, any> ?
          `${Key}Collection`
        : `${Key}Model`
      : `${Key}Model`
    : never]: GetModelType<Key, R>;
  } & {
    [Key in T as `${Key}LoadingState`]: LoadingStates;
  } & {
    [Key in T as `${Key}Status`]: number;
  };
}
