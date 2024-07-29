import Model from "./build/lib/model.js";
import Collection from "./build/lib/collection.js";

export * from "./build/index.js";

type GetModelOptions<C> =
  C extends Model<infer A, infer O> ? [A, O]
  : C extends Collection<infer M, infer O> ? [M, O]
  : never;

declare module "resourcerer" {
  type WithModelSuffix<K extends ResourceKeys, C> =
    C extends Collection<any, any> ? `${K}Collection` : `${K}Model`;
  export type LoadingStates = "error" | "loading" | "loaded" | "pending";
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
      props: Record<string, any>
    ) => { [key: string]: any };
  };

  export interface ModelMap {}
  export type ResourceKeys = Extract<keyof ModelMap, string>;

  export type ExecutorFunction<T extends ResourceKeys, O = Record<string, never>> = (props: O) => {
    [Key in T]?: ResourceConfigObj<Key>;
  };

  export type UseResourcesResponse = {
    isLoading: boolean;
    hasErrored: boolean;
    hasLoaded: boolean;
    hasInitiallyLoaded: boolean;
    refetch: (keys: ResourceKeys | ResourceKeys[]) => void;
    invalidate: (keys: ResourceKeys | ResourceKeys[]) => void;
    setResourceState(newState: { [key: string]: any }): void;
    [key: `${string}LoadingState`]: LoadingStates;
    [key: `${string}Status`]: number;
  };

  export function useResources<T extends ResourceKeys, O extends Record<string, any>>(
    getResources: ExecutorFunction<T, O>,
    _props: O
  ): UseResourcesResponse & {
    [Key in T as WithModelSuffix<Key, InstanceType<ModelMap[Key]>>]: InstanceType<ModelMap[Key]>;
  };
}
