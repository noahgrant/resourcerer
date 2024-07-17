import Collection from "./build/lib/collection.js";

export * from "./build/index.js";

declare module "resourcerer" {
  type WithModelSuffix<K extends ResourceKeys, C> =
    C extends Collection ? `${K}Collection` : `${K}Model`;
  export type LoadingStates = "error" | "loading" | "loaded" | "pending";
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

  export interface ModelMap {}
  export type ResourceKeys = Extract<keyof ModelMap, string>;

  export type ExecutorFunction<T extends ResourceKeys, O = any> = (props: O) => {
    [Key in T]?: ResourceConfigObj<Key>;
  };

  /**
   * Figure this out for the case where we accept random strings.
  export type ExecutorFunction<T extends ResourceKeys | string> = (props: {
    [key: string]: any;
  }) => {
    [Key in T]: Key extends ResourceKeys ? ResourceConfigObj<Key>
    : ResourceConfigObj & { modelKey: ResourceKeys };
  };
    */

  export type UseResourcesResponse = {
    isLoading: boolean;
    hasErrored: boolean;
    hasLoaded: boolean;
    hasInitiallyLoaded: boolean;
    refetch: (keys: ResourceKeys[]) => void;
    invalidate: (keys: ResourceKeys[]) => void;
    setResourceState(newState: { [key: string]: any }): void;
    [key: `${string}LoadingState`]: LoadingStates;
    [key: `${string}Status`]: number;
  };

  export function useResources<T extends ResourceKeys, O extends Record<string, any>>(
    // TODO: how to pass O to ExecutorFn
    getResources: ExecutorFunction<T, O>,
    _props: O
  ): UseResourcesResponse & {
    [Key in T as WithModelSuffix<Key, InstanceType<ModelMap[Key]>>]: InstanceType<ModelMap[Key]>;
  };
}
