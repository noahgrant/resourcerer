import { hasErrored, hasLoaded, isLoading, pick } from "./utils.js";
import { ModelMap, ResourcesConfig } from "./config.js";
import React, {
  type ComponentClass,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import Collection from "./collection.js";
import ErrorBoundary from "./error-boundary.js";
import Model from "./model.js";
import ModelCache, { invalidate } from "./model-cache.js";
import ReactDOM from "react-dom";
import request from "./request.js";
import type {
  ExecutorFunction,
  LoadingStates,
  LoadingStateObj,
  Resource,
  Props,
  ResourceConfigObj,
  InternalResourceConfigObj,
  ResourceKeys,
  LoadingStateKey,
  UseResourcesResponse,
  WithModelSuffix,
} from "./types.js";

type ModelInstanceType = Model | Collection;
type ConstructorTypes = typeof Model | typeof Collection;
type ModelState = Record<string, ModelInstanceType>;

/**
 * The useResources hook handles several different data-related things for a component
 * automatically:
 *
 *   1. it fetches a component's resources after mounting
 *   2. it binds listeners to all resources
 *   3. it handles whether or not the critical resources for a component have loaded
 *   4. it re-fetches a new resource when specified props have changed
 *   5. it handles resource cache naming for the ModelCache
 *
 * getResources is a function that takes props as an argument and should return
 * a map of resources. Each resource map key is the name of the resource (which
 * should be a ResourceKeys entry that also has an entry in ModelMap, but can be a
 * custom name if passed a resourceKey config property), and each map value is a
 * config object that may contain any of the following properties:
 *
 *   * noncritical {boolean} - whether the resource should not be taken into
 *        account when determining the loading state of the component. default
 *        is false
 *   * params {object} - query params for the fetch call passed to the `request`
 *   * path {object} - params passed to the `url` function
 *   * options {object} - generic options object passed to the model constructor
 *   * dependsOn {string[]} - prop fields required to be present before the
 *        resource will fetch
 *   * provides {(model, props) => Record<string, any>} - list of props that a resource
 *        provides, for example, for dependent resources (serial requests). Each
 *        key in the return object is set as state
 *   * force {boolean} - force a fetch request on mount regardless of whether the
 *        model is already in the cache
 *   * prefetch {object} - an individual map of expected future props to fetch
 *        a new resource and store it in the cache. it will not, however, get
 *        passed down to the child (no loading states, either)
 *   * prefetches {object[]} - a list of objects whose properties represent the
 *        expected future values of props. these get turned into new cache keys
 *        and new requests.
 *   * resourceKey {ResourceKeys} - use this when adding a custom name for the resource,
 *        so the props use the custom name, but the correct resource type is
 *        fetched and cached
 *   * ...any other option that can be passed directly to the `request` function
 */
export function useResources<T extends ResourceKeys, O extends Record<string, any>>(
  getResources: (props: O) => {
    [Key in T]?: ResourceConfigObj;
  },
  _props: O,
): UseResourcesResponse & {
  [Key in T as WithModelSuffix<Key, InstanceType<(typeof ModelMap)[Key]>>]: InstanceType<
    (typeof ModelMap)[Key]
  >;
} & {
  [Key in T as `${T}LoadingState`]: LoadingStates;
} & {
  [Key in T as `${T}Status`]: number;
} {
  const [resourceState, setResourceState] = useState<Record<string, any>>({});
  const props = { ..._props, ...resourceState };
  const resources = generateResources(getResources, props);
  const initialLoadingStates = buildResourcesLoadingState(resources.filter(withoutPrefetch), props);

  // set initial loading states and create loaderDispatch for maintaining them
  const [{ loadingStates, requestStatuses, hasInitiallyLoaded }, loaderDispatch] = useReducer(
    loaderReducer,
    {
      loadingStates: initialLoadingStates,
      requestStatuses: {},
      hasInitiallyLoaded: hasLoaded(getCriticalLoadingStates(initialLoadingStates, resources)),
    },
  );
  const criticalLoadingStates = getCriticalLoadingStates(loadingStates, resources);
  // we need to save our models as state using hooks because we can't defer
  // reading from the model cache with updated props, and so we'd _always_
  // show an empty model as a resource is being requested instead of
  // continuing to show the previous model. on the plus side, setting them
  // as state means we won't need a loading overlay component to do this for us
  const [models, setModels] = useState<ModelState>(() => {
    const result = modelAggregator(resources.filter(withoutPrefetch));

    return typeof result === "function" ? result({}) : result;
  });
  const isMountedRef = useIsMounted();
  // this is used as an identifier to this component instance to register
  // with the ModelCache. it should be constant across renders, sow keep it in a ref.
  const componentRef = useRef({});
  // this reference to previous props allows us to know when resources are changing
  // important: starts undefined so that getResourcesToUpdate marks all initial resources as to-update
  const prevPropsRef = useRef<Record<string, any>>();
  // this might look confusing but is important. we need to know, before
  // setting any loaded or error states, that a returned resource belongs
  // to the most recent component props. so we use a ref to persist across the closure
  const currentPropsRef = useRef(props);
  // stash reference to all models with listeners currently attached, since when we return
  // from any updated requests there's no guarantee that the most recent models were a
  // function of the previous props (as opposed to props from two renders ago, for example).
  // an edge case may be seen with resources that become pending or go from pending across
  // renders. using this reference will guarantee that we always remove listeners from the
  // correct models before attaching new listeners
  const listenedModelsRef = useRef<ModelInstanceType[]>([]);
  // when props change and we have models ready in the cache, we set model state in the render
  // process. that means we re-run this function without calling any useEffect callbacks. since
  // prevProps will not (and should not) have changed, the same models that we're to be updated
  // as state in the first render phase would also be up for update in the next one. so we have
  // to keep track of which models have been updated in state, and then we'll reset this when
  // useEffect is finally called.
  const cachedModelsSinceLastEffect = useRef<{ [key: ResourceKeys]: boolean }>({});
  const refetchedModelsSinceLastEffect = useRef<{ [key: string]: boolean }>({});
  const forceUpdate = useForceUpdate();

  // note that this only tells when cache keys have changed. if a resource has already been
  // cached, this will still return its resource when the component mounts. that's why we
  // partition these out later into loaded and not loaded resources.
  //
  // for a similar reason, forced resources get returned here on mount and not afterwards.
  // we prevent them from getting set to a LOADED state which forces them to get fetched.
  const getResourcesToUpdate = () =>
    resources
      .filter(hasAllDependencies)
      .filter(not(shouldBypassFetch.bind(null, props)))
      .filter(([name, config]: Resource) => {
        const prevConfig =
          prevPropsRef.current && findConfig([name, config], getResources, prevPropsRef.current);
        const previousCacheKey = prevConfig && getCacheKey(prevConfig);

        return (
          !previousCacheKey ||
          previousCacheKey !== getCacheKey(config) ||
          // if the model does not currently exist in state, then this is newly added. in this case,
          // the previousCacheKey can still be equal to the currentCacheKey if it has been added via
          // a side effect (ie, not from props changing). this handles that case.
          !models[getResourcePropertyName(name, config.resourceKey)] ||
          !hasAllDependencies(["", prevConfig]) ||
          // we only want to refetch if the resource is currently in a loaded state. but then
          // we'll move to a loading state and short-circuit the render cycle, and it won't be
          // loaded in the next cycle. that's why we use the ref, as well
          (config.refetch &&
            (hasLoaded(loadingStates[getResourceState(name)] as LoadingStates) ||
              refetchedModelsSinceLastEffect.current[name])) ||
          // make sure if we were lazy and are no longer lazy (from the same component) that we
          // get included in the list to get updated (and vice versa)
          prevConfig?.lazy !== config.lazy
        );
      });

  // every time we call this, we remove all previous listeners and attach new ones based on the
  // current models used by the component.
  const attachModelListeners = () => {
    // only get those from the cache. models in state might can empty models, but even so i
    // think it would be preferable to use state (within a separate useEffect) to determine
    // which models get listened to. but as mentioned, that would require the effect to depend
    // on cache keys, which are dynamic, and effects can't have dynamic dependencies right now
    let listenedModels = resources
      .map(([, config]) => getModelFromCache(config))
      .filter(Boolean) as ModelInstanceType[];

    // remove previous listeners and attach new ones
    listenedModelsRef.current.forEach((model) => model.offUpdate(componentRef.current));
    listenedModels.forEach((model) => model.onUpdate(forceUpdate, componentRef.current));

    listenedModelsRef.current = listenedModels;
  };

  // this should be for NEW pending resources only, not ones set in initial loading state
  const pendingResources = resources
    .filter(not(hasAllDependencies))
    .filter(
      ([name, config]) =>
        prevPropsRef.current &&
        hasAllDependencies(["", findConfig([name, config], getResources, prevPropsRef.current)]),
    );
  const resourcesToUpdate = getResourcesToUpdate();
  const nextLoadingStates: LoadingStateObj = {
    ...buildResourcesLoadingState(pendingResources, props, "pending"),
    // but resourcesToUpdate should get set to LOADING (or LOADED if in the cache)
    ...buildResourcesLoadingState(
      // removing forced resources here ensures that they stay in a LOADING state and thus
      // get partitioned into resourcesToFetch. this only happens on mount; on update, they
      // don't ever get included in resourcesToUpdate
      resourcesToUpdate.filter(withoutPrefetch).filter(withoutForced),
      props,
    ),
  };
  // separate out those resources to update into those that are already cached and those
  // that need to be fetched. the former will get the models updated immediately
  const [loadedResources, resourcesToFetch] = partitionResources(
    resourcesToUpdate,
    nextLoadingStates,
  );
  // "cached" is a misnomer...
  const cachedResources = pendingResources
    .concat(loadedResources)
    .filter(([name]) => !cachedModelsSinceLastEffect.current[name]);

  // here we set any newly-pending resources as well as any already-loaded resources as model state,
  // short-circuiting the render cycle since this update happens in the render phase. this is a
  // critical piece of useResources because it means that models, dependent models, and also loading
  // states (next block of code) get updated immediately with no extra 'in-between' blips on the
  // screen.
  if (cachedResources.length) {
    setModels(modelAggregator(cachedResources));
    cachedResources.forEach(([name, config]) => {
      cachedModelsSinceLastEffect.current[name] = true;
    });

    // because we don't go through the request module for normal-flow resources that are cached,
    // we need to re-register this component with the resource. this will also clear any timeouts
    // for removing the resource.
    loadedResources.forEach(([, config]) => {
      const cacheKey = getCacheKey(config);
      const model = ModelCache.get(cacheKey);

      ModelCache.register(cacheKey, componentRef.current);
      // make sure we add any provided props for serial requests. when this function rerenders any
      // cached dependent models will also trigger a setModels call and an additional re-render
      // without a useEffect

      if (model) {
        provideProps(model, config.provides, props, setResourceState);
      }
    });

    // make sure if we bypass fetching because of cached models that we attach fresh listeners
    attachModelListeners();
  }

  // register any refetched items in the ref so that when we short-circuit the render we still
  // know which ones we need to fetch
  resourcesToFetch.forEach(([name, config]) => {
    if (config.refetch) {
      refetchedModelsSinceLastEffect.current[name] = true;
    }
  });

  // set our updated resources' loading states to LOADING. but don't set if we're already in a
  // loading state for that resource, because that's a pointless extra render. also, any resources
  // that have lost their dependencies should go back to a pending state.
  if (
    Object.keys(nextLoadingStates).some(
      (ky) => nextLoadingStates[ky as LoadingStateKey] !== loadingStates[ky as LoadingStateKey],
    )
  ) {
    loaderDispatch({ type: "loading", payload: nextLoadingStates });
  }

  /**
   * Fetch things.
   *
   * Note also that every time we set a state, whether it be loading states or models, we are
   * setting a new object as that state and we will re-render. That means that if a model is cached
   * or its loading states haven't changed we should _not_ just go ahead and call fetchResources,
   * because that will re-render our components an additional two times.
   */
  useEffect(() => {
    // NOTE: changing this to resourcesToFetch causes some inexplicable bugs around cached resources
    // and a UI that wouldn't update. so this is kept as resourcesToUpdate and fetchResources is
    // given resourcesToFetch. Because we are still only fetching resourcesToFetch and because any
    // loaded resources will have already had their models set above, and any loaded prefetched
    // models do not have loading or model states, this should have no practical effect
    if (resourcesToUpdate.length) {
      if (prevPropsRef.current) {
        resourcesToUpdate.forEach(([name, config]) => {
          const prevConfig = findConfig([name, config], getResources, prevPropsRef.current!),
            prevCacheKey = getCacheKey(prevConfig);
          const prevModel = ModelCache.get(prevCacheKey);

          // unregister component from previous models that are getting updated
          ModelCache.unregister(componentRef.current, prevCacheKey);

          // this is our re-caching: if we already have a new model in the cache that has now been
          // saved (and thus has a real cache key), move the model to the new cache key and remove
          // it from the old one. this will save an unnecessary request.
          if (prevModel && prevConfig.data && !prevConfig.data?.id && config.data?.id) {
            ModelCache.put(getCacheKey(config), prevModel);
            ModelCache.remove(prevCacheKey);
          }
        });
      }

      fetchResources(resourcesToFetch, props, {
        component: componentRef.current,
        isCurrentResource: ([name, config], cacheKey) =>
          isMountedRef.current &&
          !config.prefetch &&
          cacheKey === findCacheKey([name, config], getResources, currentPropsRef.current),
        setResourceState,
        onRequestSuccess: (model, status, [name, config]) => {
          // to batch these state updates into one, per this comment:
          // https://stackoverflow.com/questions/48563650/
          // does-react-keep-the-order-for-state-updates/48610973#48610973
          ReactDOM.unstable_batchedUpdates(() => {
            setModels(modelAggregator([[name, config]]));

            loaderDispatch({
              type: "loaded",
              payload: { name, status, resources },
            });
          });
        },
        onRequestFailure: (status, [name, config]) => {
          ReactDOM.unstable_batchedUpdates(() => {
            // request failed, which means this model should not be in the cache. but we still want
            // to set our model state so that when we go back into a loading state, the empty
            // model is present instead of any previously-loaded model
            setModels(modelAggregator([[name, config]]));

            loaderDispatch({
              type: "error",
              payload: { name, status },
            });
          });
        },
      }).then(() => {
        if (isMountedRef.current) {
          attachModelListeners();
        }
      });
    }

    prevPropsRef.current = props;
    // now we can reset these values
    cachedModelsSinceLastEffect.current = {};
    refetchedModelsSinceLastEffect.current = {};
  });

  // this effect attaches listeners to any bypassed models (ie, those passed in) which don't get
  // attached after a fetch call. additionally, the cleanup function unregisters the component from
  // all models and removes model listeners from all resources when unmounting
  useEffect(() => {
    const bypassedModels = resources
      .filter(shouldBypassFetch.bind(null, props))
      .map(([name, { resourceKey }]) => props[getResourcePropertyName(name, resourceKey)])
      .filter(Boolean);

    bypassedModels.forEach((model) => model.onUpdate(forceUpdate, componentRef.current));

    return () => {
      ModelCache.unregister(componentRef.current);
      // use _current_ props when getting the models here, because if any have changed over the
      // lifecycle of the component then they should have already had listeners removed. this only
      // removes listeners from the 'last' batch before unmounting
      resources
        .map(([, config]) => getModelFromCache(config))
        .filter(Boolean)
        .concat(bypassedModels)
        .forEach((model) => model?.offUpdate(componentRef.current));
    };
  }, []);

  currentPropsRef.current = props;

  // @ts-ignore
  return {
    ...models,

    ...resourceState,

    // this will only return any passed-in (bypassed) models so we can override
    ...pick(props, ...Object.keys(models)),

    refetch: (keys: ResourceKeys | ResourceKeys[]) => {
      ReactDOM.unstable_batchedUpdates(() => {
        keys = Array.isArray(keys) ? keys : [keys];

        keys.forEach((name) => {
          const model = getModelFromCache(findConfig([name, {}], getResources, props));

          /**
           * Set a refetching flag on the model and re-render. This will cause all components
           * that use this model to re-render and put it back in a loading state.
           */
          if (model) {
            model.refetching = true;
            model.triggerUpdate();
          }
        });
      });
    },

    invalidate,

    setResourceState,

    // here we include our model loading states, useful for noncritical resources
    ...loadingStates,
    ...requestStatuses,

    // these props represent our critical resource loading states
    hasErrored: hasErrored(criticalLoadingStates),
    hasLoaded: hasLoaded(criticalLoadingStates),
    isLoading: isLoading(criticalLoadingStates),
    /**
     * Whether our critical resources have been loaded a first time. Useful for showing
     * reflecting a different UI for subsequent requests
     */
    hasInitiallyLoaded,
  };
}

/**
 * HOC version of useResources, returning all of the same props otherwise returned by the hook. See
 * the comment above useResources for details on the getResources executor function, or check the
 * README.
 */
export const withResources =
  (getResources: ExecutorFunction) => (Component: ComponentClass<Record<string, any>>) =>
    function DataCarrier(props: Record<string, any>) {
      const resources = useResources(getResources, props);

      return React.createElement(ErrorBoundary, {
        children: React.createElement(Component, {
          ...props,
          ...resources,
        }),
      });
    };

/**
 * Helper method to flatten the hash of resources returned by the `getResources`
 * function into a single array of [name, config] entries. Resource values are
 * objects that may also contain a `prefetches` property containing a list of
 * additional `props` configurations used to prefetch that resource; those are
 * given a `prefetch` property set to those changed props. Finally, each
 * resource is given a `resourceKey` property equal to its ResourceKey name if not
 * passed in directly. `resourceKey` is then used for all things fetch- and cache-
 * related, while `name` is used for model, loading state, and status props. If
 * no `resourceKey` property is passed in, then it is identical to the resource's
 * `name`.
 */
function generateResources(getResources: ExecutorFunction, props: Record<string, any>): Resource[] {
  return Object.entries(getResources(props) || {}).reduce(
    (memo, [name, config = {}]) =>
      memo.concat(
        [
          [
            name,
            {
              resourceKey: config.resourceKey || name,
              refetch: !!getModelFromCache({ ...config, resourceKey: config.resourceKey || name })
                ?.refetching,
              ...config,
            },
          ] as Resource,
        ].concat(
          // expand prefetched resources with their own options based on
          // their prefetch props, and store those in the `prefetch` property
          (config.prefetches || []).map(
            (prefetch) =>
              [
                name,
                {
                  resourceKey: config.resourceKey || name,
                  ...getResources({ ...props, ...prefetch })[name],
                  prefetch: true,
                },
              ] as Resource,
          ),
        ),
      ),
    [] as Resource[],
  );
}

/**
 * @param {string} name - string name of the resource
 * @return {string} name of the loading state property
 */
function getResourceState<T extends string>(name: T): `${T}LoadingState` {
  return `${name}LoadingState`;
}

/**
 * @param {string} name - string name of the resource
 * @return {string} name of the status property
 */
function getResourceStatus(name: string) {
  return `${name}Status`;
}

/**
 * Formulates the name of the resource prop passed to the child component, ie
 * this.props.todosCollection and this.props.todoItemModel.
 *
 * @param {string} baseName - string name of the resource
 * @param {ResourceKeys} resourceKey - if the resource is not given a custom name,
 *   this is the same as `baseName`
 * @return {string} name of the resource prop passed to the child component
 */
function getResourcePropertyName(baseName: string, resourceKey: string) {
  const Constructor = ModelMap[resourceKey];

  return Constructor?.prototype instanceof Collection ?
      `${baseName}Collection`
    : `${baseName}Model`;
}

/**
 * When a resource is not found in the ModelCache, resourcerer returns a
 * default empty resource so that clients can assume the model is defined
 * without needing to be defensive. This method freezes an empty instance of
 * the model associated with the resourceKey and returns it.
 *
 * We seed the empty model with any attributes or models it intends on having
 * just in case this is a model given an `options.fetch` of `false`, in which
 * case we expect that the model should not have a loading state and should
 * appear as expected immediately.
 */
function getEmptyModel({ resourceKey, data, options, path }: InternalResourceConfigObj) {
  const Model_ = typeof ModelMap[resourceKey] === "function" ? ModelMap[resourceKey] : Model;
  // @ts-ignore
  const emptyInstance = new Model_(data, { ...options, ...path });

  // flag to differentiate between other model instances that happen to be empty
  (emptyInstance as ModelInstanceType).isEmptyModel = true;

  // ensure that no resourcerer client can modify empty model's data
  Object.freeze((emptyInstance as Model).attributes);
  Object.freeze((emptyInstance as Collection).models);

  return emptyInstance;
}

/**
 * Calculates a cache key for the resource depending on the base resource type
 * key and the truthy parameter values. Parameter values are calculated in via
 * the constructor's static `dependencies` array:
 *
 *   `dependencies` values are taken directly from the config object as opposed
 *   to props, in the following order: `path` object, `data` object,
 *   `params` object. Field keys are included in this method, which is why it is
 *   preferred. `dependencies` entries can be functions, too, which take the
 *   `params` object as a parameter and return a key/value object that gets
 *   flattened to a piece of the cache key.
 */
export function getCacheKey({
  resourceKey,
  params = {},
  path = {},
  data = {},
}: InternalResourceConfigObj) {
  const Constructor = ModelMap[resourceKey] as ConstructorTypes;
  const toKeyValString = ([key, val]: [string, any]) => (val ? `${key}=${val}` : ""),
    fields = (Constructor?.dependencies || [])
      .map((key) =>
        typeof key === "function" ?
          Object.entries(key(params)).map(toKeyValString).join("_")
        : toKeyValString([key, path[key] || data[key] || params[key]]),
      )
      .filter(Boolean);

  return `${resourceKey || ""}${fields.length ? `~${fields.sort().join("_")}` : ""}`;
}

/**
 * Finds the current config object given a set of props based on the resourceKey and whether it is a
 * prefetched resource
 */
function findConfig(
  [name, { prefetch }]: [string, { prefetch?: boolean }],
  getResources: ExecutorFunction,
  props: Props,
): InternalResourceConfigObj {
  const [, config = { resourceKey: "" }] =
    generateResources(getResources, props).find(
      ([_name, _config = {}]) =>
        name === _name &&
        // cheap deep equals
        JSON.stringify(_config.prefetch) === JSON.stringify(prefetch),
    ) || [];

  return config;
}

/**
 * Our cache key generation does not use props directly, which
 * makes comparing current/next resources more difficult (ie, we can't just
 * compare `getCacheKey(config, this.props)` and `getCacheKey(config, nextProps)`)
 * directly because `config` itself is determined from props. However,
 * disregarding prefetched resources, all resources on a component must be
 * unique by name (otherwise one would override the other in the
 * getResources() return value). So we can find the current cache key by
 * regenerating the config a given set of props and matching it with its name
 * and prefetch value.
 */
function findCacheKey(resource: Resource, getResources: ExecutorFunction, props: Props) {
  return getCacheKey(findConfig(resource, getResources, props)) || "";
}

/**
 * Builds an object of loading states for resources, so that, for example,
 * before a fetch or refetch, all resource states are changed to LOADING.
 * Resources with dependencies that are not all present are put into a
 * 'PENDING' state.
 *
 * `defaultState` is the state to return if resource already exists in cache;
 * in most circumstances, this should be the LOADED state as you might expect. However, when we
 * prep resources to be re-fetched, they should get put into a loading state. Because we use
 * render bailouts to immediately update our loading states, a cached resource that no longer has
 * its dependent props will go back to a PENDING state, but that could be just momentarily if the
 * dependent prop gets added in a bailout, triggering an immediate re-render phase with no
 * painting to screen. Lazy models should always be considered LOADED.
 */
function buildResourcesLoadingState(
  resources: Resource[],
  props: Props,
  defaultState: LoadingStates = "loaded",
): LoadingStateObj {
  return resources.reduce(
    (state, [name, config]) =>
      Object.assign(state, {
        [getResourceState(name)]:
          (
            !config.refetch &&
            !config.force &&
            (shouldBypassFetch(props, [name, config]) ||
              (getModelFromCache(config) && !getModelFromCache(config)?.lazy))
          ) ?
            defaultState
          : !hasAllDependencies(["", config]) ? "pending"
          : config.lazy ?
            // any lazy resource should be considered loaded in its resource state, even
            // though it will temporarily show up in the resourcesToUpdate list
            "loaded"
          : "loading",
      }),
    {},
  );
}

/**
 * Determines whether a resource's required props for fetching are all present.
 *
 * @param {object} props - current component props
 * @param {{dependsOn: string|object}} resource config entry
 * @return {boolean} whether or not all required props are present
 */
function hasAllDependencies([, config]: Resource) {
  return !("dependsOn" in config) || !!config.dependsOn;
}

/**
 * Convenience wrapper method for getting a model from the cache. Has the same
 * function signature as `getCacheKey`. ModelCache will return undefined if it
 * doesn't find a model at the given key.
 */
function getModelFromCache(...args: Parameters<typeof getCacheKey>) {
  return ModelCache.get(getCacheKey(...args));
}

/**
 * Filter predicate to remove prefetched resources from a resources list.
 */
function withoutPrefetch([, config]: Resource) {
  return !config.prefetch;
}

/**
 * Filter predicate to remove noncritical resources from a resources list.
 *
 * @param {[, object]} config - resources config entry
 * @return {boolean} true if a resource is critical
 */
function withoutNoncritical([, config]: Resource) {
  return !config.noncritical;
}

/**
 * Filter predicate to remove forced resources from a resources list.
 */
function withoutForced([, config]: Resource) {
  return !config.force;
}

/**
 * This method determines if props with the resource names have been passed to
 * the component directly, in which case we'll skip the fetching.
 */
function shouldBypassFetch(props: Props, [name, { resourceKey }]: Resource) {
  return !!(getResourcePropertyName(name, resourceKey) in props);
}

/**
 * Negates the return value of an input function
 */
function not(fn: (...args: any[]) => boolean) {
  return (...args: any[]) => !fn(...args);
}

/**
 * Hook to force a component update for a functional component by assigning a
 * new blank object reference every time.
 */
function useForceUpdate() {
  const [, forceUpdate] = useState({});

  return () => forceUpdate({});
}

/**
 * @return {ref} ref whose current value is a boolean, whether or not a
 *   component is currently mounted
 */
function useIsMounted() {
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}

/**
 * Measures the duration of the request and calls the `track` config method
 * before clearing the performance markers.
 */
function trackRequestTime(
  name: string,
  { params, path }: { params?: Record<string, any>; path?: Record<string, any> } = {},
) {
  const measurementName = `${name}Fetch`;
  let fetchEntry;

  // ensure that another resource request hasn't removed the perf mark
  if (window.performance.getEntriesByName(name).length) {
    window.performance.measure(measurementName, name);
    fetchEntry = window.performance.getEntriesByName(measurementName).pop();

    ResourcesConfig.track("API Fetch", {
      Resource: name,
      params,
      path,
      duration: Math.round(fetchEntry?.duration || 0),
    });

    window.performance.clearMarks(name);
    window.performance.clearMeasures(measurementName);
  }
}

/**
 * Dynamically gathers a list of loading states for the component's critical
 * resources so that we can pass down the correct values for the hasLoaded,
 * isLoading, and hasErrored props.
 */
function getCriticalLoadingStates(
  loadingStates: LoadingStateObj,
  resources: Resource[],
): LoadingStates[] {
  return resources
    .filter(withoutNoncritical)
    .filter(withoutPrefetch)
    .map(([name]) => loadingStates[getResourceState(name)])
    .filter((x) => x) as LoadingStates[];
}

/**
 * Helper method whose return function aggregates all models to be set as model
 * state in the useResources hook. Pulls model from the cache or assigns the
 * empty model if one does not exist. If no models have actually changed from
 * current state, we don't set a new object as state to avoid rerendering.
 */
function modelAggregator(resources: Resource[]): SetStateAction<ModelState> {
  const newModels = resources.reduce(
    (memo, [name, config]) =>
      Object.assign(memo, {
        [getResourcePropertyName(name, config.resourceKey)]:
          getModelFromCache(config) || getEmptyModel(config),
      }),
    {} as Record<string, ModelInstanceType>,
  );

  return (models = {}) =>
    (
      Object.keys(newModels).filter(
        // this comparison is so that if no models have changed, we don't change state and rerender.
        // this is only important when a model is cached when a component mounts, because it will still
        // be included in resourcesToUpdate even though its model will be seeded in state already
        (key) => models[key] !== newModels[key],
      ).length
    ) ?
      { ...models, ...newModels }
    : models;
}

/**
 * Separates out resources between those that are loading and those that have loaded. The latter
 * won't need to get passed to fetchResources, but the former will. Make sure that prefetched,
 * refetched, and lazy resources get added to those that are loading so that the request gets made.
 * Since prefetched models don't factor into loading states, there's no concern that they get passed
 * to fetchResources even if they have been cached.
 */
function partitionResources(
  resourcesToUpdate: Resource[],
  loadingStates: Record<string, LoadingStates>,
): [Resource[], Resource[]] {
  return resourcesToUpdate.reduce(
    (memo, [name, config]) =>
      (
        config.refetch ||
        config.force ||
        config.prefetch ||
        !hasLoaded(loadingStates[getResourceState(name)] as LoadingStates) ||
        getModelFromCache(config)?.lazy
      ) ?
        [memo[0], memo[1].concat([[name, config]])]
      : [memo[0].concat([[name, config]]), memo[1]],
    [[], []] as [Resource[], Resource[]],
  );
}

/**
 * Reducer used in useResources for managing model loading states. Also includes
 * request status state (as in the loadingStates state object, requestStatuses
 * are keyed by the model name) since those are often set together (when
 * requests succeed or fail). Action types for this reducer are any of the
 * LoadingStates values: ERROR and LOADED are roughly identical, whereas
 * LOADING actually encompasses both LOADING and PENDING and is the only time
 * that we just pass loading states in directly to be set (a combination of
 * LOADING and PENDING).
 *
 * Also sets the hasInitiallyLoaded state when all critical loading states have
 * loaded for the first time.
 */
type LoaderAction =
  | { type: "error"; payload: { name: string; status: number } }
  | {
      type: "loaded";
      payload: { name: string; status?: number; resources: Resource[] };
    }
  | { type: "loading"; payload: LoadingStateObj };
type LoaderState = {
  loadingStates: LoadingStateObj;
  requestStatuses: Record<`${string}Status`, number>;
  hasInitiallyLoaded: boolean;
};

function loaderReducer(
  { loadingStates, requestStatuses, hasInitiallyLoaded }: LoaderState,
  { type, payload = {} }: LoaderAction,
): LoaderState {
  switch (type) {
    case "error":
    case "loaded": {
      // @ts-ignore
      const { name, status, resources } = payload;

      let nextLoadingStates = { ...loadingStates, [getResourceState(name)]: type };

      return {
        loadingStates: nextLoadingStates,
        requestStatuses: {
          ...requestStatuses,
          ...(status ? { [getResourceStatus(name)]: status } : {}),
        },
        hasInitiallyLoaded:
          hasInitiallyLoaded ||
          (type === "loaded" &&
            hasLoaded(getCriticalLoadingStates(nextLoadingStates, resources)) &&
            !hasInitiallyLoaded),
      };
    }
    case "loading":
      return {
        loadingStates: { ...loadingStates, ...payload },
        requestStatuses,
        hasInitiallyLoaded,
      };
    default:
      return { loadingStates, requestStatuses, hasInitiallyLoaded };
  }
}

/**
 * Whether to measure a particular request time, based on a static `measure` property
 * on the model itself (and not the request). `measure` can be a boolean, which if true
 * will track all requests for this model, or a function that takes its resource config
 * object to only track requests that meet a specific condition.
 */
function shouldMeasureRequest(resourceKey: ResourceKeys, config: ResourceConfigObj) {
  const Constructor = ModelMap[resourceKey] as ConstructorTypes;

  if (!Constructor || !window.performance || !window.performance.mark) {
    return false;
  }

  return typeof Constructor.measure === "function" ?
      Constructor.measure(config)
    : !!Constructor.measure;
}

/**
 * Here's where we do the fetching for a given set of resources. We combine the
 * promises into a single Promise.all so that we wait until all fetches complete
 * before listening on them. Note that Promise.all takes the promise returned
 * from the fetch's catch method, so that even if a request fails, Promise.all
 * will not reject.
 *
 * A note about the properties of the last argument, the options object:
 *   component {object} - reference to the component instance, or in the case of
 *     function components, a unique and consistent object reference to associate
 *     with the component instance.
 *   isCurrentResource {function} - should true if a returned resource is the
 *     current resource for a component instance (ie, no newer requests were
 *     made in the interim)
 *   setResourceState {function} - updates resource state
 *   onRequestSuccess {function} - called after a request succeeds
 *   onRequestFailure {function} - called after a request fails
 */
function fetchResources(
  resources: Resource[],
  props: Props,
  {
    component,
    isCurrentResource,
    setResourceState,
    onRequestSuccess,
    onRequestFailure,
  }: {
    component: Record<string, never>;
    isCurrentResource: (resource: Resource, cacheKey: string) => boolean;
    setResourceState: Dispatch<SetStateAction<Record<string, any>>>;
    onRequestSuccess: (
      model: Model | Collection,
      status: number | undefined,
      resource: Resource,
    ) => void;
    onRequestFailure: (status: number, resource: Resource) => void;
  },
) {
  // ensure critical requests go out first
  resources = resources.concat().sort((a, b) =>
    a[1].prefetch ? 2
    : b[1].prefetch ? -2
    : a[1].noncritical ? 1
    : b[1].noncritical ? -1
    : 0,
  );

  return Promise.all(
    // nice visual for this promise chain: http://tinyurl.com/y6wt47b6
    resources.map(([name, config]) => {
      const { resourceKey, provides, refetch, ...rest } = config;
      const cacheKey = getCacheKey(config);
      const shouldMeasure = shouldMeasureRequest(resourceKey, config) && !getModelFromCache(config);

      if (shouldMeasure) {
        window.performance.mark(name);
      }

      return request(cacheKey, ModelMap[resourceKey]!, {
        component,
        force: refetch,
        ...rest,
      }).then(
        // success callback, where we track request time and add any dependent props or models
        ([model, status]) => {
          if (shouldMeasure) {
            trackRequestTime(name, config);
          }

          delete model.refetching;

          // don't continue unless component is still mounted and resource is current
          if (isCurrentResource([name, config], cacheKey)) {
            // add any dependencies this resource might provide for other resources
            provideProps(model, provides, props, setResourceState);
            onRequestSuccess(model, status, [name, config]);
          }
        },

        // error callback
        (status) => {
          // if a refetching request errors, we still want to remove the refetching flag
          // before going into an error state
          delete getModelFromCache(config)?.refetching;

          // this catch block gets called _only_ for request errors.
          // don't set error state unless resource is current
          if (isCurrentResource([name, config], cacheKey)) {
            onRequestFailure(status, [name, config]);
          }
        },
      );
    }),
  );
}

/**
 * Add any dependencies that the model provides as resource state.
 */
function provideProps(
  model: Model | Collection,
  provides: ResourceConfigObj["provides"],
  props: Props,
  setResourceState: Dispatch<SetStateAction<Record<string, any>>>,
) {
  if (provides) {
    setResourceState((state) => ({ ...state, ...provides(model, props) }));
  }
}
