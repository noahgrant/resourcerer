import * as Request from '../lib/request';

import {
  AnalystsCollection,
  DecisionLogsCollection,
  DecisionsCollection,
  NotesModel,
  UserModel
} from './model-mocks';
import {
  findRenderedComponentWithType,
  scryRenderedDOMComponentsWithClass
} from 'react-dom/test-utils';
import {getCacheKey, withResources} from '../lib/resourcerer';
import {hasErrored, hasLoaded, isLoading, isPending, noOp} from '../lib/utils';
import {ModelMap, ResourceKeys, ResourcesConfig} from '../lib/config';

import Collection from '../lib/collection';
import ErrorBoundary from '../lib/error-boundary';
import {LoadingStates} from '../lib/constants';
import Model from '../lib/model';
import ModelCache from '../lib/model-cache';
import React from 'react';
import ReactDOM from 'react-dom';
import {waitsFor} from './test-utils';

var measure,
    causeLogicError;

const transformSpy = jest.fn();
const renderNode = document.createElement('div');

// we wrap our functional component that uses withResources with React classes
// just as a cheap way of being able to use React's TestUtils methods
class DefaultTestChildren extends React.Component {
  render() {
    return <div />;
  }
}

@withResources(({
  ACCOUNT_CONFIG,
  ACTIONS,
  ANALYSTS,
  DECISIONS,
  DECISION_LOGS,
  NOTES,
  SEARCH_QUERY,
  USER
}, props) => ({
  [ANALYSTS]: {
    noncritical: true,
    params: {shouldError: props.analystsError}
  },
  [DECISIONS]: {
    ...(props.includeDeleted ? {params: {include_deleted: true}} : {}),
    lazy: props.lazy,
    measure
  },
  [NOTES]: {data: {pretend: true}, noncritical: true, dependsOn: ['noah']},
  [USER]: {
    data: {id: props.withId ? props.userId : null},
    params: {
      ...(props.shouldError ? {shouldError: true} : {}),
      ...(props.delay ? {delay: props.delay} : {})
    },
    options: {userId: props.userId, fraudLevel: props.fraudLevel}
  },
  ...(props.prefetch ? {
    [SEARCH_QUERY]: {
      params: {from: props.page},
      prefetches: [{page: props.page + 10}]
    }
  } : {}),
  ...(props.fetchSignals ? {[ResourceKeys.SIGNALS]: {}} : {}),
  ...(props.serial ? {
    [ACTIONS]: {
      provides: props.spread ?
        {_: transformSpy.mockReturnValue({provides1: 'moose', provides2: 'theberner'})} :
        {serialProp: transformSpy.mockReturnValue(42)}
    },
    [DECISION_LOGS]: {
      options: {logs: props.serialProp},
      dependsOn: ['serialProp']
    }
  } : {}),
  ...(props.customName ? {
    customDecisions: {
      modelKey: DECISIONS,
      provides: {sift: () => 'science'}
    }
  } : {}),
  ...(props.unfetch ? {[ACCOUNT_CONFIG]: {}} : {})
}))
class TestComponent extends React.Component {
  render() {
    var idontexist,
        {TestChildren=DefaultTestChildren} = this.props;

    if (causeLogicError && hasLoaded(this.props.decisionsLoadingState)) {
      idontexist.neitherDoI;
    }

    return <TestChildren {...this.props} />;
  }
}

/**
 * Note we need to ensure the component has loaded in most cases before we
 * unmount so that we don't empty the cache before the models get loaded.
 */
/* eslint-disable max-nested-callbacks */
describe('withResources', () => {
  var originalPerf = window.performance,
      dataChild,
      resources,

      requestSpy,
      shouldResourcesError,
      delayedResourceComplete,

      defaultProps = {
        userId: 'noah',
        fraudLevel: 'high',
        page: 0
      },

      renderWithResources = (props={}) =>
        ReactDOM.render(<TestWrapper {...defaultProps} {...props} />, renderNode);

  beforeEach(() => {
    var fetchMock = function(options) {
      return new Promise((res, rej) => {
        // do this just to help identify and differentiate our models
        if (options.params) {
          this.params = options.params;
        }

        if ((options.params || {}).delay) {
          return window.setTimeout(() => {
            delayedResourceComplete = true;

            rej({status: 404});
          }, options.params.delay);
        }

        // just wait a frame to keep the promise callbacks from getting invoked
        // in the same JS frame
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (shouldResourcesError || (options.params || {}).shouldError) {
              rej({status: 404});
            }

            res([this, {status: 200}]);
          });
        });
      });
    };

    UserModel.realCacheFields = UserModel.cacheFields;
    document.body.appendChild(renderNode);

    requestSpy = jest.spyOn(Request, 'default');
    jest.spyOn(Model.prototype, 'fetch').mockImplementation(fetchMock);
    jest.spyOn(Collection.prototype, 'fetch').mockImplementation(fetchMock);

    delete window.performance;

    window.performance = {
      mark: noOp,
      measure: noOp,
      getEntriesByName: () => [{duration: 5}],
      clearMarks: noOp,
      clearMeasures: noOp,
      now: noOp
    };

    jest.spyOn(ModelCache, 'put');
    jest.spyOn(ModelCache, 'unregister');
  });

  afterEach(async() => {
    UserModel.cacheFields = UserModel.realCacheFields;

    Request.default.mockRestore();
    Model.prototype.fetch.mockRestore();
    Collection.prototype.fetch.mockRestore();

    dataChild = null;
    window.performance = originalPerf;
    await unmountAndClearModelCache();
    renderNode.remove();
    shouldResourcesError = false;

    ModelCache.put.mockRestore();
    ModelCache.unregister.mockRestore();
  });

  it('fetches all resources before mounting', async() => {
    dataChild = findDataChild(renderWithResources());

    await waitsFor(() => requestSpy.mock.calls.length);
    expect(requestSpy.mock.calls.length).toEqual(3);
  });

  it('passed loading states for all resources down as props', async() => {
    dataChild = findDataChild(renderWithResources());
    expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADING);
    expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADING);
    expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADING);
    expect(dataChild.props.notesLoadingState).toBe(LoadingStates.PENDING);

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADED);
    expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADED);
    expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADED);
    expect(dataChild.props.notesLoadingState).toBe(LoadingStates.PENDING);
  });

  it('resources marked as noncritical don\'t factor into the loading props', async() => {
    dataChild = findDataChild(renderWithResources({analystsError: true}));

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(dataChild.props.analystsLoadingState).toEqual(LoadingStates.ERROR);
    expect(dataChild.props.hasLoaded).toBe(true);
    expect(dataChild.props.hasInitiallyLoaded).toBe(true);
    expect(dataChild.props.isLoading).toBe(false);
    expect(dataChild.props.hasErrored).toBe(false);
  });

  describe('\'hasInitiallyLoaded\' is initially true', () => {
    it('if all critical models are passed', async() => {
      dataChild = findDataChild(renderWithResources({
        decisionsCollection: new DecisionsCollection(),
        userModel: new UserModel()
      }));

      expect(dataChild.props.hasInitiallyLoaded).toBe(true);
      await unmountAndClearModelCache();

      dataChild = findDataChild(renderWithResources({
        // analystsCollection is noncritical
        analystsCollection: new AnalystsCollection(),
        userModel: new UserModel()
      }));
      expect(dataChild.props.hasInitiallyLoaded).toBe(false);

      await waitsFor(() => dataChild.props.hasLoaded);
    });

    it('if the critical models already exist in the cache', async() => {
      var decisionsCollection = new Collection(),
          userModel = new Model();

      ModelCache.put('decisions', decisionsCollection);
      ModelCache.put('userfraudLevel=high_userId=noah', userModel);
      dataChild = findDataChild(renderWithResources());

      expect(dataChild.props.hasLoaded).toBe(true);
      expect(dataChild.props.hasInitiallyLoaded).toBe(true);
      expect(dataChild.props.decisionsCollection).toEqual(decisionsCollection);
      expect(dataChild.props.userModel).toEqual(userModel);
      await unmountAndClearModelCache();

      ModelCache.remove('userfraudLevel=high_userId=noah');
      dataChild = findDataChild(renderWithResources());
      expect(dataChild.props.hasLoaded).toBe(false);
      expect(dataChild.props.hasInitiallyLoaded).toBe(false);

      await waitsFor(() => dataChild.props.hasLoaded);
    });
  });

  it('resource keys get turned into props of the same name, with \'Model\' or ' +
      '\'Collection\' appended as appropriate', async() => {
    dataChild = findDataChild(renderWithResources());

    await waitsFor(() => dataChild.props.hasLoaded);

    // keys in this case represent the returned models (since we're stubbing fetch)
    expect(dataChild.props.decisionsCollection instanceof DecisionsCollection).toBe(true);
    expect(dataChild.props.userModel instanceof UserModel).toBe(true);
    expect(dataChild.props.analystsCollection instanceof AnalystsCollection).toBe(true);
  });

  it('returns a setResourceState function that allows it to change resource-related props',
    async() => {
      dataChild = findDataChild(renderWithResources());
      expect(dataChild.props.userId).toEqual('noah');

      dataChild.props.setResourceState({userId: 'alex'});
      expect(dataChild.props.userId).toEqual('alex');
      await waitsFor(() => dataChild.props.hasLoaded);
    });

  describe('updates a resource', () => {
    it('when its cache key changes with props', async() => {
      // decisions collection should update when passed `include_deleted`,
      // since that exists on its cacheFields property
      resources = renderWithResources();

      await waitsFor(() => requestSpy.mock.calls.length);
      expect(requestSpy.mock.calls.length).toEqual(3);

      findDataChild(resources).props.setResourceState({includeDeleted: true});
      await waitsFor(() => requestSpy.mock.calls.length === 4);

      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0])
          .toEqual('decisionsinclude_deleted=true');
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][1])
          .toEqual(ModelMap[ResourceKeys.DECISIONS]);
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][2].params)
          .toEqual({include_deleted: true});

      await waitsFor(() => findDataChild(resources).props.hasLoaded);
    });

    it('when all its dependencies are present for the first time', async() => {
      dataChild = findDataChild(renderWithResources());
      expect(dataChild.props.notesLoadingState).toEqual(LoadingStates.PENDING);

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(requestSpy.mock.calls.length).toEqual(3);
      dataChild.props.setResourceState({noah: true});

      await waitsFor(() => dataChild.props.notesLoadingState !== LoadingStates.PENDING);

      expect(requestSpy.mock.calls.length).toEqual(4);

      // dependsOn prop won't factor into cache key unless part of fields
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0]).toEqual('notes');
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][1])
          .toEqual(ModelMap[ResourceKeys.NOTES]);

      await waitsFor(() => dataChild.props.notesLoadingState === LoadingStates.LOADED);
    });
  });

  describe('unregisters the component from the ModelCache', () => {
    var componentRef;

    beforeEach(async() => {
      dataChild = findDataChild(renderWithResources());
      await waitsFor(() => dataChild.props.hasLoaded);
      componentRef = requestSpy.mock.calls[requestSpy.mock.calls.length - 1][2].component;
    });

    it('when a dependent resource\'s prop changes', async() => {
      expect(ModelCache.unregister).not.toHaveBeenCalled();
      dataChild.props.setResourceState({userId: 'zorah'});

      await waitsFor(() => ModelCache.unregister.mock.calls.length);

      expect(ModelCache.unregister).toHaveBeenCalledWith(
        componentRef,
        'userfraudLevel=high_userId=noah'
      );
    });

    it('when a component unmounts', async() => {
      expect(ModelCache.unregister).not.toHaveBeenCalled();
      await unmountAndClearModelCache();

      await waitsFor(() => ModelCache.unregister.mock.calls.length);

      expect(ModelCache.unregister).toHaveBeenCalledWith(componentRef);
    });
  });

  it('fetches a resource if newly specified', async() => {
    resources = renderWithResources();

    await waitsFor(() => requestSpy.mock.calls.length);

    expect(requestSpy.mock.calls.length).toEqual(3);
    expect(requestSpy.mock.calls.map((call) => call[0])
        .includes(ResourceKeys.SIGNALS)).toBe(false);

    findDataChild(resources).props.setResourceState({fetchSignals: true});

    await waitsFor(() => requestSpy.mock.calls.length === 4);

    expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0])
        .toEqual(ResourceKeys.SIGNALS);
    expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][1])
        .toEqual(ModelMap[ResourceKeys.SIGNALS]);

    await waitsFor(() => findDataChild(resources).props.hasLoaded);
  });

  it('listens to all resources', async() => {
    jest.spyOn(Model.prototype, 'onUpdate');
    jest.spyOn(Model.prototype, 'offUpdate');
    jest.spyOn(Collection.prototype, 'onUpdate');
    jest.spyOn(Collection.prototype, 'offUpdate');

    dataChild = findDataChild(renderWithResources());
    expect(Model.prototype.onUpdate.mock.calls.length).toEqual(0);

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(Model.prototype.onUpdate.mock.calls.length).toEqual(1);
    expect(Collection.prototype.onUpdate.mock.calls.length).toEqual(2);

    Model.prototype.onUpdate.mockRestore();
    Model.prototype.offUpdate.mockRestore();
    Collection.prototype.onUpdate.mockRestore();
    Collection.prototype.offUpdate.mockRestore();
  });

  it('does not fetch resources that are passed in via props', async() => {
    resources = renderWithResources({
      userModel: new Model(),
      analystsCollection: new Collection(),
      decisionsCollection: new Collection()
    });

    await waitsFor(() => findDataChild(resources).props.hasLoaded);

    expect(requestSpy).not.toHaveBeenCalled();
    ReactDOM.unmountComponentAtNode(renderNode);
    await waitsFor(() => ModelCache.unregister.mock.calls.length);

    // the models passed down are not fetched
    resources = renderWithResources({
      userModel: new Model(),
      decisionsCollection: new Collection()
    });

    await waitsFor(() => requestSpy.mock.calls.length);

    expect(requestSpy.mock.calls.length).toEqual(1);
    expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0]).toEqual('analysts');
  });

  it('listens to resources passed in via props', async() => {
    var userModel = new UserModel({name: 'goodUser'});

    class TestChild extends React.Component {
      render() {
        return <span>{this.props.userModel.get('name')}</span>;
      }
    }

    resources = renderWithResources({TestChildren: TestChild, userModel});
    dataChild = findDataChild(resources, TestChild);

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(ReactDOM.findDOMNode(dataChild).textContent).toEqual('goodUser');

    userModel.set({name: 'betterUser'});
    expect(ReactDOM.findDOMNode(dataChild).textContent).toEqual('betterUser');
  });

  it('does not set loading states if the component unmounts before the request returns',
    async() => {
      jest.spyOn(Model.prototype, 'onUpdate');
      jest.spyOn(Collection.prototype, 'onUpdate');
      dataChild = findDataChild(renderWithResources());

      // start mock clock now because we need to make assertions between when
      // the component is removed and when we want the models to be removed
      jest.useFakeTimers();
      ReactDOM.unmountComponentAtNode(renderNode);

      // wait til the next tick to ensure our resources have been 'fetched'
      jest.runAllTicks();
      expect(Model.prototype.onUpdate).not.toHaveBeenCalled();
      expect(Collection.prototype.onUpdate).not.toHaveBeenCalled();
      expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADING);
      expect(dataChild.props.analystsLoadingState).toEqual(LoadingStates.LOADING);
      expect(dataChild.props.userLoadingState).toEqual(LoadingStates.LOADING);

      // now finish model removal
      jest.advanceTimersByTime(150000);
      Model.prototype.onUpdate.mockRestore();
      Collection.prototype.onUpdate.mockRestore();
      jest.useRealTimers();
    });

  it('prioritizes critical resource requests before noncritical requests before prefetch',
    async() => {
      dataChild = findDataChild(renderWithResources({prefetch: true}));
      await waitsFor(() => requestSpy.mock.calls.length === 5);

      expect(requestSpy.mock.calls[0][0]).toEqual('decisions');
      expect(requestSpy.mock.calls[1][0]).toEqual('userfraudLevel=high_userId=noah');
      expect(requestSpy.mock.calls[2][0]).toEqual('searchQuery');
      expect(requestSpy.mock.calls[2][2].prefetch).not.toBeDefined();
      // noncritical call is second-to-last
      expect(requestSpy.mock.calls[3][0]).toEqual('analysts');
      // prefetch call is last
      expect(requestSpy.mock.calls[4][0]).toEqual('searchQueryfrom=10');
      expect(requestSpy.mock.calls[4][2].prefetch).toBeDefined();
      await waitsFor(() => dataChild.props.hasLoaded);
    });

  it('passes a false \'fetch\' option if the model key is of an unfetched model', async() => {
    requestSpy.mockResolvedValue([]);
    dataChild = findDataChild(renderWithResources({unfetch: true}));

    await waitsFor(() => requestSpy.mock.calls.length);

    expect(requestSpy.mock.calls[0][2].fetch).toBe(true);
    expect(requestSpy.mock.calls[1][2].fetch).toBe(true);
    // third call is the unfetched resource
    expect(requestSpy.mock.calls[2][0]).toEqual('accountConfig');
    expect(requestSpy.mock.calls[2][2].fetch).toBe(false);
    expect(requestSpy.mock.calls[3][2].fetch).toBe(true);
    await waitsFor(() => dataChild.props.hasLoaded);
  });

  describe('creates a cache key', () => {
    describe('when a model has a cacheFields property', () => {
      it('with the ResourceKey as the base, keys from the cacheFields, ' +
          'and values from \'params\'', () => {
        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          params: {
            userId: 'noah',
            fraudLevel: 'high',
            lastName: 'grant'
          }
        })).toEqual('userfraudLevel=high_userId=noah');

        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          params: {
            userId: 'alex',
            fraudLevel: 'low',
            lastName: 'lopatron'
          }
        })).toEqual('userfraudLevel=low_userId=alex');
      });

      it('prioritizes cacheFields in \'options\' or \'data\' config properties', () => {
        expect(getCacheKey({
          data: {fraudLevel: 'miniscule'},
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
          data: {userId: 'noah'},
          modelKey: ResourceKeys.USER,
          params: {
            fraudLevel: 'high',
            lastName: 'grant'
          }
        })).toEqual('userfraudLevel=highgrant_lastName=grant_userId=noah');
      });
    });
  });

  describe('does not update resource loading state if the fetched resource is not current', () => {
    it('for a non-cached resource', async() => {
      dataChild = findDataChild(renderWithResources({delay: 1000}));

      await waitsFor(() => requestSpy.mock.calls.length === 3);

      dataChild = findDataChild(renderWithResources({userId: 'zorah'}));

      await Promise.all([
        waitsFor(() => dataChild.props.hasLoaded),
        waitsFor(() => requestSpy.mock.calls.length === 4)
      ]);

      await waitsFor(() => delayedResourceComplete);
      // even though old resource errored, we're still in a loaded state!
      expect(dataChild.props.hasLoaded).toBe(true);
      delayedResourceComplete = null;
    });

    it('for a cached resource', async() => {
      var userModel = new UserModel({}, {userId: 'zorah'});

      ModelCache.put('useruserId=zorah', userModel);

      // this test is just to ensure that, when a cached resource is requested
      // on an update, which means it resolves its promise immediately, that the
      // loading state is still set (because the cache key should equal the cache
      // key check in the resolve handler).
      jest.spyOn(ModelCache, 'register');
      dataChild = findDataChild(renderWithResources({shouldError: true}));

      await waitsFor(() => dataChild.props.hasErrored);
      expect(dataChild.props.userLoadingState).toEqual(LoadingStates.ERROR);

      ModelCache.register.mockClear();
      // rerender with a new user, but the user that's 'already cached'
      dataChild = findDataChild(renderWithResources({userId: 'zorah', fraudLevel: null}));

      // now assert that we turn back to a loaded state from the cached resource
      await waitsFor(() => dataChild.props.hasLoaded);
      expect(ModelCache.register).toHaveBeenCalledWith('useruserId=zorah', {});
      expect(dataChild.props.userModel).toEqual(userModel);
      ModelCache.register.mockRestore();
    });
  });

  describe('passes down empty models or collections', () => {
    it('for pending or errored resources (because their keys are not in cache)', async() => {
      dataChild = findDataChild(renderWithResources());

      await waitsFor(() => dataChild.props.hasLoaded);
      // these are our two critical resources, whose models have been placed in
      // the cache before fetching
      expect(dataChild.props.decisionsCollection.isEmptyModel).not.toBeDefined();
      expect(dataChild.props.userModel.isEmptyModel).not.toBeDefined();

      // however, this is a pending resource, so it should not be in the cache
      expect(dataChild.props.notesModel.isEmptyModel).toBe(true);
      expect(dataChild.props.notesModel.get('pretend')).toBe(true);
      expect(dataChild.props.notesModel instanceof NotesModel).toBe(true);

      shouldResourcesError = true;
      dataChild = findDataChild(renderWithResources({userId: 'zorah'}));

      await waitsFor(() => dataChild.props.hasErrored);

      expect(dataChild.props.userModel.isEmptyModel).toBe(true);
      expect(dataChild.props.userModel instanceof UserModel).toBe(true);

      shouldResourcesError = false;
      // now request a different resource and assert that our model is still empty (because it
      // is set as state)
      dataChild = findDataChild(renderWithResources({userId: 'lopatron'}));

      expect(dataChild.props.userModel.isEmptyModel).toBe(true);
      expect(dataChild.props.userModel instanceof UserModel).toBe(true);

      await waitsFor(() => dataChild.props.hasLoaded);
      expect(dataChild.props.userModel.isEmptyModel).not.toBeDefined();
      expect(dataChild.props.userModel instanceof UserModel).toBe(true);
    });

    it('that cannot be modified', async() => {
      var decisionsCollection,
          userModel;

      shouldResourcesError = true;
      dataChild = findDataChild(renderWithResources());

      await waitsFor(() => dataChild.props.hasErrored);
      // we know these are the empty models from the previous test
      ({decisionsCollection, userModel} = dataChild.props);

      decisionsCollection.frontend = 'farmers';
      expect(decisionsCollection.frontend).toEqual('farmers');
      userModel.frontend = 'farmers';
      expect(userModel.frontend).toEqual('farmers');

      expect(() => decisionsCollection.models.push({frontend: 'farmers'})).toThrow();
      expect(decisionsCollection.length).toEqual(0);
      expect(() => decisionsCollection.add({frontend: 'farmers'})).toThrow();
      expect(decisionsCollection.length).toEqual(0);

      expect(() => userModel.attributes.frontend = 'farmers').toThrow();
      expect(userModel.attributes.frontend).not.toBeDefined();
      expect(() => userModel.set('frontend', 'farmers')).toThrow();
      expect(userModel.attributes.frontend).not.toBeDefined();
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
        data: {content_abuse: {id: 'content_decision'}},
        shouldCache: () => true,
        modelKey: ResourceKeys.DECISION_INSTANCE,
        options: {entityId: 'noah', entityType: 'content'}
      }, {
        modelKey: ResourceKeys.LABEL_INSTANCE,
        options: {userId: 'noah'}
      }];
    });

    afterEach(() => {
      Request.default.mockClear();
      ModelMap[ResourceKeys.USER].providesModels = oldProvides;
    });

    it('caches instantiated unfetched models when the parent model returns', async() => {
      ModelMap[ResourceKeys.USER].providesModels = () => newProvides;
      dataChild = findDataChild(renderWithResources());

      await waitsFor(() => dataChild.props.hasLoaded);
      componentRef = requestSpy.mock.calls[requestSpy.mock.calls.length - 1][2].component;

      expect(ModelCache.put.mock.calls.length).toEqual(5);
      expect(ModelCache.put.mock.calls[3][0])
          .toEqual('decisionInstanceentityId=noah_entityType=content');
      expect(ModelCache.put.mock.calls[3][1] instanceof ModelMap[ResourceKeys.DECISION_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.mock.calls[3][2]).toEqual(componentRef);

      expect(ModelCache.put.mock.calls[4][0])
          .toEqual('labelInstanceuserId=noah');
      expect(ModelCache.put.mock.calls[4][1] instanceof ModelMap[ResourceKeys.LABEL_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.mock.calls[4][2]).toEqual(componentRef);
    });

    it('updates previously existing models if they exist', async() => {
      var testModel = new Model({content_abuse: {id: 'another_content_decision'}}),
          testKey = 'decisionInstanceentityId=noah_entityType=content';

      ModelMap[ResourceKeys.USER].providesModels = () => newProvides;
      ModelCache.put(testKey, testModel);
      ModelCache.put.mockClear();
      expect(ModelCache.get(testKey).get('content_abuse').id).toEqual('another_content_decision');

      dataChild = findDataChild(renderWithResources());

      await waitsFor(() => dataChild.props.hasLoaded);
      componentRef = requestSpy.mock.calls[requestSpy.mock.calls.length - 1][2].component;

      expect(ModelCache.put.mock.calls.length).toEqual(4);
      // model cache is called, but never for our existing model
      expect([
        ModelCache.put.mock.calls[0][0],
        ModelCache.put.mock.calls[1][0],
        ModelCache.put.mock.calls[2][0],
        ModelCache.put.mock.calls[3][0]
      ]).not.toContain(testKey);

      // label still gets called!
      expect(ModelCache.put.mock.calls[3][0])
          .toEqual('labelInstanceuserId=noah');
      expect(ModelCache.put.mock.calls[3][1] instanceof ModelMap[ResourceKeys.LABEL_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.mock.calls[3][2]).toEqual(componentRef);

      // same test model should exist at the test key
      expect(ModelCache.get(testKey)).toEqual(testModel);
      // but its contents have been changed!
      expect(ModelCache.get(testKey).get('content_abuse').id).toEqual('content_decision');

      // need to manually remove this model since we manually added it without a component
      // that _should_ get it automatically scheduled for removal, but that removal will get
      // canceled when our component mounts. this may indicate a bug...
      ModelCache.remove(testKey);
    });

    it('does nothing if the shouldCache function returns false', async() => {
      ModelMap[ResourceKeys.USER].providesModels = () => newProvides.map((config) => ({
        ...config,
        shouldCache: () => false
      }));
      dataChild = findDataChild(renderWithResources());

      await waitsFor(() => dataChild.props.hasLoaded);
      expect(ModelCache.put.mock.calls.length).toEqual(3);
    });
  });

  describe('has a \'measure\' option', () => {
    var markCount = 0,
        markName = '',
        measureCount = 0,
        measureName = '';

    beforeEach(() => {
      jest.spyOn(ResourcesConfig, 'track').mockImplementation(() => {});
      // React 16 calls the performance object all over the place, so we can't
      // really count on the spying directly for tests. We kinda need to hack
      // around it.
      jest.spyOn(window.performance, 'mark').mockImplementation((...args) => {
        if (args[0] === 'decisions') {
          markCount++;
          markName = args[0];

          return;
        }

        return originalPerf.mark(...args);
      });

      jest.spyOn(window.performance, 'measure').mockImplementation((...args) => {
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
      window.performance.measure.mockRestore();
      window.performance.mark.mockRestore();
      ResourcesConfig.track.mockRestore();
    });

    it('that does not measure by default', async() => {
      dataChild = findDataChild(renderWithResources());

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(markCount).toEqual(0);
      expect(measureCount).toEqual(0);
      expect(ResourcesConfig.track).not.toHaveBeenCalled();
    });

    describe('as a static property', () => {
      beforeEach(() => {
        jest.spyOn(ModelCache, 'get').mockReturnValue();
      });

      afterEach(() => {
        ModelCache.get.mockRestore();
      });

      it('can be a boolean', async() => {
        DecisionsCollection.measure = true;
        dataChild = findDataChild(renderWithResources());
        await waitsFor(() => dataChild.props.hasLoaded);

        expect(markName).toEqual(ResourceKeys.DECISIONS);
        expect(measureCount).toEqual(1);
        expect(measureName).toEqual(ResourceKeys.DECISIONS);
        expect(ResourcesConfig.track).toHaveBeenCalledWith('API Fetch', {
          Resource: ResourceKeys.DECISIONS,
          params: undefined,
          options: undefined,
          duration: 5
        });

        delete DecisionsCollection.measure;
      });

      it('can be a function that returns a boolean', async() => {
        DecisionsCollection.measure = ({params={}}) => params.include_deleted;

        // no include_deleted here, so it shouldn't measure
        dataChild = findDataChild(renderWithResources());
        await waitsFor(() => dataChild.props.hasLoaded);

        expect(markCount).toEqual(0);
        expect(measureCount).toEqual(0);
        expect(ResourcesConfig.track).not.toHaveBeenCalled();

        ReactDOM.unmountComponentAtNode(renderNode);
        // now it should measure
        dataChild = findDataChild(renderWithResources({includeDeleted: true}));
        await waitsFor(() => dataChild.props.hasLoaded);

        expect(markName).toEqual(ResourceKeys.DECISIONS);
        expect(measureCount).toEqual(1);
        expect(measureName).toEqual(ResourceKeys.DECISIONS);
        expect(ResourcesConfig.track).toHaveBeenCalledWith('API Fetch', {
          Resource: ResourceKeys.DECISIONS,
          params: {include_deleted: true},
          options: undefined,
          duration: 5
        });

        delete DecisionsCollection.measure;
      });
    });
  });

  describe('for a resource with a \'dependsOn\' option', () => {
    beforeEach(async() => {
      dataChild = findDataChild(renderWithResources({serial: true}));

      expect(dataChild.props.decisionLogsLoadingState).toEqual(LoadingStates.PENDING);
    });

    it('will not fetch until the dependent prop is available', async() => {
      await waitsFor(() => requestSpy.mock.calls.length);

      expect(requestSpy.mock.calls.length).toEqual(4);
      expect(requestSpy.mock.calls.map((call) => call[0])
          .includes(ResourceKeys.ACTIONS)).toBe(true);
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0])
          .not.toMatch(ResourceKeys.DECISION_LOGS);

      await waitsFor(() => dataChild.props.serialProp);
      expect(requestSpy.mock.calls.length).toEqual(5);
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0])
          .toMatch(ResourceKeys.DECISION_LOGS);
      await waitsFor(() => dataChild.props.hasLoaded);
    });

    it('reverts back to pending state if its dependencies are removed', async() => {
      await waitsFor(() => dataChild.props.serialProp);
      expect(isLoading(dataChild.props.decisionLogsLoadingState)).toBe(true);
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0])
          .toMatch(ResourceKeys.DECISION_LOGS);

      await waitsFor(() => hasLoaded(dataChild.props.decisionLogsLoadingState));
      dataChild.props.setResourceState((state) => ({...state, serialProp: null}));

      await waitsFor(() => dataChild.props.decisionLogsLoadingState === LoadingStates.PENDING);
      expect(!!dataChild.props.serialProp).toBe(false);
      // we have a new model cache key for the dependent model because
      // the value of serialProp has changed. so the cache lookup should
      // again be empty
      expect(dataChild.props.decisionLogsCollection.isEmptyModel).toBe(true);
    });

    it('reverts to pending if removed dependent prop does not affect cache key', async() => {
      var originalCacheFields = DecisionLogsCollection.cacheFields;

      await unmountAndClearModelCache();
      DecisionLogsCollection.cacheFields = [];

      dataChild = findDataChild(renderWithResources({serial: true}));

      expect(isPending(dataChild.props.decisionLogsLoadingState)).toBe(true);

      await waitsFor(() => dataChild.props.serialProp);
      expect(isLoading(dataChild.props.decisionLogsLoadingState)).toBe(true);
      expect(requestSpy.mock.calls[requestSpy.mock.calls.length - 1][0])
          .toMatch(ResourceKeys.DECISION_LOGS);

      await waitsFor(() => hasLoaded(dataChild.props.decisionLogsLoadingState));
      dataChild.props.setResourceState((state) => ({...state, serialProp: null}));

      await waitsFor(() => !dataChild.props.serialProp);
      expect(isPending(dataChild.props.decisionLogsLoadingState)).toBe(true);
      expect(!!dataChild.props.decisionLogsCollection.isEmptyModel).toBe(false);

      DecisionLogsCollection.cacheFields = originalCacheFields;
    });
  });

  describe('for a resource with a \'provides\' option', () => {
    it('will set the provided prop from its resource via the transform value', async() => {
      var actionsModel;

      dataChild = findDataChild(renderWithResources({serial: true}));

      expect(dataChild.props.serialProp).not.toBeDefined();
      await waitsFor(() => transformSpy.mock.calls.length);
      actionsModel = transformSpy.mock.calls[transformSpy.mock.calls.length - 1][0];
      expect(actionsModel instanceof Collection).toBe(true);
      expect(actionsModel.key).toEqual('actions');

      await waitsFor(() => dataChild.props.serialProp);
      expect(dataChild.props.serialProp).toEqual(42);
    });

    it('will set dynamic props if passed the spread character as a key', async() => {
      var actionsModel;

      dataChild = findDataChild(renderWithResources({serial: true, spread: true}));

      expect(dataChild.props.provides1).not.toBeDefined();
      expect(dataChild.props.provides2).not.toBeDefined();
      expect(transformSpy).toHaveBeenCalled();

      actionsModel = transformSpy.mock.calls[transformSpy.mock.calls.length - 1][0];
      expect(actionsModel instanceof Collection).toBe(true);
      expect(actionsModel.key).toEqual('actions');

      await waitsFor(() => dataChild.props.provides1);
      expect(dataChild.props.provides1).toEqual('moose');
      expect(dataChild.props.provides2).toEqual('theberner');
    });
  });

  describe('accepts an array of configuration options', () => {
    it('that passes the first entry down as the model prop', async() => {
      dataChild = findDataChild(renderWithResources({prefetch: true}));

      // first entry has data: {from: 0}
      await waitsFor(() => dataChild.props.hasLoaded);
      expect(dataChild.props.searchQueryModel.params).toEqual('{"from":0}');
    });

    describe('that prefetches the other entries', () => {
      it('and does not send them down as props', async() => {
        dataChild = findDataChild(renderWithResources({prefetch: true}));

        await waitsFor(() => requestSpy.mock.calls.length === 5);

        // should have two search query calls, but the props on searchQueryModel
        // should have from = 0
        expect(
          requestSpy.mock.calls.filter((call) => /^searchQuery/.test(call[0]))
              .map((call) => call[0])
        ).toEqual(['searchQuery', 'searchQueryfrom=10']);

        await waitsFor(() => dataChild.props.hasLoaded);
        expect(dataChild.props.searchQueryModel.params).toEqual('{"from":0}');

        // move to the next page
        dataChild.props.setResourceState({page: 10});

        await waitsFor(() => requestSpy.mock.calls.length === 6);
        expect(
          requestSpy.mock.calls.filter((call) => /^searchQuery/.test(call[0]))
              .map((call) => call[0])
        ).toEqual(['searchQuery', 'searchQueryfrom=10', 'searchQueryfrom=20']);

        expect(dataChild.props.searchQueryModel.params).toEqual('{"from":10}');
      });

      it('that are not taken into account for component loading states', async() => {
        var prefetchLoading = true,
            prefetchError,
            searchQueryLoading,
            haveCalledPrefetch,
            haveCalledSearchQuery;

        requestSpy.mockImplementation((key, _Model, options={}) => new Promise((res, rej) => {
          window.requestAnimationFrame(() => {
            var model = new _Model({key, ...(options.params || {})});

            if (options.prefetch) {
              haveCalledPrefetch = true;

              // never-resolving promise to mock long-loading request
              if (prefetchLoading) {
                return false;
              } else if (prefetchError) {
                return rej([model]);
              }

              ModelCache.put(key, model, options.component);
              res([model]);
            } else {
              if (/searchQuery/.test(key) && searchQueryLoading) {
                haveCalledSearchQuery = true;

                return false;
              }

              ModelCache.put(key, model, options.component);
              res([model]);
            }
          });
        }));

        dataChild = findDataChild(renderWithResources({prefetch: true}));

        // first test the case where the prefetch takes a long time--we should still be in
        // a loaded state
        await waitsFor(() => dataChild.props.searchQueryModel && haveCalledPrefetch);
        expect(dataChild.props.hasLoaded).toBe(true);

        await unmountAndClearModelCache();
        prefetchLoading = false;
        prefetchError = true;
        haveCalledPrefetch = false;
        dataChild = findDataChild(renderWithResources({prefetch: true}));

        // now test when the prefetch has errored--we should still be in a loaded state
        await waitsFor(() => dataChild.props.searchQueryModel && haveCalledPrefetch);
        expect(dataChild.props.hasLoaded).toBe(true);

        await unmountAndClearModelCache();
        prefetchError = false;
        searchQueryLoading = true;
        haveCalledPrefetch = false;
        dataChild = findDataChild(renderWithResources({prefetch: true}));

        // finally, let's say the prefetch resolves but our first query is still loading.
        // we should be in a loading state.
        await waitsFor(() => haveCalledPrefetch && haveCalledSearchQuery);
        expect(dataChild.props.isLoading).toBe(true);

        searchQueryLoading = false;
        haveCalledPrefetch = false;
        haveCalledSearchQuery = false;
      });
    });
  });

  it('sets the status when resource loads', async() => {
    dataChild = findDataChild(renderWithResources());
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
    expect(dataChild.props.userStatus).toEqual(200);
    expect(dataChild.props.analystsStatus).toEqual(200);
  });

  it('sets an error state and logs when a component errors after returning a resource',
    async() => {
      var boundary,
          originalError = window.onerror;

      jest.spyOn(ResourcesConfig, 'log').mockReturnValue();
      window.onerror = noOp();
      causeLogicError = true;
      resources = renderWithResources();
      dataChild = findDataChild(resources);
      expect(isLoading(dataChild.props.decisionsLoadingState)).toBe(true);
      expect(isLoading(dataChild.props.decisionsLoadingState)).toBe(true);
      boundary = findRenderedComponentWithType(resources, ErrorBoundary);

      await waitsFor(() => boundary.state.caughtError);
      expect(ResourcesConfig.log).toHaveBeenCalled();
      expect(scryRenderedDOMComponentsWithClass(resources, 'caught-error').length).toEqual(1);

      causeLogicError = false;
      window.onerror = originalError;
      ResourcesConfig.log.mockRestore();
    });

  it('sets the status when resource errors', async() => {
    shouldResourcesError = true;
    dataChild = findDataChild(renderWithResources());
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
    expect(dataChild.props.userStatus).toEqual(404);
    expect(dataChild.props.analystsStatus).toEqual(404);
  });

  it('sets an error state when a resource errors, but does not log', async() => {
    jest.spyOn(ResourcesConfig, 'log').mockReturnValue();
    shouldResourcesError = true;
    dataChild = findDataChild(renderWithResources());
    expect(isLoading(dataChild.props.decisionsLoadingState)).toBe(true);

    await waitsFor(() => dataChild.props.hasErrored);
    expect(hasErrored(dataChild.props.decisionsLoadingState)).toBe(true);
    expect(ResourcesConfig.log).not.toHaveBeenCalled();
    ResourcesConfig.log.mockRestore();
  });

  it('accepts custom resource names for local model, loading state, and status names',
    async() => {
      dataChild = findDataChild(renderWithResources({customName: true}));

      expect(dataChild.props.decisionsLoadingState).toEqual('loading');
      expect(dataChild.props.customDecisionsLoadingState).toEqual('loading');
      expect(dataChild.props.sift).not.toBeDefined();

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(requestSpy.mock.calls.map((call) => call[0])).toEqual([
        'decisions',
        'userfraudLevel=high_userId=noah',
        'decisions',
        'analysts'
      ]);

      expect(dataChild.props.decisionsCollection.key).toEqual('decisions');
      // key should be the same as for decisions, signaling that while fetch is
      // called ones for each resource, only one fetch would be made
      expect(dataChild.props.customDecisionsCollection.key).toEqual('decisions');
      expect(dataChild.props.decisionsLoadingState).toEqual('loaded');
      expect(dataChild.props.customDecisionsLoadingState).toEqual('loaded');
      expect(dataChild.props.customDecisionsStatus).toEqual(200);
      expect(dataChild.props.sift).toEqual('science');
    });

  it('recaches models that get an id for the first time', async() => {
    var cachedModel;

    dataChild = findDataChild(renderWithResources());

    await waitsFor(() => dataChild.props.hasLoaded);
    cachedModel = ModelCache.get('userfraudLevel=high_userId=noah');
    expect(cachedModel).toBeDefined();

    dataChild.props.setResourceState({withId: true});
    await waitsFor(() => dataChild.props.hasLoaded);
    expect(ModelCache.get('userfraudLevel=high_userId=noah')).not.toBeDefined();
    expect(ModelCache.get('userfraudLevel=high_id=noah_userId=noah')).toEqual(cachedModel);

    expect(requestSpy.mock.calls.length).toEqual(4);
  });

  it('cached resources are initialized into a loaded state and not re-fetched', async() => {
    var zorahModel = new UserModel();

    ModelCache.put('userfraudLevel=high_userId=zorah', zorahModel);
    dataChild = findDataChild(renderWithResources());

    await waitsFor(() => dataChild.props.hasLoaded);
    expect(requestSpy.mock.calls.length).toEqual(3);

    dataChild = findDataChild(renderWithResources({userId: 'zorah'}));

    // just wait a small amount to make sure things don't change
    await new Promise((res) => window.setTimeout(res, 0));

    expect(dataChild.props.userId).toEqual('zorah');
    expect(requestSpy.mock.calls.length).toEqual(3);
    expect(dataChild.props.userLoadingState).toEqual(LoadingStates.LOADED);
    expect(dataChild.props.hasLoaded).toBe(true);
  });

  it('refetches resources imperatively via the \'refresh\' function', async() => {
    dataChild = findDataChild(renderWithResources());

    await waitsFor(() => dataChild.props.hasLoaded);

    expect(requestSpy.mock.calls.length).toEqual(3);
    dataChild.props.refetch(({DECISIONS, USER}) => [DECISIONS, USER]);

    await waitsFor(() => !dataChild.props.hasLoaded);

    expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADING);
    expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADING);
    expect(dataChild.props.analystsLoadingState).toBe(LoadingStates.LOADED);

    expect(requestSpy.mock.calls.length).toEqual(5);

    await waitsFor(() => dataChild.props.hasLoaded);
  });

  it('fetches lazily-cached resources', async() => {
    var decisionsCollection = new Collection(),
        userModel = new Model();

    decisionsCollection.lazy = true;
    // lazy
    ModelCache.put('decisions', decisionsCollection);
    // not lazy
    ModelCache.put('userfraudLevel=high_userId=noah', userModel);

    dataChild = findDataChild(renderWithResources());

    expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADING);
    expect(dataChild.props.userLoadingState).toBe(LoadingStates.LOADED);

    await waitsFor(() => dataChild.props.hasLoaded);

    // users not called, but decisions called
    expect(requestSpy.mock.calls.map(([name]) => name)).toEqual([
      ResourceKeys.DECISIONS,
      ResourceKeys.ANALYSTS
    ]);

    requestSpy.mockClear();
    Collection.prototype.fetch.mockClear();
    ModelCache.remove('decisions');

    // now let's test the case where a single component changes its lazy status
    dataChild = findDataChild(renderWithResources({lazy: true}));

    expect(dataChild.props.decisionsLoadingState).toEqual(LoadingStates.LOADED);
    expect(dataChild.props.hasLoaded).toBe(true);
    expect(Collection.prototype.fetch).not.toHaveBeenCalled();

    dataChild = findDataChild(renderWithResources({lazy: false}));

    await waitsFor(() => dataChild.props.hasLoaded);
    expect(Collection.prototype.fetch).toHaveBeenCalledTimes(1);
    expect(Collection.prototype.fetch.mock.instances[0] instanceof DecisionsCollection).toBe(true);
  });
});

/**
 * Unmount react test component and ensure that all models have been removed for the next test.
 */
async function unmountAndClearModelCache() {
  ModelCache.__removeAll__();

  if (renderNode.children.length) {
    ReactDOM.unmountComponentAtNode(renderNode);
    await waitsFor(() => ModelCache.unregister.mock.calls.length);
  }
}

class TestWrapper extends React.Component {
  render() {
    return <TestComponent {...this.props} />;
  }
}

function findDataChild(wrapper, type=DefaultTestChildren) {
  return findRenderedComponentWithType(wrapper, type);
}
