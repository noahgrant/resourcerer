import {hasErrored, hasLoaded, isLoading} from './utils';
import {ModelMap, ResourceKeys, ResourcesConfig, UnfetchedResources} from './config';
/* eslint-disable no-unused-vars */
import React, {useEffect, useReducer, useRef, useState} from 'react';
/* eslint-enable no-unused-vars */

import Collection from './collection';
import ErrorBoundary from './error-boundary';
import {LoadingStates} from './constants';
import Model from './model';
import ModelCache from './model-cache';
import ReactDOM from 'react-dom';
import request from './request';

const SPREAD_PROVIDES_CHAR = '_';

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
 * custom name if passed a modelKey config property), and each map value is a
 * config object that may contain any of the following properties:
 *
 *   * noncritical {boolean} - whether the resource should not be taken into
 *        account when determining the loading state of the component. default
 *        is false
 *   * data {object} - data for the fetch call passed to the `request`
 *   * options {object} - options object passed to the model's `initialize`
 *   * dependsOn {string[]} - prop fields required to be present before the
 *        resource will fetch
 *   * provides {object<string: function>[]} - list of props that a resource
 *        provides, for example, for dependent resources (serial requests). Each
 *        key in the object is the prop field, and its value is a transform
 *        function that takes the model and props as arguments and should return
 *        a value to be set for the prop. If the key is equal to
 *        SPREAD_PROVIDES_CHAR, then the return value of the transform function
 *        is spread for dynamically-provided props.
 *   * prefetch {object} - an individual map of expected future props to fetch
 *        a new resource and store it in the cache. it will not, however, get
 *        passed down to the child (no loading states, either)
 *   * prefetches {object[]} - a list of objects whose properties represent the
 *        expected future values of props. these get turned into new cache keys
 *        and new requests.
 *   * modelKey {ResourceKeys} - use this when adding a custom name for the resource,
 *        so the props use the custom name, but the correct resource type is
 *        fetched and cached
 *   * ...any other option that can be passed directly to the `request` function
 */
export const useResources = (getResources, props) => {
  var [resourceState, setResourceState] = useState({}),
      props = {...props, ...resourceState},
      resources = generateResources(getResources, props),

      initialLoadingStates = buildResourcesLoadingState(resources.filter(withoutPrefetch), props),

      // set initial loading states and create loaderDispatch for maintaining them
      [{loadingStates, requestStatuses, hasInitiallyLoaded}, loaderDispatch] = useReducer(
        loaderReducer,
        {
          loadingStates: initialLoadingStates,
          requestStatuses: {},
          hasInitiallyLoaded: hasLoaded(getCriticalLoadingStates(initialLoadingStates, resources))
        }
      ),
      criticalLoadingStates = getCriticalLoadingStates(loadingStates, resources),

      // we need to save our models as state using hooks because we can't defer
      // reading from the model cache with updated props, and so we'd _always_
      // show an empty model as a resource is being requested instead of
      // continuing to show the previous model. on the plus side, setting them
      // as state means we won't need a loading overlay component to do this for us
      [models, setModels] = useState(modelAggregator(resources.filter(withoutPrefetch))),

      isMountedRef = useIsMounted(false),
      // this is used as an identifier to this component instance to register
      // with the ModelCache. it should be constant across renders, sow keep it in a ref.
      componentRef = useRef({}),
      // this reference to previous props allows us to know when resources are changing
      prevPropsRef = useRef(null),
      // this might look confusing but is important. we need to know, before
      // setting any loaded or error states, that a returned resource belongs
      // to the most recent component props. so we use a ref to persist across the closure
      currentPropsRef = useRef(props),
      // stash reference to all models with listeners currently attached, since when we return
      // from any updated requests there's no guarantee that the most recent models were a
      // function of the previous props (as opposed to props from two renders ago, for example).
      // an edge case may be seen with resources that become pending or go from pending across
      // renders. using this reference will guarantee that we always remove listeners from the
      // correct models before attaching new listeners
      listenedModelsRef = useRef([]),

      forceUpdate = useForceUpdate(),
      getPrevCacheKey = (rsrc) => findCacheKey(rsrc, getResources, prevPropsRef.current),
      // note that this only tells when cache keys have changed. if a resource has already been
      // cached, this will still return its resource when the component mounts. that's why we
      // partition these out later into loaded and not loaded resources
      getResourcesToUpdate = (rsrcs) => rsrcs.filter(hasAllDependencies.bind(null, props))
          .filter(not(shouldBypassFetch.bind(null, props)))
          .filter(([name, config]) => {
            var previousCacheKey = prevPropsRef.current && getPrevCacheKey([name, config]);

            return (!previousCacheKey || previousCacheKey !== getCacheKey(config) ||
              !hasAllDependencies(prevPropsRef.current, [, config]) || config.refetch);
          });

  /**
   * Fetch things.
   * Ideally we would re-run this if any of the cache keys have changed, but
   * right now useEffect can't be run in a dynamic loop--it must be top-level.
   * So we must manually compare prevProps.
   *
   * Note also that every time we set a state, whether it be loading states or models, we are
   * setting a new object as that state and we will re-render. That means that if a model is cached
   * or its loading states haven't changed we should _not_ just go ahead and call fetchResources,
   * because that will re-render our components an additional two times.
   */
  useEffect(() => {
    var pendingResources = resources.filter(not(hasAllDependencies.bind(null, props)))
            .filter(([, config]) =>
              !prevPropsRef.current || hasAllDependencies(prevPropsRef.current, [, config])),
        resourcesToUpdate = getResourcesToUpdate(resources),
        nextLoadingStates = {
          ...buildResourcesLoadingState(pendingResources, props, LoadingStates.PENDING),
          // but resourcesToUpdate should get set to LOADING (or LOADED if in the cache)
          ...buildResourcesLoadingState(resourcesToUpdate.filter(withoutPrefetch), props)
        },

        // separate out those resources to update into those that are already cached and those
        // that need to be fetched. the former will get the models updated immediately
        [loadedResources, resourcesToFetch] = partitionResources(
          resourcesToUpdate,
          nextLoadingStates
        );

    // first set our updated resources' loading states to LOADING. but don't set if we're already
    // in a loading state for that resource, because that's a pointless extra render. also, any
    // resources that have lost their dependencies should go back to a pending state
    if (Object.keys(nextLoadingStates).some((ky) => nextLoadingStates[ky] !== loadingStates[ky])) {
      loaderDispatch({type: LoadingStates.LOADING, payload: nextLoadingStates});
    }

    // pending resources: need to remove our model state here because it won't happen after a
    // request like the others, since no request is being made for pending resources. note that
    // this will stay as the requested model if the dependent prop does not affect the cache key.
    // loaded resources: we also don't fetch these, so we need to set our models immediately
    if (pendingResources.concat(loadedResources).length) {
      setModels(modelAggregator(pendingResources.concat(loadedResources).filter(withoutPrefetch)));
    }

    // NOTE: changing this to resourcesToFetch causes some inexplicable bugs around cached resources
    // and a UI that wouldn't update. so this is kept as resourcesToUpdate and fetchResources is
    // given resourcesToFetch. Because we are still only fetching resourcesToFetch and because any
    // loaded resources will have already had their models set above, and any loaded prefetched
    // models do not have loading or model states, this should have no practical effect
    if (resourcesToUpdate.length) {
      if (prevPropsRef.current) {
        resourcesToUpdate.forEach(([name, config]) => {
          var prevConfig = findConfig([name, config], getResources, prevPropsRef.current),
              prevCacheKey = getCacheKey(prevConfig);

          // unregister component from previous models that are getting updated
          ModelCache.unregister(componentRef.current, prevCacheKey);

          // this is our re-caching: if we already have a new model in the cache that has now been
          // saved (and thus has a real cache key), move the model to the new cache key and remove
          // it from the old one. this will save an unnecessary request.
          if (prevConfig.attributes && !prevConfig.attributes?.id && config.attributes?.id) {
            ModelCache.put(getCacheKey(config), ModelCache.get(prevCacheKey));
            ModelCache.remove(prevCacheKey);
          }
        });
      }

      fetchResources(resourcesToFetch, props, {
        component: componentRef.current,
        isCurrentResource: ([name, config], cacheKey) => isMountedRef.current && !config.prefetch &&
          cacheKey === findCacheKey([name, config], getResources, currentPropsRef.current),
        setResourceState,
        onRequestSuccess: (model, status, [name, config]) => {
          // to batch these state updates into one, per this comment:
          // https://stackoverflow.com/questions/48563650/
          // does-react-keep-the-order-for-state-updates/48610973#48610973
          ReactDOM.unstable_batchedUpdates(() => {
            if (resources.filter(withoutPrefetch).length) {
              setModels(modelAggregator(resources.filter(withoutPrefetch)));
            }

            loaderDispatch({
              type: LoadingStates.LOADED,
              payload: {name, config, status, resources}
            });
          });
        },
        onRequestFailure: (status, [name, config]) => loaderDispatch({
          type: LoadingStates.ERROR,
          payload: {name, config, status}
        })
      }).then(() => {
        if (isMountedRef.current) {
          // only get those from the cache. models in state might can empty models, but even so i
          // think it would be preferable to use state (within a separate useEffect) to determine
          // which models get listened to. but as mentioned, that would require the effect to depend
          // on cache keys, which are dynamic, and effects can't have dynamic dependencies right now
          let listenedModels = resources.map(([, config]) => getModelFromCache(config))
              .filter(Boolean);

          // remove previous listeners and attach new ones
          listenedModelsRef.current.forEach((model) => model.offUpdate(componentRef.current));
          listenedModels.forEach((model) => model.onUpdate(forceUpdate, componentRef.current));

          listenedModelsRef.current = listenedModels;
        }
      });
    }

    return () => prevPropsRef.current = props;
  });

  // this effect attaches listeners to any bypassed models (ie, those passed in) which don't get
  // attached after a fetch call. additionally, the cleanup function unregisters the component from
  // all models and removes model listeners from all resources when unmounting
  useEffect(() => {
    var bypassedModels = resources.filter(shouldBypassFetch.bind(null, props))
        .map(([name, {modelKey}]) => props[getResourcePropertyName(name, modelKey)])
        .filter(Boolean);

    bypassedModels.forEach((model) => model.onUpdate(forceUpdate, componentRef.current));

    return () => {
      ModelCache.unregister(componentRef.current);
      // use _current_ props when getting the models here, because if any have changed over the
      // lifecycle of the component then they should have already had listeners removed. this only
      // removes listeners from the 'last' batch before unmounting
      resources.map(([, config]) => getModelFromCache(config))
          .filter(Boolean)
          .concat(bypassedModels)
          .forEach((model) => model.offUpdate(componentRef.current));
    };
  }, []);

  /**
   * This effect promptly removes any entries placed in the `refetches` resources state array.
   * Doing this here ensures that we don't have repeated effects with refetches, since that passes
   * them through the `resourcesToUpdate` path.
   */
  useEffect(() => {
    if ((props.refetches || []).length) {
      setResourceState(({refetches, ...state}) => state);
    }
  }, [(props.refetches || []).join()]);

  currentPropsRef.current = props;

  return {
    ...models,

    // spread url params and merge with state. url should take priority
    // over passed props (like defaultProps), but state should take
    // precedence over all
    ...props,
    ...props[ResourcesConfig.queryParamsPropName] || {},
    ...resourceState,

    // helpers
    isOrWillBeLoading: () => {
      var resourcesToUpdate = getResourcesToUpdate(
        resources.filter(withoutNoncritical).filter(withoutPrefetch)
      );

      // here we only look at resources to fetch, not loaded ones
      return !hasLoaded(criticalLoadingStates) || !!partitionResources(
        resourcesToUpdate,
        // 'next' loading states
        buildResourcesLoadingState(resourcesToUpdate, props)
      )[1].length;
    },
    refetch: (fn) => {
      var refetches = fn(ResourceKeys);

      if (refetches.length) {
        setResourceState((state) => ({...state, refetches}));
      }
    },

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
    hasInitiallyLoaded
  };
};

/**
 * HOC version of useResources, returning all of the same props otherwise returned by the hook. See
 * the comment above useResources for details on the getResources executor function, or check the
 * README.
 */
export const withResources = (getResources) => (Component) =>
  function DataCarrier(props) {
    var resources = useResources(getResources, props);

    return (
      <ErrorBoundary>
        <Component {...props} {...resources} />
      </ErrorBoundary>
    );
  };

/**
 * Helper method to flatten the hash of resources returned by the `getResources`
 * function into a single array of [name, config] entries. Resource values are
 * objects that may also contain a `prefetches` property containing a list of
 * additional `props` configurations used to prefetch that resource; those are
 * given a `prefetch` property set to those changed props. Finally, each
 * resource is given a `modelKey` property equal to its ResourceKey name if not
 * passed in directly. `modelKey` is then used for all things fetch- and cache-
 * related, while `name` is used for model, loading state, and status props. If
 * no `modelKey` property is passed in, then it is identical to the resource's
 * `name`.
 *
 * @param {function} getResources - resources executor fn
 * @param {object} props - current component props
 * @return {[string, object][]} flattened [name, config] list of resources
 *   to be consumed by the useResources with prefetch properties assigned.
 */
function generateResources(getResources, props) {
  return Object.entries(getResources(ResourceKeys, props) || {})
      .reduce((memo, [name, config={}]) =>
        memo.concat([[name, {
          modelKey: config.modelKey || name,
          refetch: props.refetches?.includes(name),
          ...config
        }]].concat(
          // expand prefetched resources with their own options based on
          // their prefetch props, and store those in the `prefetch` property
          (config.prefetches || []).map((prefetch) => ([name, {
            modelKey: config.modelKey || name,
            ...getResources(ResourceKeys, {...props, ...prefetch})[name],
            prefetch
          }]))
        )), []);
}

/**
 * @param {string} name - string name of the resource
 * @return {string} name of the loading state property
 */
function getResourceState(name) {
  return `${name}LoadingState`;
}

/**
 * @param {string} name - string name of the resource
 * @return {string} name of the status property
 */
function getResourceStatus(name) {
  return `${name}Status`;
}

/**
 * Formulates the name of the resource prop passed to the child component, ie
 * this.props.todosCollection and this.props.todoItemModel.
 *
 * @param {string} baseName - string name of the resource
 * @param {ResourceKeys} modelKey - if the resource is not given a custom name,
 *   this is the same as `baseName`
 * @return {string} name of the resource prop passed to the child component
 */
function getResourcePropertyName(baseName, modelKey) {
  var Constructor = ModelMap[modelKey];

  return Constructor.prototype instanceof Collection ? `${baseName}Collection` :
    `${baseName}Model`;
}

/**
 * When a resource is not found in the ModelCache, resourcerer returns a
 * default empty resource so that clients can assume the model is defined
 * without needing to be defensive. This method freezes an empty instance of
 * the model associated with the modelKey and returns it.
 *
 * We seed the empty model with any attributes or models it intends on having
 * just in case this is a model given an `options.fetch` of `false`, in which
 * case we expect that the model should not have a loading state and should
 * appear as expected immediately.
 *
 * @param {string} config - resource config object
 * @return {Model|Collection} empty model or collection instance with frozen
 *   atributes or models, respectively
 */
function getEmptyModel({modelKey, attributes, models, options}) {
  var Model_ = typeof ModelMap[modelKey] === 'function' ? ModelMap[modelKey] : Model,
      emptyInstance = new Model_(
        Model_.prototype instanceof Collection ? models : attributes,
        options
      );

  // flag to differentiate between other model instances that happen to be empty
  emptyInstance.isEmptyModel = true;

  // ensure that no resourcerer client can modify empty model's data
  Object.freeze(emptyInstance.attributes);
  Object.freeze(emptyInstance.models);

  return emptyInstance;
}

/**
 * Calculates a cache key for the resource depending on the base resource type
 * key and the truthy parameter values. Parameter values are calculated in via
 * the constructor's static `cacheFields` array:
 *
 *   `cacheFields` values are taken directly from the config object as opposed
 *   to props, in the following order: `options` object, `attributes` object,
 *   `data` object. Field keys are included in this method, which is why it is
 *   preferred. `cacheFields` entries can be functions, too, which take the
 *   `data` object as a parameter and return a key/value object that gets
 *   flattened to a piece of the cache key.
 *
 * @param {object} config - resource config object (destructured)
 * @return {string} cache key
 */
export function getCacheKey({modelKey, data={}, options={}, attributes={}}) {
  var toKeyValString = ([key, val]) => val ? `${key}=${val}` : '',
      fields = (ModelMap[modelKey]?.cacheFields || []).map(
        (key) => typeof key === 'function' ?
          Object.entries(key(data)).map(toKeyValString).join('_') :
          toKeyValString([key, options[key] || attributes[key] || data[key]])
      ).filter((x) => x);

  return `${modelKey || ''}${fields.sort().join('_')}`;
}

/**
 * Finds the current config object given a set of props based on the modelKey and whether it is a
 * prefetched resource
 *
 * @param {[name: string, {prefetch: object}]} resource name and config tuple
 * @param {function} getResources - resources executor fn
 * @param {object} props - props with which to find the cache key for a given resource
 * @return {string} the resource config for the resource of name `name` and matching
 *   prefetch, if applicable
 */
function findConfig([name, {prefetch}], getResources, props) {
  var [, config={}] = generateResources(getResources, props)
      .find(([_name, _config={}]) => name === _name &&
        // cheap deep equals
        JSON.stringify(_config.prefetch) === JSON.stringify(prefetch)) || [];

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
 *
 * @param {[name: string, config: object]} resource name and config tuple
 * @param {function} getResources - resources executor fn
 * @param {object} props - props with which to find the cache key for a given resource
 * @return {string} the cache key for the resource of name `name` and matching
 *   prefetch, if applicable
 */
function findCacheKey(resource, getResources, props) {
  return getCacheKey(findConfig(resource, getResources, props)) || '';
}

/**
 * Builds an object of loading states for resources, so that, for example,
 * before a fetch or refetch, all resource states are changed to LOADING.
 * Resources with dependencies that are not all present are put into a
 * 'PENDING' state.
 *
 * @param {array[]} resources - list of resource config entries for fetching
 * @param {object} props - current component props
 * @param {LoadingStates} defaultState - state to return if resource already exists in cache;
 *   in most circumstances, this should be the LOADED state as you might expect. However, when we
 *   prep resources to be re-fetched, in order to keep the loading state in sync with its model
 *   state, even a cached resource should be temporarily in a LOADING state (if cached, this will
 *   be corrected in the next microtask and before the JS stack is completed, so the LOADING state
 *   should never be shown in the UI, despite render being called multiple times).
 * @return {object} state object with resource state keys as keys and the loading
 *    state as values
 */
function buildResourcesLoadingState(resources, props, defaultState=LoadingStates.LOADED) {
  return resources.reduce((state, [name, config]) => Object.assign(state, {
    [getResourceState(name)]:
      !config.refetch && (shouldBypassFetch(props, [name, config]) || getModelFromCache(config)) ?
        defaultState :
        (!hasAllDependencies(props, [, config]) ? LoadingStates.PENDING : LoadingStates.LOADING)
  }), {});
}

/**
 * Determines whether a resource's required props for fetching are all present.
 *
 * @param {object} props - current component props
 * @param {{dependsOn: string|object}} resource config entry
 * @return {boolean} whether or not all required props are present
 */
function hasAllDependencies(props, [, {dependsOn}]) {
  return !dependsOn || !dependsOn.filter((dep) => !props[dep]).length;
}

/**
 * Convenience wrapper method for getting a model from the cache. Has the same
 * function signature as `getCacheKey`. ModelCache will return undefined if it
 * doesn't find a model at the given key.
 *
 * @param {string} baseKey - model resource type key
 * @param {string[]|object[]} fields - list of property names whose values determine
 *    which flavor of resource is requested
 * @param {object} props - current component props
 * @return {Model|Collection?} model from the cache
 */
function getModelFromCache(...args) {
  return ModelCache.get(getCacheKey(...args));
}

/**
 * Filter predicate to remove prefetched resources from a resources list.
 *
 * @param {[, object]} config - resources config entry
 * @return {boolean} true if a resource is not prefetched
 */
function withoutPrefetch([, config]) {
  return !config.prefetch;
}

/**
 * Filter predicate to remove noncritical resources from a resources list.
 *
 * @param {[, object]} config - resources config entry
 * @return {boolean} true if a resource is critical
 */
function withoutNoncritical([, config]) {
  return !config.noncritical;
}

/**
 * This method determines if props with the resource names have been
 * passed to the component directly, in which case we'll skip the
 * fetching.
 *
 * @param {object} props - current component props
 * @param {array[]} resources - list of resource config entries for fetching
 * @return {boolean} whether the component should make the fetch calls
 */
function shouldBypassFetch(props, [name, {modelKey}]) {
  return props.hasOwnProperty(getResourcePropertyName(name, modelKey));
}

/**
 * Negates the return value of an input function
 *
 * @param {function} fn - input function to negate
 * @return {function} a function that negates the return value of the input function
 */
function not(fn) {
  return (...args) => !fn(...args);
}

/**
 * Hook to force a component update for a functional component by assigning a
 * new blank object reference every time.
 *
 * @return {function} function that, on every invocation, sets a new object as
 *   state and causes a re-render.
 */
function useForceUpdate() {
  var [, forceUpdate] = useState({});

  return () => forceUpdate({});
}

/**
 * @return {ref} ref whose current value is a boolean, whether or not a
 *   component is currently mounted
 */
function useIsMounted() {
  var isMountedRef = useRef(false);

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
 *
 * @param {string} name - resource name
 * @param {object<data: object, options: object>} fetch data and options
 */
function trackRequestTime(name, {data, options}) {
  var measurementName = `${name}Fetch`,
      fetchEntry;

  // ensure that another resource request hasn't removed the perf mark
  if (window.performance.getEntriesByName(name).length) {
    window.performance.measure(measurementName, name);
    fetchEntry = window.performance.getEntriesByName(measurementName).pop();

    ResourcesConfig.track('API Fetch', {
      Resource: name,
      data,
      options,
      duration: Math.round(fetchEntry.duration)
    });

    window.performance.clearMarks(name);
    window.performance.clearMeasures(measurementName);
  }
}

/**
 * Dynamically gathers a list of loading states for the component's critical
 * resources so that we can pass down the correct values for the hasLoaded,
 * isLoading, and hasErrored props.
 *
 * @param {array[]} resources - list of resource config entries for fetching
 * @return {string[]} a list of critical loading states for the component
 */
function getCriticalLoadingStates(loadingStates, resources) {
  return resources.filter(withoutNoncritical)
      .filter(withoutPrefetch)
      .map(([name]) => loadingStates[getResourceState(name)]);
}

/**
 * Helper method whose return function aggregates all models to be set as model
 * state in the useResources hook. Pulls model from the cache or assigns the
 * empty model if one does not exist. If no models have actually changed from
 * current state, we don't set a new object as state to avoid rerendering.
 *
 * @param {array[]} resources - list of resource config entries
 * @return {function} function that can be passed to a state-setting function
 *   that returns models keyed by name
 */
function modelAggregator(resources) {
  var newModels = resources.reduce((memo, [name, config]) => Object.assign(memo, {
    [getResourcePropertyName(name, config.modelKey)]: getModelFromCache(config) ||
      getEmptyModel(config)
  }), {});

  return (models={}) => Object.keys(newModels).filter(
    // this comparison is so that if no models have changed, we don't change state and rerender.
    // this is only important when a model is cached when a component mounts, because it will still
    // be included in resourcesToUpdate even though its model will be seeded in state already
    (key) => models[key] !== newModels[key]
  ).length ? {...models, ...newModels} : models;
}

/**
 * Separates out resources between those that are loading and those that have loaded. The latter
 * won't need to get passed to fetchResources, but the former will.
 *
 * @param {array[]} resourcesToUpdate - resource configs to partition
 * @param {object} loadingStates - contains upcoming loading states for each resource
 * @return {[array[], array[]]} partitioned tuple of resources that have been loaded and resources
 *   that should be passed to fetchResources
 */
function partitionResources(resourcesToUpdate, loadingStates) {
  return resourcesToUpdate.reduce((memo, [name, config]) =>
    config.refetch || !hasLoaded(loadingStates[getResourceState(name)]) ?
      [memo[0], memo[1].concat([[name, config]])] :
      [memo[0].concat([[name, config]]), memo[1]],
  [[], []]);
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
 *
 * @param {{loadingStates: object, requestStatuses: object, hasInitiallyLoaded: boolean}} -
 *   current loader state
 * @param {{type: LoadingStates, payload: object}} - reducer action object
 * @return {{loadingStates: object, requestStatuses: object, hasInitiallyLoaded: boolean}} -
 *   next loader state
 */
function loaderReducer(
  {loadingStates, requestStatuses, hasInitiallyLoaded},
  {type, payload={}}
) {
  var {name, status, resources} = payload;

  switch (type) {
    case LoadingStates.ERROR:
    case LoadingStates.LOADED: {
      let nextLoadingStates = {...loadingStates, [getResourceState(name)]: type};

      return {
        loadingStates: nextLoadingStates,
        requestStatuses: {...requestStatuses, [getResourceStatus(name)]: status},
        hasInitiallyLoaded: hasInitiallyLoaded || (type === LoadingStates.LOADED &&
          hasLoaded(getCriticalLoadingStates(nextLoadingStates, resources)) && !hasInitiallyLoaded)
      };
    }
    case LoadingStates.LOADING:
      return {
        loadingStates: {...loadingStates, ...payload},
        requestStatuses,
        hasInitiallyLoaded
      };
    default:
      return {loadingStates, requestStatuses, hasInitiallyLoaded};
  }
}

/**
 * Whether to measure a particular request time, based on a static `measure` property
 * on the model itself (and not the request). `measure` can be a boolean, which if true
 * will track all requests for this model, or a function that takes its resource config
 * object to only track requests that meet a specific condition.
 *
 * @param {ResourceKeys} modelKey - key representing model to be measured
 * @param {object} config - resource config object for a particular request instance
 * @return {boolean} whether a particular request time should be measured
 */
function shouldMeasureRequest(modelKey, config) {
  if (!window.performance || !window.performance.mark) {
    return false;
  }

  return typeof ModelMap[modelKey].measure === 'function' ?
    ModelMap[modelKey].measure(config) :
    !!ModelMap[modelKey].measure;
}

/**
 * Here's where we do the fetching for a given set of resources. We combine the
 * promises into a single Promise.all so that we wait until all fetches complete
 * before listening on them. Note that Promise.all takes the promise returned
 * from the fetch's catch method, so that even if a request fails, Promise.all
 * will not reject.
 *
 * @param {array[]} resources - list of resource config entries for fetching
 * @param {object} props - current component props
 * @param {object} options - object whose properties allow us to shim any
 *   differences between the withResources HOC and the useResources hook.
 *   contains properties:
 *     component {object} - reference to the component instance, or in the case of
 *       function components, a unique and consistent object reference to associate
 *       with the component instance.
 *     isCurrentResource {function} - should true if a returned resource is the
 *       current resource for a component instance (ie, no newer requests were
 *       made in the interim)
 *     setResourceState {function} - updates resource state
 *     onRequestSuccess {function} - called after a request succeeds
 *     onRequestFailure {function} - called after a request fails
 */
function fetchResources(resources, props, {
  component,
  isCurrentResource,
  setResourceState,
  onRequestSuccess,
  onRequestFailure
}) {
  // ensure critical requests go out first
  /* eslint-disable id-length */
  resources = resources.concat().sort((a, b) =>
    a[1].prefetch ? 2 : b[1].prefetch ? -2 : a[1].noncritical ? 1 : b[1].noncritical ? -1 : 0);
  /* eslint-enable id-length */

  return Promise.all(
    // nice visual for this promise chain: http://tinyurl.com/y6wt47b6
    resources.map(([name, config]) => {
      var {data, modelKey, provides={}, refetch, ...rest} = config,
          cacheKey = getCacheKey(config),
          shouldMeasure = shouldMeasureRequest(modelKey, config) && !getModelFromCache(config);

      if (shouldMeasure) {
        window.performance.mark(name);
      }

      return request(cacheKey, ModelMap[modelKey], {
        fetch: !UnfetchedResources.has(modelKey),
        data,
        component,
        forceFetch: refetch,
        ...rest
      }).then(
        // success callback, where we track request time and add any dependent props or models
        ([model, status]) => {
          if (shouldMeasure) {
            trackRequestTime(name, config);
          }

          // add unfetched resources that a model might provide
          if (ModelMap[modelKey].providesModels) {
            ModelMap[modelKey].providesModels(model, ResourceKeys).forEach((uConfig) => {
              var uCacheKey = getCacheKey(uConfig),
                  existingModel = ModelCache.get(uCacheKey);

              if (typeof uConfig.shouldCache !== 'function' ||
                  uConfig.shouldCache(existingModel, uConfig)) {
                // components may be listening to existing models, so only create
                // new model if one does not currently exist
                existingModel ?
                  existingModel.set(uConfig.models || uConfig.attributes) :
                  ModelCache.put(
                    uCacheKey,
                    new ModelMap[uConfig.modelKey](
                      uConfig.models || uConfig.attributes,
                      uConfig.options || {}
                    ),
                    component
                  );
              }
            });
          }

          // don't continue unless component is still mounted and resource is current
          if (isCurrentResource([name, config], cacheKey)) {
            // add any dependencies this resource might provide for other resources
            if (Object.entries(provides).length) {
              setResourceState((state) => ({
                ...state,
                ...Object.entries(provides).reduce((memo, [provide, transform]) => Object.assign({
                  memo,
                  ...(provide === SPREAD_PROVIDES_CHAR ?
                    transform(model, props) :
                    {[provide]: transform(model, props)})
                }), {})
              }));
            }

            onRequestSuccess(model, status, [name, config]);
          }
        },

        // error callback
        (status) => {
          // this catch block gets called _only_ for request errors.
          // don't set error state unless resource is current
          if (isCurrentResource([name, config], cacheKey)) {
            onRequestFailure(status, [name, config]);
          }
        }
      );
    })
  );
}
