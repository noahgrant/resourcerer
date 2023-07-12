declare module 'resourcerer' {
  type SyncOptions = {
    attrs?: Record<string, any>;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    params?: Record<string, any>;
    url?: string;
  };

  type SetOptions = {
    silent?: boolean;
    unset?: boolean;
  };

  // for collection.set
  type CSetOptions = {
    parse?: boolean;
    silent?: boolean;
  };

  // this will be filled out by users
  interface ResourceKeys {}

  declare class Model<T extends Record<string, any> = {[key: string]: any}> {
    constructor(attrs?: Record<string, any>, options?: Record<string, any> & SetOptions): Model;

    // TODO: need to reference idAttribute here
    id: T extends {id: string} ? string : string | undefined;

    get<K extends keyof T>(key: K): T[K];

    has(key: keyof T): boolean;

    clear(options?: SetOptions): Model;

    unset(attr: keyof T, options?: SetOptions): Model;

    parse(response: Record<string, any>): T;

    pick<K extends keyof T>(...attrs: K[]): Record<K, T[K]>;

    set(attrs: Record<string, any>, options?: SetOptions): Model;

    fetch(options?: {parse?: boolean} & SyncOptions & SetOptions): Promise<[Model, Response]>;

    save(attrs: Record<string, any>, options?: {wait?: boolean} & SyncOptions & SetOptions):
      Promise<[Model, Response]>;

    destroy(options?: {wait?: boolean} & SyncOptions & SetOptions): Promise<[Model, Response]>;

    isNew(): boolean;

    toJSON(): T;

    url(): string;

    urlRoot(): string;

    static cacheFields: Array<string | ((attrs: T) => Record<string, any>)>;

    static cacheTimeout: number;

    static idAttribute: string;

    static defaults: Record<keyof T, any> | (() => Record<keyof T, any>);

    static measure: boolean | (() => void);
  }

  type ModelArg<A> = Model<A> | Record<string, any>;

  declare class Collection<
    T extends Record<string, any> = {[key: string]: any},
    O extends Record<string, any> & CSetOptions = {[key: string]: any}
  > {
    constructor(
      models?: ModelArg<T> | ModelArg<T>[],
      options?: O
    ): Collection;

    length: number;

    add(models: ModelArg<T> | ModelArg<T>[], options: CSetOptions): Collection;

    remove(models: ModelArg<T> | ModelArg<T>[]): Collection;

    set(models: ModelArg<T> | ModelArg<T>[], options: CSetOptions): Collection;

    reset(models: ModelArg<T>[], options: CSetOptions): Collection;

    get(id?: string | ModelArg<T>): Model<T> | undefined;

    has(id?: string | ModelArg<T>): boolean;

    at(index: number): Model<T> | undefined;

    toJSON(): T[];

    sort(): Collection;

    map<R = any>(predicate: (model: Model<T>) => R): R[];

    find(predicate: (model: Model<T>) => boolean): Model<T>;

    filter(predicate: (model: Model<T>) => boolean): Model<T>[];

    findWhere<K extends keyof T>(attrs: Record<K, T[K]>): Model<T>;

    where<K extends keyof T, B extends boolean = false>(attrs: Record<K, T[K]>, find?: B):
      B extends true ?
        Model<T> :
        Model<T>[];

    pluck<K extends keyof T>(prop: K): Record<K, T[K]>[];

    slice(start: number, end?: number): ModelArg<T>[];

    parse(response: Record<string, any> | any[], options?: Record<string, any>): Array<T>;

    create(
      model: ModelArg<T>,
      options?: {wait?: boolean} & SyncOptions & CSetOptions
    ): Promise<[Collection, Response]>;

    fetch(options?: {parse?: boolean} & SyncOptions & CSetOptions): Promise<[Collection, Response]>;

    url(urlOptions?: O): string;

    static cacheFields: Array<string | ((attrs: T) => Record<string, any>)>;

    static modelIdAttribute: string;

    static measure: boolean | (() => void);

    static cacheTimeout: number;

    static comparator: string |
      ((arg: Model<T>) => number | string) |
      ((arg1: Model<T>, arg2: Model<T>) => number);
  }

  type LoadingTypes = 'loading' | 'loaded' | 'errored' | 'pending';

  export interface ModelMap {
    [key: keyof ResourceKeys]: (new () => Model) | (new () => Collection);
  }

  type test = keyof ResourceKeys;

  type ModelProperty<Str extends string> = {[key: `${Str}Model`]: Model};
  type CollectionProperty<Str extends string> = {[key: `${Str}Collection`]: Collection};

  interface UseResourcesResponse {
    isLoading: boolean;
    hasErrored: boolean;
    hasLoaded: boolean;
    hasInitiallyLoaded: boolean;
    refetch: (fn: (keys: {[key: string]: ResourceKeys}) => ResourceKeys[]) => void;
    setResourceState(newState: {[key: string]: any}): void;
    isOrWillBeLoading(): boolean;
    [key: `${string}LoadingState`]: LoadingTypes;
  }

  declare function haveAllLoaded(loadingStates: LoadingTypes | LoadingTypes[]): boolean;
  declare function haveAnyErrored(loadingStates: LoadingTypes | LoadingTypes[]): boolean;
  declare function areAnyLoading(loadingStates: LoadingTypes | LoadingTypes[]): boolean;
  declare function areAnyPending(loadingStates: LoadingTypes | LoadingTypes[]): boolean;

  type ResourceConfigObj = {
    data?: {[key: string]: any};
    dependsOn?: string[];
    force?: boolean;
    lazy?: boolean;
    modelKey?: ResourceKeys;
    noncritical?: boolean;
    options?: {[key: string]: any};
    params?: {[key: string]: any};
    prefetches?: {[key: string]: any}[];
    provides?: (model: Model | Collection) => {[key: string]: any};
  };

  // TODO: how to only use those keys that were passed, not the whole resourcekeys obj
  export type ExecutorFunction<K = ResourceKeys> = (
    ResourceKeys_: ResourceKeys,
    props: {[key: string]: any}
  ) => {[key: K]: ResourceConfigObj}

  type WithModelSuffix<K, C> = C extends Collection ? `${K}Collection` : `${K}Model`;

  declare function useResources<K = ResourceKeys>(
    getResources: ExecutorFunction<K>,
    props: {[key: string]: any}
  ): UseResourcesResponse & {
    [Key in keyof K as WithModelSuffix<K[Key], InstanceType<ModelMap[Key]>>]: InstanceType<ModelMap[Key]>
  };

  export interface ModelCache {
    get(key: string): Model | Collection | undefined;
    put(key: string, model: Model | Collection, component: any): void;
    register(key: string, component: any): void;
    unregister(component: any, ...keys: string[]): void;
    remove(key: string): void;
    __removeAll__(): void;
  }

  interface TrackOptions {
    Resource: string;
    params: {[key: string]: any};
    options: {[key: string]: any};
    duration: number;
  }

  interface RequestPrefilter {
    // TODO
    error: (...args: any[]) => any;
    headers: {[key: string]: string};
  }

  type ResourcerConfigOptions = {
    cacheGracePeriod?: number;
    errorBoundaryChild?: any;
    log?: (err: Error) => void;
    queryParamsPropName?: string;
    stringify?: (params: {[key: string]: any}, options: {[key: string]: any}) => string;
    track?: (name: string, options: TrackOptions) => void;
    prefilter?: (options: {[key: string]: any}) => RequestPrefilter;
  };

  let ResourceKeys: ResourceKeys & {add(keys: Partial<ResourceKeys>): void;};
  let ResourcesConfig: ResourcerConfigOptions & {set: (options: ResourcerConfigOptions) => void;};
  let ModelMap: ModelMap & {add(keys: ModelMap): void;};
}
