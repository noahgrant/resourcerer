import {_hasErrored, _hasLoaded, _isLoading} from './utils';
import {ModelMap, ResourceKeys, ResourcesConfig, UnfetchedResources} from './config';

import _ from 'underscore';
import ErrorBoundary from './error-boundary.jsx';
import {LoadingStates} from './constants';
import ModelCache from './model-cache';
import React from 'react';
import request from './request';
import Schmackbone from 'schmackbone';
import schmackboneMixin from './schmackbone-mixin';

const SPREAD_PROVIDES_CHAR = '_';

// pending and errored resources are not cached, but instead of passing down an
// undefined prop, we pass down empty models for greater defense in client code
export const EMPTY_MODEL = Object.freeze(new Schmackbone.Model());
export const EMPTY_COLLECTION = Object.freeze(new Schmackbone.Collection());

// ensure that no withResources client can modify empty models' data
Object.freeze(EMPTY_MODEL.attributes);
Object.freeze(EMPTY_COLLECTION.models);

/**
 * This HOC is a light wrapper around the DataCarrier component for setting
 * state that should trigger resource updates. Some things won't need this, ie
 * a url update that passes its query params down as props[queryParamsPropName].
 * But it provides a setResourceState method to wrap any necessary state that
 * may cause a resource update in DataCarrier's componentWillReceiveProps.
 */
const resourceState = (Component) =>
  class ResourceStateWrapper extends React.Component {
    constructor() {
      super();
      this.state = {};
    }

    setResourceState(newState={}, cb) {
      this.setState({
        ...this.state,
        ...newState
      }, cb);
    }

    render() {
      return (
        <Component
          ref={(dataCarrier) => this.dataCarrier = dataCarrier}
          attachDataChildRef={(dataChild) => this.dataChild = dataChild}
          {...this.props}
          // spread url params and merge with state. url should take priority
          // over passed props (like defaultProps), but state should take
          // precedence over all
          {...this.props[ResourcesConfig.queryParamsPropName] || {}}
          {...this.state}
          setResourceState={this.setResourceState.bind(this)}
        />
      );
    }
  };

/**
 * The withResources decorator produces a Data Carrier component that handles
 * several different data-related things for a component automatically:
 *
 *   1. it fetches a component's resources in cWM
 *   2. it binds schmackboneMixin listeners to any resource with a `listen: true` option
 *   3. it handles whether or not the critical resources for a component have loaded
 *   4. it re-fetches a new resource in cWRP when specified props have changed
 *   5. it handles resource cache naming for the ModelCache
 *
 * getResources is a function that takes props as an argument and should return
 * a map of resources. Each resource map key is the name of the resource (which
 * should be a ResourceKeys entry that also has an entry in ModelMap, but can be a
 * custom name if passed a modelKey config property), and each map value is a
 * config object that may contain any of the following properties:
 *
 *   * fields {string[]|object[]} - **** DEPRECATED - only use this if you need
 *        to respond to dynamic props that can't be added to a model's static
 *        `cacheFields` property ****
 *        list of property names within props that should trigger a re-fetch
 *        when changed. if a field entry is passed in as an object, it can have
 *        the following properties:
 *          * name {string} (required) - the name of the prop
 *          * cacheIgnore {boolean} if true, the field will still trigger a
 *            refetch, but will not be taken into account for the cache key
 *          * map {function} - when present, return value will be used for the
 *            cache key. takes the prop value and the props object as arguments
 *   * noncritical {boolean} - whether the resource should not be taken into
 *        account when determining the loading state of the component. default
 *        is false
 *   * listen {boolean} - whether the component should re-render on changes to
 *        the resource
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
 *   * status {boolean} - whether the component requires the status of the http
 *        request to be passed along.
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
const withResources = (getResources) =>
  (Component) => {
    @resourceState
    @schmackboneMixin
    class DataCarrier extends React.Component {
      constructor(props) {
        super();

        let resources = this._generateResources(props);

        // set initial loading state for our resources
        this.state = {
          ...buildResourcesLoadingState(resources.filter(withoutPrefetch), props),
          /**
           * Whether our critical resources have been loaded a first time. Useful for showing
           * reflecting a different UI for subsequent requests
           */
          hasInitiallyLoaded: false
        };
      }

      componentDidMount() {
        var resources = this._generateResources()
            .filter(hasAllDependencies.bind(null, this.props))
            .filter(not(shouldBypassFetch.bind(null, this.props)));

        // fetch models
        this._fetchResources(resources, this.props);

        this._isMounted = true;

        this._getBackboneModels = () =>
          this._generateResources()
              .filter(([, config]) => config.listen && getModelFromCache(config, this.props))
              .map(([, config]) => getModelFromCache(config, this.props));
      }

      UNSAFE_componentWillReceiveProps(nextProps) {
        // update models based on new props or new resources
        var nextResources = this._generateResources(nextProps),
            pendingResources = nextResources.filter(not(hasAllDependencies.bind(null, nextProps))),
            resourcesToUpdate = nextResources.filter(hasAllDependencies.bind(null, nextProps))
                .filter(not(shouldBypassFetch.bind(null, nextProps)))
                .filter(([name, config]) =>
                  this._hasResourceConfigChanged(name, config, nextProps) ||
                  !hasAllDependencies(this.props, [, config]));

        // first set our updated resources' loading states to LOADING. also, any
        // resources that have lost their dependencies should go back to a
        // pending state
        this.setState(buildResourcesLoadingState(
          pendingResources.concat(resourcesToUpdate.filter(withoutPrefetch)),
          nextProps
        ));

        // unregister component from previous models that are getting updated
        if (resourcesToUpdate.length) {
          ModelCache.unregister(
            this,
            ...resourcesToUpdate.map(this._findCurrentCacheKey.bind(this))
          );

          this._fetchResources(resourcesToUpdate, nextProps);
        }
      }

      componentDidUpdate() {
        var criticalResources = this._generateResources()
            .filter(withoutPrefetch)
            .filter(withoutNoncritical);

        if (!this.state.hasInitiallyLoaded && _hasLoaded(this._getModelStates(criticalResources))) {
          this.setState({hasInitiallyLoaded: true});
        }
      }

      componentWillUnmount() {
        this._isMounted = false;
        ModelCache.unregister(this);
      }

      /**
       * Here's where we do the fetching for a given set of resources. We
       * combine the promises into a single Promise.all so that we wait until
       * all fetches complete before listenting on any of them. Note that
       * Promise.all takes the promise returned from the fetch's catch method,
       * so that even if a request fails, Promise.all will not reject.
       *
       * @param {array[]} resources - list of resource config entries for fetching
       * @param {object} props - current component props
       */
      _fetchResources(resources, props) {
        // ensure critical requests go out first
        resources = _.sortBy(resources, ([, config]) =>
          config.prefetch ? 2 : (config.noncritical ? 1 : -1));

        Promise.all(
          // nice visual for this promise chain: http://tinyurl.com/y6wt47b6
          resources.map(([name, config]) => {
            var {data, modelKey, provides={}, ...rest} = config,
                // unless this is a prefetched resource, resourceProps will just be props
                resourceProps = {...props, ...(rest.prefetch || {})},
                cacheKey = getCacheKey(config, resourceProps),
                shouldMeasure = rest.measure && window.performance && window.performance.mark &&
                    !getModelFromCache(config, resourceProps);

            if (shouldMeasure) {
              window.performance.mark(name);
            }

            return request(cacheKey, ModelMap[modelKey || name], {
              fetch: !UnfetchedResources.has(modelKey),
              data,
              component: this,
              ...rest
            }).then((model) => {
              if (shouldMeasure) {
                this._trackRequestTime(name, rest);
              }

              // don't continue unless component is still mounted and resource is current
              if (this._isMounted && cacheKey === this._findCurrentCacheKey([name, config])) {
                // add any dependencies this resource might provide for other resources
                if (Object.entries(provides).length) {
                  props.setResourceState(
                    Object.entries(provides).reduce((memo, [provide, transform]) => ({
                      ...memo,
                      ...(provide === SPREAD_PROVIDES_CHAR ?
                        transform(model, props) :
                        {[provide]: transform(model, props)})
                    }), {})
                  );
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
                          this
                        );
                    }
                  });
                }

                // set loading state _after_ all its dependencies are added
                this.setState({
                  [getResourceState(name)]: LoadingStates.LOADED,
                  ...(rest.status ? {[getResourceStatus(name)]: model.status} : {})
                });
              }
            }, (model) => {
              // this catch block gets called _only_ for request errors.
              // don't set error state unless resource is current
              if (cacheKey === this._findCurrentCacheKey([name, config])) {
                this.setState({
                  [getResourceState(name)]: LoadingStates.ERROR,
                  ...(rest.status ? {[getResourceStatus(name)]: model.status} : {})
                });
              }
            });
          })
        ).then(() => {
          if (this._isMounted) {
            // attaches listeners on all resources with listen: true as defined
            // by this._getBackboneModels
            this._attachModelListeners();
          }
        });
      }

      /**
       * Helper method to flatten the hash of resources returned by the
       * `getResources` function into a single array of [name, config] entries.
       * Resource values are objects that may also contain a `prefetches`
       * property containing a list of additional `props` configurations used
       * to prefetch that resource; those are given a `prefetch` property set to
       * those changed props. Finally, each resource is given a `modelKey`
       * property equal to its ResourceKey name if not passed in directly.
       * `modelKey` is then used for all things fetch- and cache-related, while
       * `name` is used for model, loading state, and status props. If no
       * `modelKey` property is passed in, then it is identical to the
       * resource's `name`.
       *
       * @param {object} props - current component props
       * @return {[string, object][]} flattened [name, config] list of resources
       *   to be consumed by the withResources HOC with prefetch properties
       *   assigned.
       */
      _generateResources(props=this.props) {
        return Object.entries(getResources(props, ResourceKeys) || {})
            .reduce((memo, [name, config={}]) =>
              memo.concat([[name, {modelKey: config.modelKey || name, ...config}]].concat(
                // expand prefetched resources with their own options based on
                // their prefetch props, and store those in the `prefetch` property
                (config.prefetches || []).map((prefetch) => ([name, {
                  modelKey: config.modelKey || name,
                  ...getResources({...props, ...prefetch}, ResourceKeys)[name],
                  prefetch
                }]))
              )), []);
      }

      /**
       * When using cache key v2 generation, we no longer use props directly,
       * which makes comparing current/next resources more difficult (ie, we
       * can't just compare `getCacheKey(config, this.props)` and
       * `getCacheKey(config, nextProps)`) directly because `config` is
       * determined from props. However, disregarding prefetched resources, all
       * resources on a component must be unique by name (otherwise one would
       * override the other in the getResources() return value).
       *
       * @param {[name: string, {prefetch: object}]} resource name and config tuple
       * @return {string} the cache key for the current resource of name `name`
       */
      _findCurrentCacheKey([name, {prefetch}]) {
        var resources = this._generateResources(),
            [, config={}] = resources.find(([_name]) => name === _name) || [];

        return !prefetch && !config.prefetch && getCacheKey(config, this.props) || '';
      }

      /**
       * This method determines whether a resource's config has changed between
       * this.props and nextProps. This can happen in a coupld ways:
       *
       * 1. (legacy) the config has a `fields` property. In this case, we
       *    compare props[field] for each fields entry and return true if
       *    any are different.
       * 2. we compare cache key strings for this.props/nextProps
       *
       * @param {string} name - resource name
       * @param {object} config - resource config object
       * @param {object} nextProps - component's nextProps, used to compare
       *   cache keys with current props
       * @return {boolean} whether a resource's config has changed between
       *   this.props and nextProps, which will prompt a refetch
       */
      _hasResourceConfigChanged(name, config, nextProps) {
        var currentCacheKey = this._findCurrentCacheKey([name, config]);

        // this will be true if the current resource is a prefetched resource,
        // which we don't want to consider for determining a changed config
        if (!currentCacheKey) {
          return true;
        // the `fields` property is a legacy config property, but does allow for
        // more flexibility on the part of the component in establishing the
        // cache key. while we migrate existing configs off of `fields`, we
        // don't consider cache keys if config.fields exists in case there are
        // discrepancies. TODO(noah): when all models that use `cacheFields` no
        // longer have `fields` properties, this block can be removed
        } else if (config.fields) {
          // for each resource, check whether any prop fields listed in
          // config.fields have changed
          return (config.fields || []).filter(
            (field) => nextProps[field.name || field] !== this.props[field.name || field]
          ).length;
        }

        return currentCacheKey !== getCacheKey(config, nextProps);
      }

      /**
       * Dynamically gathers a list of loading states for the component's
       * critical resources so that we can pass down the correct values for the
       * hasLoaded, isLoading, and hasErrored props.
       *
       * @param {array[]} resources - list of resource config entries for fetching
       * @return {string[]} a list of critical loading states for the component
       */
      _getModelStates(resources) {
        return resources.filter(withoutNoncritical)
            .map(([name]) => this.state[getResourceState(name)]);
      }

      /**
       * Measures the duration of the request and calls the `track` config
       * method before clearing the performance markers.
       *
       * @param {string} name - resource name
       * @param {object<data: object, options: object>} fetch data and options
       */
      _trackRequestTime(name, {data, options}) {
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

      render() {
        var resources = this._generateResources().filter(withoutPrefetch),
            loadingStates = this._getModelStates(resources);

        return (
          <ErrorBoundary>
            <Component
              ref={(dataChild) => {
                this.props.attachDataChildRef(dataChild);
                // allows for schmackboneMixin to call forceUpdate in this context
                this.schmackboneContext = dataChild;
              }}
              // here we pass down our models
              {...resources.reduce((models, [name, config]) => ({
                ...models,
                [getResourcePropertyName(name, config.modelKey)]:
                  getModelFromCache(config, this.props) || getEmptyModel(config.modelKey)
              }), {})}

              // here we include our model loading states, useful for noncritical resources
              {..._.pick(this.state, ...resources.map(([name]) => getResourceState(name)))}
              {..._.pick(this.state, ...resources.map(([name]) => getResourceStatus(name)))}
              {...this.props}

              // these props represent our critical resource loading states
              hasErrored={_hasErrored(loadingStates)}
              hasInitiallyLoaded={this.state.hasInitiallyLoaded}
              hasLoaded={_hasLoaded(loadingStates)}
              isLoading={_isLoading(loadingStates)}
            />
          </ErrorBoundary>
        );
      }
    }

    return DataCarrier;
  };

/**
 * @param {string} name - string name of the resource
 * @return {string} name of the loading state property within DataCarrier state
 */
function getResourceState(name) {
  return `${name}LoadingState`;
}

/**
 * @param {string} name - string name of the resource
 * @return {string} name of the status property within DataCarrier state
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

  return Constructor.prototype instanceof Schmackbone.Collection ? `${baseName}Collection` :
    `${baseName}Model`;
}

/**
 * When a resource is not found in the ModelCache, withResources returns a
 * default empty resource so that clients can assume the model is defined
 * without needing to be defensive. This method determines whether the Backbone
 * Model or the Backbone Collection should be passed down for a given resource.
 *
 * TODO: should we go further and pass down empty instance of the specific
 *   constructor instead of a generic model/collection?
 *
 * @param {string} modelKey - resource type key
 * @return {Schmackbone.Model|Schmackbone.Collection} frozen empty model or collection instance
 */
function getEmptyModel(modelKey) {
  var Constructor = ModelMap[modelKey];

  return Constructor.prototype instanceof Schmackbone.Collection ? EMPTY_COLLECTION : EMPTY_MODEL;
}

/**
 * Calculates a cache key for the resource depending on the base resource type
 * key and the truthy parameter values. Parameter values are calculated in one
 * of two ways:
 *
 * * Default: Values are taken from props properties listed in the `fields`
 *   array. Fields passed in as objects are ignored from the key if they have a
 *   `cacheIgnore` property.
 * * V2, when the model's constructor has a static `cacheFields` array: values
 *   are taken directly from the config object as opposed to props, in the
 *   following order: `options` object, `attributes` object, `data` object.
 *   Field keys are included in this method, which is why it is preferred.
 *   `cacheFields` entries can be functions, too, which take the `data` object
 *   as a parameter and return a key/value object that gets flattened to a piece
 *   of the cache key.
 *
 * @param {object} config - resource config object (destructured)
 * @param {object} props - component props
 * @return {string} cache key
 */
export function getCacheKey({modelKey, fields=[], data={}, options={}, attributes={}}, props={}) {
  if (!(ModelMap[modelKey] || {}).cacheFields) {
    // this is the default cache key generation, which will be used if no static `cacheFields`
    // property exists on the model. it does not use add field keys to the cache key
    fields = (Array.isArray(fields) ? fields : [fields])
        .filter((field) => !field.cacheIgnore)
        .map((field) => typeof field.map === 'function' ?
          field.map(props[field.name], props) : props[field.name || field])
        .filter((x) => x);
  } else {
    let toKeyValString = ([key, val]) => val ? `${key}=${val}` : '';

    // cache key generation v2: includes field keys as specified in the `cacheFields`
    // static property on the model constructor
    fields = ModelMap[modelKey].cacheFields.map(
      (key) => typeof key === 'function' ?
        Object.entries(key(data)).map(toKeyValString).join('_') :
        toKeyValString([key, options[key] || attributes[key] || data[key]])
    ).filter((x) => x);
  }

  return `${modelKey || ''}${fields.sort().join('_')}`;
}

/**
 * Builds an object of loading states for resources, so that, for example,
 * before a fetch or refetch, all resource states are changed to LOADING.
 * Resources with dependencies that are not all present are put into a
 * 'PENDING' state.
 *
 * @param {array[]} resources - list of resource config entries for fetching
 * @param {object} props - current component props
 * @return {object} state object with resource state keys as keys and the loading
 *    state as values
 */
function buildResourcesLoadingState(resources, props) {
  return resources.reduce((state, [name, config]) => ({
    ...state,
    [getResourceState(name)]: shouldBypassFetch(props, [name, config]) ?
      LoadingStates.LOADED :
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
 * @return {Schmackbone.Model|Schmackbone.Collection?} model from the cache
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

export default withResources;
