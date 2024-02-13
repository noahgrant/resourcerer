// this will make CONST_CASE a camelCase but also leave camelCase alone
type Camelize<T extends string> = T extends `${infer A}_${infer B}` ?
  `${Lowercase<A>}${Camelize<Capitalize<B>>}` :
  T extends Uppercase<T> ?
    Capitalize<Lowercase<T>> :
    T extends `${infer A}${Uppercase<infer B>}` ?
      Lowercase<T> :
      T;

declare module 'resourcerer' {
  type SyncOptions = {
    attrs?: Record<string, any>;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    params?: Record<string, any>;
    url?: string;
    // they are free to add any other options they like
    [key: string]: any;
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

  declare class Model<T extends Record<string, any> = {[key: string]: any}> {
    constructor(attrs?: T, options?: Record<string, any> & SetOptions): Model;

    // TODO: need to reference idAttribute here
    id: T extends {id: string} ? string : string | undefined;

    get<K extends keyof T>(key: K): T[K];

    has(key: keyof T): boolean;

    clear(options?: SetOptions): Model<T>;

    unset(attr: keyof T, options?: SetOptions): Model<T>;

    parse(response: Record<string, any>): T;

    pick<K extends keyof T>(...attrs: K[]): Pick<T, K>;

    set(attrs: Partial<T>, options?: SetOptions): Model<T>;

    fetch(options?: {parse?: boolean} & SyncOptions & SetOptions): Promise<[Model<T>, Response]>;

    save(attrs: Partial<T>, options?: {wait?: boolean; patch?: boolean;} & SyncOptions & SetOptions):
      Promise<[Model<T>, Response]>;

    sync(model: Model<T>, options?: SyncOptions): Promise<[any, Response]>;

    destroy(options?: {wait?: boolean} & SyncOptions & SetOptions): Promise<[Model<T>, Response]>;

    isNew(): boolean;

    toJSON(): T;

    url(urlOptions?: Record<string, any>): string;

    urlRoot(urlOptions?: Record<string, any>): string;

    static cacheFields: Array<string | ((attrs: T) => Record<string, any>)>;

    static cacheTimeout: number;

    static idAttribute: string;

    static defaults: Partial<T> | (() => Partial<T>);

    static measure: boolean | (() => void);
  }

  type ModelArg<A> = Model<A> | Record<string, any>;

  declare class Collection<
    T extends Record<string, any> = {[key: string]: any},
    O extends Record<string, any> & {Model?: new () => Model;} & CSetOptions = {[key: string]: any}
  > {
    constructor(
      models?: ModelArg<T> | ModelArg<T>[],
      options?: O
    ): Collection<T>;

    length: number;

    add(models: ModelArg<T> | ModelArg<T>[], options?: CSetOptions): Collection<T>;

    remove(models: ModelArg<T> | ModelArg<T>[] | string | string[]): Collection<T>;

    set(models: ModelArg<T> | ModelArg<T>[], options?: CSetOptions): Collection<T>;

    reset(models: ModelArg<T>[], options?: CSetOptions): Collection<T>;

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

    pluck<K extends keyof T>(prop: K): T[K][];

    slice(start: number, end?: number): ModelArg<T>[];

    sync(collection: Collection<T>, options?: SyncOptions): Promise<[any, Response]>;

    parse(response: Record<string, any> | any[], options?: Record<string, any>): Array<T>;

    create(
      model: ModelArg<T>,
      options?: {wait?: boolean} & SyncOptions & CSetOptions
    ): Promise<[Model<T>, Response]>;

    fetch(options?: {parse?: boolean} & SyncOptions & CSetOptions): Promise<[Collection<T>, Response]>;

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

  // this will be filled out by users
  export interface ModelMap {}

  type ResourceKeys = {
    [key in keyof ModelMap]: key extends string ? Camelize<Uncapitalize<key>> : key
  }

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
    [key: `${string}Collection`]: Collection;
    [key: `${string}Model`]: Model;
  }

  declare function haveAllLoaded(loadingStates: LoadingTypes | LoadingTypes[]): boolean;
  declare function haveAnyErrored(loadingStates: LoadingTypes | LoadingTypes[]): boolean;
  declare function areAnyLoading(loadingStates: LoadingTypes | LoadingTypes[]): boolean;
  declare function areAnyPending(loadingStates: LoadingTypes | LoadingTypes[]): boolean;

  declare function sync(model: Model | Collection, options?: SyncOptions): Promise<[any, Response]>;

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
    provides?: {[key: string]: (model: Model | Collection) => any};
  };

  type ResourceValues = Extract<typeof ResourceKeys[keyof typeof ResourceKeys], string>;
  type InvertedResourceKeys = {[Key in keyof ResourceKeys as ResourceKeys[Key]]: Key};

  // TODO: how to only use those keys that were passed, not the whole resourcekeys obj
  export type ExecutorFunction = (
    ResourceKeys_: ResourceKeys,
    props: {[key: string]: any}
  ) => Partial<Record<ResourceValues, ResourceConfigObj>>;

  type WithModelSuffix<K, C> = C extends Collection ? `${K}Collection` : `${K}Model`;

  declare function useResources(
    getResources: ExecutorFunction,
    props: {[key: string]: any}
  ): UseResourcesResponse & {
    [Key in keyof Required<ReturnType<ExecutorFunction>> as
    WithModelSuffix<Key, InstanceType<ModelMap[InvertedResourceKeys[Key]]>>]:
      InstanceType<ModelMap[InvertedResourceKeys[Key]]>
  };

  type test = ReturnType<ExecutorFunction>;

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
  let ModelCache: ModelCache;
}
