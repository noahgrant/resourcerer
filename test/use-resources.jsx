import * as Request from '../lib/request';

import {
  EMPTY_COLLECTION,
  EMPTY_MODEL,
  getCacheKey,
  useResources
} from '../lib/index';
import {hasErrored, hasLoaded, isLoading, noOp} from '../lib/utils';
import {ModelMap, ResourceKeys, ResourcesConfig} from '../lib/config';

import {findRenderedComponentWithType} from 'react-dom/test-utils';
import {LoadingStates} from '../lib/constants';
import ModelCache from '../lib/model-cache';
import React from 'react';
import ReactDOM from 'react-dom';
import Schmackbone from 'schmackbone';
import {UserModel} from './model-mocks';
import {waitsFor} from './test-utils';

var measure;

const transformSpy = jasmine.createSpy('transform');
const jasmineNode = document.createElement('div');

const getResources = (props) => ({
  [ResourceKeys.ANALYSTS]: {noncritical: true, options: {noResolve: props.noResolve}},
  [ResourceKeys.DECISIONS]: {
    ...(props.includeDeleted ? {data: {include_deleted: true}} : {}),
    listen: true,
    measure,
    status: props.status
  },
  [ResourceKeys.NOTES]: {noncritical: true, dependsOn: ['noah']},
  [ResourceKeys.USER]: {
    options: {
      userId: props.userId,
      fraudLevel: props.fraudLevel,
      ...(props.delay ? {delay: props.delay} : {}),
      ...(props.shouldError ? {shouldError: true} : {})
    }
  },
  ...props.prefetch ? {
    [ResourceKeys.SEARCH_QUERY]: {
      data: {from: props.page},
      prefetches: [{page: props.page + 10}]
    }
  } : {},
  ...props.fetchSignals ? {[ResourceKeys.SIGNALS]: {}} : {},
  ...props.serial ? {
    [ResourceKeys.ACTIONS]: {
      provides: props.spread ?
        {_: transformSpy.and.returnValue({provides1: 'moose', provides2: 'theberner'})} :
        {serialProp: transformSpy.and.returnValue(42)}
    },
    [ResourceKeys.DECISION_LOGS]: {
      options: {logs: props.serialProp},
      dependsOn: ['serialProp']
    }
  } : {},
  ...props.customName ? {
    customDecisions: {
      modelKey: ResourceKeys.DECISIONS,
      status: true,
      provides: {sift: () => 'science'}
    }
  } : {},
  ...props.unfetch ? {[ResourceKeys.ACCOUNT_CONFIG]: {}} : {}
});

/**
 * Note we need to ensure the component has loaded in most cases before we
 * unmount so that we don't empty the cache before the models get loaded.
 */
describe('useResources', () => {
  var originalPerf = window.performance,
      dataChild,
      resources,

      requestSpy,
      shouldResourcesError,
      cached,
      delayedResourceComplete,

      defaultProps = {
        userId: 'noah',
        fraudLevel: 'high',
        page: 0
      },

      renderUseResources = (props={}) =>
        ReactDOM.render(<TestWrapper {...defaultProps} {...props} />, jasmineNode);

  beforeEach(() => {
    UserModel.realCacheFields = UserModel.cacheFields;
    UserModel.cacheFields = ['userId', 'fraudLevel'];
    document.body.appendChild(jasmineNode);

    requestSpy = spyOn(Request, 'default').and.callFake((key, Model, options) => {
      // mock fetch model cache behavior, where we put it in the cache immediately,
      // then request the model, and only if it errors do we remove it from cache
      var model = new Schmackbone.Model({key, ...(options.data || {})});

      ModelCache.put(key, model, options.component);

      return new Promise((res, rej) => {
        if ((options.options || {}).noResolve) {
          return;
        }

        if ((options.options || {}).delay) {
          return window.setTimeout(() => {
            delayedResourceComplete = true;
            ModelCache.remove(key);
            rej(model);
          }, options.options.delay);
        }

        if (cached) {
          // treat model as though it were cached by resolving promise immediately
          return res(model);
        }

        // put requests in a RAF to 'mimic' the procession of non-cached
        // resources (ie, loading states get set because we don't immediately
        // resolve the promise)
        window.requestAnimationFrame(() => {
          if (shouldResourcesError || (options.options || {}).shouldError) {
            model.status = 404;
            ModelCache.remove(key);

            rej(model);
          } else {
            model.status = 200;
            res(model);
          }
        });
      });
    });

    // phantomjs has a performance object, but no individual methods
    window.performance = {
      mark: noOp,
      measure: noOp,
      getEntriesByName: () => [{duration: 5}],
      clearMarks: noOp,
      clearMeasures: noOp,
      now: noOp
    };

    spyOn(ModelCache, 'put').and.callThrough();
    spyOn(ModelCache, 'unregister').and.callThrough();
  });

  afterEach(() => {
    UserModel.cacheFields = UserModel.realCacheFields;

    window.performance = originalPerf;
    unmountAndClearModelCache();
    jasmineNode.remove();
    shouldResourcesError = false;
  });

  it('fetches all resources before mounting', async(done) => {
    requestSpy.and.returnValue({then: (res) => ({catch: () => false})});
    dataChild = findDataChild(renderUseResources());

    await waitsFor(() => requestSpy.calls.count());
    expect(requestSpy.calls.count()).toEqual(3);

    done();
  });

  it('passed loading states for all resources down as props', async(done) => {
    dataChild = findDataChild(renderUseResources());
    expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADING);
    expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADING);
    expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADING);
    expect(dataChild.props.notesLoadingState).toBe(LoadingStates.PENDING);

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADED);
    expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADED);
    expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADED);
    expect(dataChild.props.notesLoadingState).toBe(LoadingStates.PENDING);
    done();
  });

  it('resources marked as noncritical don\'t factor into the loading props', async(done) => {
    dataChild = findDataChild(renderUseResources({noResolve: true}));

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(dataChild.props.analystsLoadingState).toEqual(LoadingStates.LOADING);
    expect(dataChild.props.hasLoaded).toBe(true);
    expect(dataChild.props.hasInitiallyLoaded).toBe(true);
    expect(dataChild.props.isLoading).toBe(false);
    expect(dataChild.props.hasErrored).toBe(false);
    done();
  });

  it('resource keys get turned into props of the same name, with \'Model\' or ' +
      '\'Collection\' appended as appropriate', async(done) => {
    dataChild = findDataChild(renderUseResources());

    await waitsFor(() => dataChild.props.hasLoaded);

    // keys in this case represent the returned models (since we're stubbing fetch)
    expect(dataChild.props.decisionsCollection.get('key')).toEqual(ResourceKeys.DECISIONS);
    expect(dataChild.props.userModel.get('key')).toBe('userfraudLevel=high_userId=noah');
    expect(dataChild.props.analystsCollection.get('key')).toBe(ResourceKeys.ANALYSTS);

    done();
  });

  it('returns a setResourceState function that allows it to change resource-related props',
    async(done) => {
      dataChild = findDataChild(renderUseResources());
      expect(dataChild.props.userId).toEqual('noah');

      dataChild.props.setResourceState({userId: 'alex'});
      expect(dataChild.props.userId).toEqual('alex');
      await waitsFor(() => dataChild.props.hasLoaded);
      done();
    });

  describe('updates a resource', () => {
    it('when its cache key changes with props', async(done) => {
      // decisions collection should update when passed `include_deleted`,
      // since that exists on its cacheFields property
      resources = renderUseResources();

      await waitsFor(() => requestSpy.calls.count());
      expect(requestSpy.calls.count()).toEqual(3);

      findDataChild(resources).props.setResourceState({includeDeleted: true});
      await waitsFor(() => requestSpy.calls.count() === 4);

      expect(requestSpy.calls.mostRecent().args[0]).toEqual('decisionsinclude_deleted=true');
      expect(requestSpy.calls.mostRecent().args[1]).toEqual(ModelMap[ResourceKeys.DECISIONS]);
      expect(requestSpy.calls.mostRecent().args[2].data).toEqual({include_deleted: true});

      await waitsFor(() => findDataChild(resources).props.hasLoaded);

      done();
    });

    it('when all its dependencies are present for the first time', async(done) => {
      dataChild = findDataChild(renderUseResources());
      expect(dataChild.props.notesLoadingState).toEqual(LoadingStates.PENDING);

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(requestSpy.calls.count()).toEqual(3);
      dataChild.props.setResourceState({noah: true});

      await waitsFor(() => dataChild.props.notesLoadingState !== LoadingStates.PENDING);

      expect(requestSpy.calls.count()).toEqual(4);

      // dependsOn prop won't factor into cache key unless part of fields
      expect(requestSpy.calls.mostRecent().args[0]).toEqual('notes');
      expect(requestSpy.calls.mostRecent().args[1]).toEqual(ModelMap[ResourceKeys.NOTES]);

      await waitsFor(() => dataChild.props.notesLoadingState === LoadingStates.LOADED);

      done();
    });
  });

  describe('unregisters the component from the ModelCache', () => {
    var componentRef;

    beforeEach(async(done) => {
      dataChild = findDataChild(renderUseResources());
      await waitsFor(() => dataChild.props.hasLoaded);
      componentRef = requestSpy.calls.mostRecent().args[2].component;
      done();
    });

    it('when a dependent resource\'s prop changes', async(done) => {
      expect(ModelCache.unregister).not.toHaveBeenCalled();
      dataChild.props.setResourceState({userId: 'zorah'});

      await waitsFor(() => ModelCache.unregister.calls.count());

      expect(ModelCache.unregister).toHaveBeenCalledWith(
        componentRef,
        'userfraudLevel=high_userId=noah'
      );
      done();
    });

    it('when a component unmounts', async(done) => {
      expect(ModelCache.unregister).not.toHaveBeenCalled();
      unmountAndClearModelCache();

      await waitsFor(() => ModelCache.unregister.calls.count());

      expect(ModelCache.unregister).toHaveBeenCalledWith(componentRef);

      done();
    });
  });

  it('fetches a resource if newly specified', async(done) => {
    resources = renderUseResources();

    await waitsFor(() => requestSpy.calls.count());

    expect(requestSpy.calls.count()).toEqual(3);
    expect(requestSpy.calls.all().map((call) => call.args[0])
        .includes(ResourceKeys.SIGNALS)).toBe(false);

    findDataChild(resources).props.setResourceState({fetchSignals: true});

    await waitsFor(() => requestSpy.calls.count() === 4);

    expect(requestSpy.calls.mostRecent().args[0]).toEqual(ResourceKeys.SIGNALS);
    expect(requestSpy.calls.mostRecent().args[1]).toEqual(ModelMap[ResourceKeys.SIGNALS]);

    await waitsFor(() => findDataChild(resources).props.hasLoaded);
    done();
  });

  it('listens to all resources', async(done) => {
    spyOn(Schmackbone.Model.prototype, 'on');

    dataChild = findDataChild(renderUseResources());

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(Schmackbone.Model.prototype.on.calls.count()).toEqual(3);
    expect(Schmackbone.Model.prototype.on.calls.argsFor(0)[2])
        .toEqual(dataChild.props.analystsCollection);
    expect(Schmackbone.Model.prototype.on.calls.argsFor(1)[2])
        .toEqual(dataChild.props.decisionsCollection);
    expect(Schmackbone.Model.prototype.on.calls.argsFor(2)[2])
        .toEqual(dataChild.props.userModel);

    done();
  });

  it('does not fetch resources that are passed in via props', async(done) => {
    resources = renderUseResources({
      userModel: new Schmackbone.Model(),
      analystsCollection: new Schmackbone.Collection(),
      decisionsCollection: new Schmackbone.Collection()
    });

    await waitsFor(() => findDataChild(resources).props.hasLoaded);

    expect(requestSpy).not.toHaveBeenCalled();
    ReactDOM.unmountComponentAtNode(jasmineNode);
    await waitsFor(() => ModelCache.unregister.calls.count());

    // the models passed down are not fetched
    resources = renderUseResources({
      userModel: new Schmackbone.Model(),
      decisionsCollection: new Schmackbone.Collection()
    });

    await waitsFor(() => requestSpy.calls.count());

    expect(requestSpy.calls.count()).toEqual(1);
    expect(requestSpy.calls.mostRecent().args[0]).toEqual('analysts');
    done();
  });

  it('does not set loading states if the component unmounts before the request returns',
    async(done) => {
      var nextTick;

      spyOn(Schmackbone.Model.prototype, 'on');
      dataChild = findDataChild(renderUseResources());

      // start mock clock now because we need to make assertions between when
      // the component is removed and when we want the models to be removed
      jasmine.clock().install();
      ReactDOM.unmountComponentAtNode(jasmineNode);
      window.requestAnimationFrame(() => nextTick = true);

      // wait til the next tick to ensure our resources have been 'fetched'
      await waitsFor(() => nextTick);

      expect(Schmackbone.Model.prototype.on).not.toHaveBeenCalled();
      expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADING);
      expect(dataChild.props.analystsLoadingState).toEqual(LoadingStates.LOADING);
      expect(dataChild.props.userLoadingState).toEqual(LoadingStates.LOADING);

      // now finish model removal
      jasmine.clock().tick(150000);
      jasmine.clock().uninstall();
      done();
    });

  it('prioritizes critical resource requests before noncritical requests before prefetch',
    async(done) => {
      renderUseResources({prefetch: true});
      await waitsFor(() => requestSpy.calls.count() === 5);

      expect(requestSpy.calls.argsFor(0)[0]).toEqual('decisions');
      expect(requestSpy.calls.argsFor(1)[0]).toEqual('userfraudLevel=high_userId=noah');
      expect(requestSpy.calls.argsFor(2)[0]).toEqual('searchQuery');
      expect(requestSpy.calls.argsFor(2)[2].prefetch).not.toBeDefined();
      // noncritical call is second-to-last
      expect(requestSpy.calls.argsFor(3)[0]).toEqual('analysts');
      // prefetch call is last
      expect(requestSpy.calls.argsFor(4)[0]).toEqual('searchQueryfrom=10');
      expect(requestSpy.calls.argsFor(4)[2].prefetch).toBeDefined();

      done();
    });

  it('passes a false \'fetch\' option if the model key is of an unfetched model', async(done) => {
    requestSpy.and.returnValue(Promise.resolve());
    renderUseResources({unfetch: true});

    await waitsFor(() => requestSpy.calls.count());

    expect(requestSpy.calls.argsFor(0)[2].fetch).toBe(true);
    expect(requestSpy.calls.argsFor(1)[2].fetch).toBe(true);
    // third call is the unfetched resource
    expect(requestSpy.calls.argsFor(2)[0]).toEqual('accountConfig');
    expect(requestSpy.calls.argsFor(2)[2].fetch).toBe(false);
    expect(requestSpy.calls.argsFor(3)[2].fetch).toBe(true);
    done();
  });

  describe('creates a cache key', () => {
    describe('when a model has a cacheFields property', () => {
      it('with the ResourceKey as the base, keys from the cacheFields, ' +
          'and values from \'data\'', () => {
        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          data: {
            userId: 'noah',
            fraudLevel: 'high',
            lastName: 'grant'
          }
        })).toEqual('userfraudLevel=high_userId=noah');

        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          data: {
            userId: 'alex',
            fraudLevel: 'low',
            lastName: 'lopatron'
          }
        })).toEqual('userfraudLevel=low_userId=alex');
      });

      it('prioritizes cacheFields in \'options\' or \'attributes\' config properties', () => {
        expect(getCacheKey({
          attributes: {fraudLevel: 'miniscule'},
          modelKey: ResourceKeys.USER,
          options: {userId: 'theboogieman'}
        })).toEqual('userfraudLevel=miniscule_userId=theboogieman');
      });

      it('can invoke a cacheFields function entry', () => {
        UserModel.cacheFields = ['userId',
          ({fraudLevel, lastName}) => ({
            fraudLevel: fraudLevel + lastName,
            lastName
          })];

        expect(getCacheKey({
          attributes: {userId: 'noah'},
          modelKey: ResourceKeys.USER,
          data: {
            fraudLevel: 'high',
            lastName: 'grant'
          }
        })).toEqual('userfraudLevel=highgrant_lastName=grant_userId=noah');
      });
    });
  });

  describe('does not update resource loading state if the fetched resource is not current', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      delayedResourceComplete = null;
      cached = null;
      jasmine.clock().uninstall();
    });

    it('for a non-cached resource', async(done) => {
      dataChild = findDataChild(renderUseResources({delay: 5000}));

      await waitsFor(() => requestSpy.calls.count() === 3);

      dataChild = findDataChild(renderUseResources({userId: 'zorah'}));

      await waitsFor(() => dataChild.props.hasLoaded);

      await waitsFor(() => requestSpy.calls.count() === 4);
      jasmine.clock().tick(6000);

      await waitsFor(() => delayedResourceComplete);
      // even though old resource errored, we're still in a loaded state!
      expect(dataChild.props.hasLoaded).toBe(true);
      done();
    });

    it('for a cached resource', async(done) => {
      // this test is just to ensure that, when a cached resource is requested
      // on an update (via cWRP), which means it resolves its promise
      // immediately, that the loading state is still set (because the cache key,
      // which uses nextProps in cWRP, should equal the cache key check in the
      // resolve handler, which uses this.props.
      dataChild = findDataChild(renderUseResources({shouldError: true}));

      await waitsFor(() => dataChild.props.hasErrored);
      expect(dataChild.props.userLoadingState).toEqual(LoadingStates.ERROR);

      // trigger cWRP with a new user, but the user that's 'already cached'
      cached = true;
      dataChild = findDataChild(renderUseResources({userId: 'zorah', fraudLevel: null}));

      // now assert that we turn back to a loaded state from the cached resource
      await waitsFor(() => dataChild.props.hasLoaded);
      expect(dataChild.props.userModel.get('key')).toEqual('useruserId=zorah');
      done();
    });
  });

  describe('passes down empty models or collections', () => {
    it('for pending or errored resources (because their keys are not in cache)', async(done) => {
      dataChild = findDataChild(renderUseResources());

      await waitsFor(() => dataChild.props.hasLoaded);
      // these are our two critical resources, whose models have been placed in
      // the cache before fetching
      expect(dataChild.props.decisionsCollection).not.toEqual(EMPTY_COLLECTION);
      expect(dataChild.props.userModel).not.toEqual(EMPTY_MODEL);

      // however, this is a pending resource, so it should not be in the cache
      expect(dataChild.props.notesModel).toEqual(EMPTY_MODEL);

      unmountAndClearModelCache();

      // the models are removed from the cache after erroring
      shouldResourcesError = true;
      dataChild = findDataChild(renderUseResources());

      await waitsFor(() => dataChild.props.hasErrored);

      expect(dataChild.props.decisionsCollection).toEqual(EMPTY_COLLECTION);
      expect(dataChild.props.userModel).toEqual(EMPTY_MODEL);
      done();
    });

    it('that cannot be modified', async(done) => {
      var decisionsCollection,
          userModel;

      shouldResourcesError = true;
      dataChild = findDataChild(renderUseResources());

      await waitsFor(() => dataChild.props.hasErrored);
      // we know these are the empty models from the previous test
      ({decisionsCollection, userModel} = dataChild.props);

      expect(() => decisionsCollection.frontend = 'farmers').toThrow();
      expect(decisionsCollection.frontend).not.toBeDefined();
      expect(() => userModel.frontend = 'farmers').toThrow();
      expect(userModel.frontend).not.toBeDefined();

      expect(() => decisionsCollection.models.push({frontend: 'farmers'})).toThrow();
      expect(decisionsCollection.length).toEqual(0);
      decisionsCollection.add({frontend: 'farmers'});
      expect(decisionsCollection.length).toEqual(0);

      expect(() => userModel.attributes.frontend = 'farmers').toThrow();
      expect(userModel.attributes.frontend).not.toBeDefined();
      userModel.set('frontend', 'farmers');
      expect(userModel.attributes.frontend).not.toBeDefined();

      done();
    });
  });

  describe('if a model has a \'providesModels\' function', () => {
    // let's say user model provides two unfetched models:
    // a decision instance and a label instance
    var oldProvides,
        newProvides,
        componentRef;

    beforeEach(() => {
      newProvides = [{
        attributes: {content_abuse: {id: 'content_decision'}},
        shouldCache: () => true,
        modelKey: ResourceKeys.DECISION_INSTANCE,
        options: {entityId: 'noah', entityType: 'content'}
      }, {
        modelKey: ResourceKeys.LABEL_INSTANCE,
        options: {userId: 'noah'}
      }];
    });

    afterEach(() => {
      Request.default.calls.reset();
      ModelCache.put.calls.reset();
      ModelMap[ResourceKeys.USER].providesModels = oldProvides;
    });

    it('caches instantiated unfetched models when the parent model returns', async(done) => {
      ModelMap[ResourceKeys.USER].providesModels = () => newProvides;
      dataChild = findDataChild(renderUseResources());

      await waitsFor(() => dataChild.props.hasLoaded);
      componentRef = requestSpy.calls.mostRecent().args[2].component;

      expect(ModelCache.put.calls.count()).toEqual(5);
      expect(ModelCache.put.calls.argsFor(3)[0])
          .toEqual('decisionInstanceentityId=noah_entityType=content');
      expect(ModelCache.put.calls.argsFor(3)[1] instanceof ModelMap[ResourceKeys.DECISION_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.calls.argsFor(3)[2]).toEqual(componentRef);

      expect(ModelCache.put.calls.argsFor(4)[0])
          .toEqual('labelInstanceuserId=noah');
      expect(ModelCache.put.calls.argsFor(4)[1] instanceof ModelMap[ResourceKeys.LABEL_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.calls.argsFor(4)[2]).toEqual(componentRef);

      done();
    });

    it('updates previously existing models if they exist', async(done) => {
      var testModel = new Schmackbone.Model({content_abuse: {id: 'another_content_decision'}}),
          testKey = 'decisionInstanceentityId=noah_entityType=content';

      ModelMap[ResourceKeys.USER].providesModels = () => newProvides;
      ModelCache.put(testKey, testModel);
      ModelCache.put.calls.reset();
      expect(ModelCache.get(testKey).get('content_abuse').id).toEqual('another_content_decision');

      dataChild = findDataChild(renderUseResources());

      await waitsFor(() => dataChild.props.hasLoaded);
      componentRef = requestSpy.calls.mostRecent().args[2].component;

      expect(ModelCache.put.calls.count()).toEqual(4);
      // model cache is called, but never for our existing model
      expect([
        ModelCache.put.calls.argsFor(0)[0],
        ModelCache.put.calls.argsFor(1)[0],
        ModelCache.put.calls.argsFor(2)[0],
        ModelCache.put.calls.argsFor(3)[0]
      ]).not.toContain(testKey);

      // label still gets called!
      expect(ModelCache.put.calls.argsFor(3)[0])
          .toEqual('labelInstanceuserId=noah');
      expect(ModelCache.put.calls.argsFor(3)[1] instanceof ModelMap[ResourceKeys.LABEL_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.calls.argsFor(3)[2]).toEqual(componentRef);

      // same test model should exist at the test key
      expect(ModelCache.get(testKey)).toEqual(testModel);
      // but its contents have been changed!
      expect(ModelCache.get(testKey).get('content_abuse').id).toEqual('content_decision');

      // need to manually remove this model since we manually added it without a component
      // that _should_ get it automatically scheduled for removal, but that removal will get
      // canceled when our component mounts. this may indicate a bug...
      ModelCache.remove(testKey);
      done();
    });

    it('does nothing if the shouldCache function returns false', async(done) => {
      ModelMap[ResourceKeys.USER].providesModels = () => newProvides.map((config) => ({
        ...config,
        shouldCache: () => false
      }));
      renderUseResources();

      await waitsFor(() => Request.default.calls.count() === 3);
      expect(ModelCache.put.calls.count()).toEqual(3);
      done();
    });
  });

  describe('has a \'measure\' option', () => {
    var markCount = 0,
        markName = '',
        measureCount = 0,
        measureName = '';

    beforeEach(() => {
      spyOn(ResourcesConfig, 'track');
      // React 16 calls the performance object all over the place, so we can't
      // really count on the spying directly for tests. We kinda need to hack
      // around it.
      spyOn(window.performance, 'mark').and.callFake((...args) => {
        if (args[0] === 'decisions') {
          markCount++;
          markName = args[0];

          return;
        }

        return originalPerf.mark(...args);
      });

      spyOn(window.performance, 'measure').and.callFake((...args) => {
        if (args[0] === 'decisionsFetch') {
          measureCount++;
          measureName = args[1];

          return;
        }

        return originalPerf.measure(...args);
      });
    });

    afterEach(() => {
      markCount = 0;
      markName = '';
      measureCount = 0;
      measureName = '';
    });

    it('that does not measure by default', async(done) => {
      dataChild = findDataChild(renderUseResources());

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(markCount).toEqual(0);
      expect(measureCount).toEqual(0);
      expect(ResourcesConfig.track).not.toHaveBeenCalled();
      done();
    });

    describe('that when set to true', () => {
      beforeEach(async(done) => {
        measure = true;
        spyOn(ModelCache, 'get').and.returnValue(undefined);
        dataChild = findDataChild(renderUseResources());
        await waitsFor(() => dataChild.props.hasLoaded);
        done();
      });

      it('measures the request time', () => {
        expect(markName).toEqual(ResourceKeys.DECISIONS);
        expect(measureCount).toEqual(1);
        expect(measureName).toEqual(ResourceKeys.DECISIONS);
      });

      it('tracks the request', () => {
        expect(ResourcesConfig.track).toHaveBeenCalledWith('API Fetch', {
          Resource: ResourceKeys.DECISIONS,
          data: undefined,
          options: undefined,
          duration: 5
        });
      });
    });
  });

  describe('for a resource with a \'dependsOn\' option', () => {
    beforeEach(async(done) => {
      dataChild = findDataChild(renderUseResources({serial: true}));

      await waitsFor(() => requestSpy.calls.count());
      done();
    });

    it('will not fetch until the dependent prop is available', async(done) => {
      expect(requestSpy.calls.count()).toEqual(4);
      expect(requestSpy.calls.all().map((call) => call.args[0])
          .includes(ResourceKeys.ACTIONS)).toBe(true);
      expect(requestSpy.calls.mostRecent().args[0]).not.toMatch(ResourceKeys.DECISION_LOGS);

      await waitsFor(() => dataChild.props.serialProp);
      expect(requestSpy.calls.count()).toEqual(5);
      expect(requestSpy.calls.mostRecent().args[0]).toMatch(ResourceKeys.DECISION_LOGS);
      done();
    });

    it('reverts back to pending state if its dependencies are removed', async(done) => {
      expect(dataChild.props.decisionLogsLoadingState).toEqual(LoadingStates.PENDING);

      await waitsFor(() => dataChild.props.serialProp);
      expect(isLoading(dataChild.props.decisionLogsLoadingState)).toBe(true);
      expect(requestSpy.calls.mostRecent().args[0]).toMatch(ResourceKeys.DECISION_LOGS);

      await waitsFor(() => hasLoaded(dataChild.props.decisionLogsLoadingState));
      dataChild.props.setResourceState((state) => ({...state, serialProp: null}));

      await waitsFor(() => dataChild.props.decisionLogsLoadingState === LoadingStates.PENDING);
      expect(!!dataChild.props.serialProp).toBe(false);
      // we have a new model cache key for the dependent model because
      // the value of serialProp has changed. so the cache lookup should
      // again be empty
      expect(dataChild.props.decisionLogsCollection).toEqual(EMPTY_COLLECTION);
      done();
    });
  });

  describe('for a resource with a \'provides\' option', () => {
    it('will set the provided prop from its resource via the transform value', async(done) => {
      var actionsModel;

      dataChild = findDataChild(renderUseResources({serial: true}));

      expect(dataChild.props.serialProp).not.toBeDefined();
      expect(transformSpy).toHaveBeenCalled();
      actionsModel = transformSpy.calls.mostRecent().args[0];
      expect(actionsModel instanceof Schmackbone.Model).toBe(true);
      expect(actionsModel.get('key')).toEqual(ResourceKeys.ACTIONS);

      await waitsFor(() => dataChild.props.serialProp);
      expect(dataChild.props.serialProp).toEqual(42);
      done();
    });

    it('will set dynamic props if passed the spread character as a key', async(done) => {
      var actionsModel;

      dataChild = findDataChild(renderUseResources({serial: true, spread: true}));

      expect(dataChild.props.provides1).not.toBeDefined();
      expect(dataChild.props.provides2).not.toBeDefined();
      expect(transformSpy).toHaveBeenCalled();

      actionsModel = transformSpy.calls.mostRecent().args[0];
      expect(actionsModel instanceof Schmackbone.Model).toBe(true);
      expect(actionsModel.get('key')).toEqual(ResourceKeys.ACTIONS);

      await waitsFor(() => dataChild.props.provides1);
      expect(dataChild.props.provides1).toEqual('moose');
      expect(dataChild.props.provides2).toEqual('theberner');
      done();
    });
  });

  describe('accepts an array of configuration options', () => {
    it('that passes the first entry down as the model prop', async(done) => {
      dataChild = findDataChild(renderUseResources({prefetch: true}));

      // first entry has data: {from: 0}
      await waitsFor(() => dataChild.props.hasLoaded);
      expect(dataChild.props.searchQueryModel.get('from')).toEqual(0);
      done();
    });

    describe('that prefetches the other entries', () => {
      it('and does not send them down as props', async(done) => {
        dataChild = findDataChild(renderUseResources({prefetch: true}));

        await waitsFor(() => requestSpy.calls.count() === 5);

        // should have two search query calls, but the props on searchQueryModel
        // should have from = 0
        expect(requestSpy.calls.all()
            .map((call) => call.args[0])
            .filter((key) => /^searchQuery/.test(key)).length).toEqual(2);

        await waitsFor(() => dataChild.props.hasLoaded);
        expect(dataChild.props.searchQueryModel.get('from')).toEqual(0);
        done();
      });

      it('that are not taken into account for component loading states', async(done) => {
        var prefetchLoading = true,
            prefetchError,
            searchQueryLoading,
            haveCalledPrefetch,
            haveCalledSearchQuery;

        requestSpy.and.callFake((key, Model, options={}) => new Promise((res, rej) => {
          window.requestAnimationFrame(() => {
            var model = new Schmackbone.Model({key, ...(options.data || {})});

            if (options.prefetch) {
              haveCalledPrefetch = true;

              // never-resolving promise to mock long-loading request
              if (prefetchLoading) {
                return false;
              } else if (prefetchError) {
                return rej(model);
              }

              ModelCache.put(key, model, options.component);
              res(model);
            } else {
              if (/searchQuery/.test(key) && searchQueryLoading) {
                haveCalledSearchQuery = true;

                return false;
              }

              ModelCache.put(key, model, options.component);
              res(model);
            }
          });
        }));

        dataChild = findDataChild(renderUseResources({prefetch: true}));

        // first test the case where the prefetch takes a long time--we should still be in
        // a loaded state
        await waitsFor(() => dataChild.props.searchQueryModel && haveCalledPrefetch);
        expect(dataChild.props.hasLoaded).toBe(true);

        ReactDOM.unmountComponentAtNode(jasmineNode);
        prefetchLoading = false;
        prefetchError = true;
        haveCalledPrefetch = false;
        dataChild = findDataChild(renderUseResources({prefetch: true}));

        // now test when the prefetch has errored--we should still be in a loaded state
        await waitsFor(() => dataChild.props.searchQueryModel && haveCalledPrefetch);
        expect(dataChild.props.hasLoaded).toBe(true);

        ReactDOM.unmountComponentAtNode(jasmineNode);
        prefetchError = false;
        searchQueryLoading = true;
        haveCalledPrefetch = false;
        dataChild = findDataChild(renderUseResources({prefetch: true}));

        // finally, let's say the prefetch resolves but our first query is still loading.
        // we should be in a loading state.
        await waitsFor(() => haveCalledPrefetch && haveCalledSearchQuery);
        expect(dataChild.props.isLoading).toBe(true);

        searchQueryLoading = false;
        haveCalledPrefetch = false;
        haveCalledSearchQuery = false;
        done();
      });
    });
  });

  describe('for a response with \'status\'', () => {
    it('sets the status when resource loads', async(done) => {
      dataChild = findDataChild(renderUseResources({status: true}));
      expect(dataChild.props.decisionsLoadingState).toBe(LoadingStates.LOADING);
      expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADING);
      expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADING);
      expect(dataChild.props.decisionsStatus).toEqual(undefined);
      expect(dataChild.props.userStatus).toEqual(undefined);
      expect(dataChild.props.analystsStatus).toEqual(undefined);

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(dataChild.props.decisionsLoadingState).toBe(LoadingStates.LOADED);
      expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADED);
      expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADED);
      expect(dataChild.props.decisionsStatus).toBe(200);
      expect(dataChild.props.userStatus).toEqual(undefined);
      expect(dataChild.props.analystsStatus).toEqual(undefined);
      done();
    });

    it('sets the status when resource errors', async(done) => {
      shouldResourcesError = true;
      dataChild = findDataChild(renderUseResources({status: true}));
      expect(dataChild.props.decisionsLoadingState).toBe(LoadingStates.LOADING);
      expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADING);
      expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADING);
      expect(dataChild.props.decisionsStatus).toEqual(undefined);
      expect(dataChild.props.userStatus).toEqual(undefined);
      expect(dataChild.props.analystsStatus).toEqual(undefined);

      await waitsFor(() => dataChild.props.hasErrored && !dataChild.props.isLoading);

      expect(dataChild.props.decisionsLoadingState).toBe(LoadingStates.ERROR);
      expect(dataChild.props.userLoadingState).toBe(LoadingStates.ERROR);
      expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.ERROR);
      expect(dataChild.props.decisionsStatus).toBe(404);
      expect(dataChild.props.userStatus).toEqual(undefined);
      expect(dataChild.props.analystsStatus).toEqual(undefined);
      done();
    });
  });

  it('sets an error state when a resource errors, but does not log', async(done) => {
    spyOn(ResourcesConfig, 'log');
    shouldResourcesError = true;
    dataChild = findDataChild(renderUseResources());
    expect(isLoading(dataChild.props.decisionsLoadingState)).toBe(true);

    await waitsFor(() => dataChild.props.hasErrored);
    expect(hasErrored(dataChild.props.decisionsLoadingState)).toBe(true);
    expect(ResourcesConfig.log).not.toHaveBeenCalled();
    done();
  });

  it('accepts custom resource names for local model, loading state, and status names',
    async(done) => {
      dataChild = findDataChild(renderUseResources({customName: true}));

      await waitsFor(() => requestSpy.calls.count() === 4);

      expect(requestSpy.calls.all().map((call) => call.args[0])).toEqual([
        'decisions',
        'userfraudLevel=high_userId=noah',
        'decisions',
        'analysts'
      ]);

      expect(dataChild.props.decisionsLoadingState).toEqual('loading');
      expect(dataChild.props.customDecisionsLoadingState).toEqual('loading');
      expect(dataChild.props.sift).not.toBeDefined();

      await waitsFor(() => dataChild.props.hasLoaded);
      expect(dataChild.props.decisionsCollection.get('key')).toEqual('decisions');
      // key should be the same as for decisions, signaling that while fetch is
      // called ones for each resource, only one fetch would be made
      expect(dataChild.props.customDecisionsCollection.get('key')).toEqual('decisions');
      expect(dataChild.props.decisionsLoadingState).toEqual('loaded');
      expect(dataChild.props.customDecisionsLoadingState).toEqual('loaded');
      expect(dataChild.props.customDecisionsStatus).toEqual(200);
      expect(dataChild.props.sift).toEqual('science');
      done();
    });
});

/**
 * Unmount react test component and install clock mock to ensure that all
 * models have been removed for the next test.
 */
function unmountAndClearModelCache() {
  jasmine.clock().install();
  ReactDOM.unmountComponentAtNode(jasmineNode);
  jasmine.clock().tick(150000);
  jasmine.clock().uninstall();
}

// we wrap our functional component that uses useResources with React classes
// just as a cheap way of being able to use React's TestUtils methods
class TestChildren extends React.Component {
  render() {
    return <div />;
  }
}

function TestComponent(props) {
  var resources = useResources(getResources, props);

  return <TestChildren {...props} {...resources} />;
}

class TestWrapper extends React.Component {
  render() {
    return (
      <TestComponent {...this.props} />
    );
  }
}

function findDataChild(wrapper) {
  return findRenderedComponentWithType(wrapper, TestChildren);
}
