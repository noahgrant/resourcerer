import * as Request from '../lib/request';

import {
  prefetch as _prefetch,
  Collection,
  EMPTY_COLLECTION,
  EMPTY_MODEL,
  getCacheKey,
  Model,
  withResources
} from '../lib/index';
import {DecisionLogsCollection, UserModel} from './model-mocks';
import {
  findDataCarrier,
  findDataChild,
  getRenderedResourceComponents,
  waitsFor
} from './test-utils';
import {hasErrored, hasLoaded, isLoading, noOp} from '../lib/utils';
import {ModelMap, ResourceKeys, ResourcesConfig} from '../lib/config';
import {
  scryRenderedComponentsWithType,
  scryRenderedDOMComponentsWithClass,
  Simulate
} from 'react-dom/test-utils';

import ErrorBoundary from '../lib/error-boundary';
import {LoadingStates} from '../lib/constants';
import ModelCache from '../lib/model-cache';
import prefetch from '../lib/prefetch';
import React from 'react';
import ReactDOM from 'react-dom';
import Schmackbone from 'schmackbone';

var measure,
    causeLogicError;

const transformSpy = jasmine.createSpy('transform');
const jasmineNode = document.createElement('div');

@withResources((props) => ({
  [ResourceKeys.ANALYSTS]: {noncritical: true},
  [ResourceKeys.DECISIONS]: {
    ...(props.includeDeleted ? {data: {include_deleted: true}} : {}),
    measure,
    status: props.status
  },
  [ResourceKeys.NOTES]: {noncritical: true, dependsOn: ['noah']},
  [ResourceKeys.USER]: {
    fields: ['userId', 'fraudLevel'],
    options: {
      userId: props.userId,
      fraudLevel: props.fraudLevel,
      ...(props.delay ? {delay: props.delay} : {})
    }
  },
  ...props.prefetch ? {
    [ResourceKeys.SEARCH_QUERY]: {
      fields: ['page'],
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
    [ResourceKeys.DECISION_LOGS]: {fields: ['serialProp'], dependsOn: ['serialProp']}
  } : {},
  ...props.customName ? {
    customDecisions: {
      modelKey: ResourceKeys.DECISIONS,
      status: true,
      provides: {sift: () => 'science'}
    }
  } : {},
  ...props.unfetch ? {[ResourceKeys.ACCOUNT_CONFIG]: {}} : {}
}))
class TestComponent extends React.Component {
  render() {
    var idontexist;

    if (causeLogicError && hasLoaded(this.props.decisionsLoadingState)) {
      idontexist.neitherDoI;
    }

    return <div />;
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
      dataCarrier,
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

      renderWithResources = (props={}) =>
        ReactDOM.render(<TestComponent {...defaultProps} {...props} />, jasmineNode);

  beforeEach(() => {
    UserModel.realCacheFields = UserModel.cacheFields;
    DecisionLogsCollection.realCacheFields = DecisionLogsCollection.cacheFields;
    UserModel.cacheFields = ['userId', 'fraudLevel'];
    DecisionLogsCollection.cacheFields = null;

    document.body.appendChild(jasmineNode);

    requestSpy = spyOn(Request, 'default').and.callFake((key, Const, options) => {
      // mock fetch model cache behavior, where we put it in the cache immediately,
      // then request the model, and only if it errors do we remove it from cache
      var model = new Schmackbone.Model({key, ...(options.data || {})});

      ModelCache.put(key, model, options.component);

      return new Promise((res, rej) => {
        if ((options.options || {}).delay) {
          return window.setTimeout(() => {
            delayedResourceComplete = true;
            ModelCache.remove(key);
            rej([model]);
          }, options.options.delay);
        }

        if (cached) {
          // treat model as though it were cached by resolving promise immediately
          return res([model]);
        }

        // put requests in a RAF to 'mimic' the procession of non-cached
        // resources (ie, loading states get set because we don't immediately
        // resolve the promise)
        window.requestAnimationFrame(() => {
          if (shouldResourcesError) {
            ModelCache.remove(key);

            rej([model, model !== EMPTY_COLLECTION && model !== EMPTY_MODEL ? 404 : null]);
          } else {
            res([model, model !== EMPTY_COLLECTION && model !== EMPTY_MODEL ? 200 : null]);
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
  });

  afterEach(() => {
    UserModel.cacheFields = UserModel.realCacheFields;
    DecisionLogsCollection.cacheFields = DecisionLogsCollection.realCacheFields;

    window.performance = originalPerf;
    unmountAndClearModelCache();
    jasmineNode.remove();
    causeLogicError = false;
    shouldResourcesError = false;
  });

  it('fetches all resources before mounting', () => {
    // syncronify requestSpy since we don't need it to actually get anything
    // or store anything in the cache
    requestSpy.and.returnValue({then: (res) => ({catch: () => false})});
    dataChild = renderWithResources();
    expect(requestSpy.calls.count()).toEqual(3);
  });

  it('passed loading states for all resources down as props', async(done) => {
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
    done();
  });

  it('resources marked as noncritical don\'t factor into the loading props', async(done) => {
    resources = renderWithResources();
    dataChild = findDataChild(resources);

    await waitsFor(() => dataChild.props.hasLoaded);

    findDataCarrier(resources).setState({analystsLoadingState: LoadingStates.LOADING});
    expect(dataChild.props.hasLoaded).toBe(true);
    expect(dataChild.props.hasInitiallyLoaded).toBe(true);
    expect(dataChild.props.isLoading).toBe(false);
    expect(dataChild.props.hasErrored).toBe(false);
    done();
  });

  it('\'hasInitiallyLoaded\' is initially true if all critical models are passed', () => {
    dataChild = findDataChild(renderWithResources({
      decisionsCollection: new Schmackbone.Collection(),
      userModel: new Schmackbone.Model()
    }));

    expect(dataChild.props.hasInitiallyLoaded).toBe(true);
    unmountAndClearModelCache();

    dataChild = findDataChild(renderWithResources({
      // analystsCollection is noncritical
      analystsCollection: new Schmackbone.Collection(),
      userModel: new Schmackbone.Model()
    }));
    expect(dataChild.props.hasInitiallyLoaded).toBe(false);
  });

  it('resource keys get turned into props of the same name, with \'Model\' or ' +
      '\'Collection\' appended as appropriate', async(done) => {
    dataChild = findDataChild(renderWithResources());

    await waitsFor(() => dataChild.props.hasLoaded);

    // keys in this case represent the returned models (since we're stubbing fetch)
    expect(dataChild.props.decisionsCollection.get('key')).toEqual(ResourceKeys.DECISIONS);
    expect(dataChild.props.userModel.get('key')).toBe('userfraudLevel=high_userId=noah');
    expect(dataChild.props.analystsCollection.get('key')).toBe(ResourceKeys.ANALYSTS);

    done();
  });

  it('has a setResourceState prop that allows a state-carrying wrapper to change props',
    async(done) => {
      resources = renderWithResources();
      dataCarrier = findDataCarrier(resources);
      dataChild = findDataChild(resources);

      dataCarrier.props.setResourceState({userId: 'alex'});
      expect(dataCarrier.props.userId).toEqual('alex');
      await waitsFor(() => dataChild.props.hasLoaded);
      done();
    });

  describe('updates a resource', () => {
    it('when a prop changes that is specified in its fields option', async(done) => {
      resources = renderWithResources();
      expect(requestSpy.calls.count()).toEqual(3);
      findDataCarrier(resources).props.setResourceState({userId: 'alex'});
      expect(requestSpy.calls.count()).toEqual(4);
      expect(requestSpy.calls.mostRecent().args[0]).toEqual('userfraudLevel=high_userId=alex');
      expect(requestSpy.calls.mostRecent().args[1]).toEqual(ModelMap[ResourceKeys.USER]);
      expect(requestSpy.calls.mostRecent().args[2].options).toEqual({
        userId: 'alex',
        fraudLevel: 'high'
      });

      await waitsFor(() => findDataChild(resources).props.hasLoaded);

      done();
    });

    it('when its cache key changes with nextProps', async(done) => {
      // decisions collection doesn't have a `fields` prop in this component,
      // but it should still update when passed `include_deleted`, since that
      // exists on its cacheFields property
      resources = renderWithResources();
      expect(requestSpy.calls.count()).toEqual(3);

      findDataCarrier(resources).props.setResourceState({includeDeleted: true});
      expect(requestSpy.calls.count()).toEqual(4);
      expect(requestSpy.calls.mostRecent().args[0]).toEqual('decisionsinclude_deleted=true');
      expect(requestSpy.calls.mostRecent().args[1]).toEqual(ModelMap[ResourceKeys.DECISIONS]);
      expect(requestSpy.calls.mostRecent().args[2].data).toEqual({include_deleted: true});

      await waitsFor(() => findDataChild(resources).props.hasLoaded);

      done();
    });

    it('when all its dependencies are present for the first time', async(done) => {
      resources = renderWithResources();
      expect(findDataCarrier(resources).state.notesLoadingState).toEqual(LoadingStates.PENDING);
      expect(requestSpy.calls.count()).toEqual(3);
      findDataCarrier(resources).props.setResourceState({noah: true});
      expect(requestSpy.calls.count()).toEqual(4);
      expect(findDataCarrier(resources).state.notesLoadingState).toEqual(LoadingStates.LOADING);
      // dependsOn prop won't factor into cache key unless part of fields
      expect(requestSpy.calls.mostRecent().args[0]).toEqual('notes');
      expect(requestSpy.calls.mostRecent().args[1]).toEqual(ModelMap[ResourceKeys.NOTES]);

      await waitsFor(() => findDataChild(resources).props.hasLoaded);
      expect(findDataCarrier(resources).state.notesLoadingState).toEqual(LoadingStates.LOADED);
      done();
    });
  });

  describe('unregisters the component from the ModelCache', () => {
    var unregisterSpy;

    beforeEach(async(done) => {
      unregisterSpy = spyOn(ModelCache, 'unregister').and.callThrough();
      resources = renderWithResources();
      await waitsFor(() => findDataChild(resources).props.hasLoaded);
      done();
    });

    it('when a resource\'s field prop changes', () => {
      expect(unregisterSpy).not.toHaveBeenCalled();
      findDataCarrier(resources).props.setResourceState({userId: 'zorah'});
      expect(unregisterSpy).toHaveBeenCalledWith(
        findDataCarrier(resources),
        'userfraudLevel=high_userId=noah'
      );
    });

    it('when a component unmounts', () => {
      // note: assign dataCarrier reference here because after unmount the ref becomes null
      dataCarrier = findDataCarrier(resources);
      expect(unregisterSpy).not.toHaveBeenCalled();
      unmountAndClearModelCache();
      expect(unregisterSpy).toHaveBeenCalledWith(dataCarrier);
    });
  });

  it('fetches a resource if newly specified', async(done) => {
    resources = renderWithResources();
    expect(requestSpy.calls.count()).toEqual(3);
    expect(requestSpy.calls.all().map((call) => call.args[0])
        .includes(ResourceKeys.SIGNALS)).toBe(false);

    findDataCarrier(resources).props.setResourceState({fetchSignals: true});
    expect(requestSpy.calls.count()).toEqual(4);
    expect(requestSpy.calls.mostRecent().args[0]).toEqual(ResourceKeys.SIGNALS);
    expect(requestSpy.calls.mostRecent().args[1]).toEqual(ModelMap[ResourceKeys.SIGNALS]);
    await waitsFor(() => findDataChild(resources).props.hasLoaded);
    done();
  });

  it('listens to all resources', async(done) => {
    var modelsSubscribed;

    ({resources, dataCarrier, dataChild} = getRenderedResourceComponents(renderWithResources()));

    await waitsFor(() => dataChild.props.hasLoaded);
    modelsSubscribed = dataCarrier._getBackboneModels();

    expect(modelsSubscribed.length).toEqual(3);
    expect(modelsSubscribed[0].get('key')).toEqual('analysts');
    expect(modelsSubscribed[1].get('key')).toEqual('decisions');
    expect(modelsSubscribed[2].get('key')).toEqual('userfraudLevel=high_userId=noah');
    done();
  });

  it('updates even PureComponents when a resource updates', async(done) => {
    var purey;

    @withResources((props) => ({[ResourceKeys.DECISIONS]: {}}))
    class Purey extends React.PureComponent {
      render() {
        return <p>{this.props.decisionsCollection.get('id')}</p>;
      }
    }

    ReactDOM.unmountComponentAtNode(jasmineNode);
    purey = findDataChild(ReactDOM.render(<Purey />, jasmineNode));

    await waitsFor(() => purey.props.hasLoaded);

    expect(ReactDOM.findDOMNode(purey).textContent).toEqual('');
    purey.props.decisionsCollection.set('id', 'adifferentid');
    // it should update!!
    expect(ReactDOM.findDOMNode(purey).textContent).toEqual('adifferentid');

    done();
  });

  it('does not fetch resources that are passed in via props', () => {
    resources = renderWithResources({
      userModel: new Schmackbone.Model(),
      analystsCollection: new Schmackbone.Collection(),
      decisionsCollection: new Schmackbone.Collection()
    });

    expect(requestSpy).not.toHaveBeenCalled();

    ReactDOM.unmountComponentAtNode(jasmineNode);

    // the models passed down are not fetched
    resources = renderWithResources({
      userModel: new Schmackbone.Model(),
      decisionsCollection: new Schmackbone.Collection()
    });

    expect(requestSpy.calls.count()).toEqual(1);
    expect(requestSpy.calls.mostRecent().args[0]).toEqual('analysts');
  });

  it('does not set loading states if the component unmounts before the request returns',
    async(done) => {
      var attachListenersSpy,
          nextTick;

      ({resources, dataCarrier, dataChild} = getRenderedResourceComponents(renderWithResources()));

      attachListenersSpy = spyOn(dataCarrier, '_attachModelListeners');

      // start mock clock now because we need to make assertions between when
      // the component is removed and when we want the models to be removed
      jasmine.clock().install();
      ReactDOM.unmountComponentAtNode(jasmineNode);
      window.requestAnimationFrame(() => nextTick = true);

      // wait til the next tick to ensure our resources have been 'fetched'
      await waitsFor(() => nextTick);

      expect(dataCarrier._getBackboneModels().length).toEqual(3);
      expect(attachListenersSpy).not.toHaveBeenCalled();
      expect(dataCarrier.state.decisionsLoadingState).toEqual(LoadingStates.LOADING);
      expect(dataCarrier.state.analystsLoadingState).toEqual(LoadingStates.LOADING);
      expect(dataCarrier.state.userLoadingState).toEqual(LoadingStates.LOADING);

      // now finish model removal
      jasmine.clock().tick(150000);
      jasmine.clock().uninstall();
      done();
    });

  it('prioritizes critical resource requests before noncritical requests before prefetch', () => {
    renderWithResources({prefetch: true});
    expect(requestSpy.calls.argsFor(0)[0]).toEqual('decisions');
    expect(requestSpy.calls.argsFor(1)[0]).toEqual('userfraudLevel=high_userId=noah');
    expect(requestSpy.calls.argsFor(2)[0]).toEqual('searchQuery');
    expect(requestSpy.calls.argsFor(2)[2].prefetch).not.toBeDefined();
    // noncritical call is second-to-last
    expect(requestSpy.calls.argsFor(3)[0]).toEqual('analysts');
    // prefetch call is last
    expect(requestSpy.calls.argsFor(4)[0]).toEqual('searchQueryfrom=10');
    expect(requestSpy.calls.argsFor(4)[2].prefetch).toBeDefined();
  });

  it('passes a false \'fetch\' option if the model key is of an unfetched model', () => {
    requestSpy.and.returnValue(Promise.resolve());
    renderWithResources({unfetch: true});

    expect(requestSpy.calls.argsFor(0)[2].fetch).toBe(true);
    expect(requestSpy.calls.argsFor(1)[2].fetch).toBe(true);
    // third call is the unfetched resource
    expect(requestSpy.calls.argsFor(2)[0]).toEqual('accountConfig');
    expect(requestSpy.calls.argsFor(2)[2].fetch).toBe(false);
    expect(requestSpy.calls.argsFor(3)[2].fetch).toBe(true);
  });

  describe('creates a cache key', () => {
    describe('when a model has a cacheFields property', () => {
      it('with the GS key as the base, keys from the cacheFields, and values from \'data\'', () => {
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

    describe('when a model does not have a cacheFields property', () => {
      beforeEach(() => {
        UserModel.cacheFields = null;
      });

      it('with the GS key as the base and value fields alphabetized', () => {
        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          fields: ['userId', 'fraudLevel', 'lastName']
        }, {
          userId: 'noah',
          fraudLevel: 'high',
          lastName: 'grant'
        })).toEqual('usergrant_high_noah');

        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          fields: ['userId', 'fraudLevel', 'lastName']
        }, {
          userId: 'alex',
          fraudLevel: 'low',
          lastName: 'lopatron'
        })).toEqual('useralex_lopatron_low');

        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          fields: ['userId', 'score', 'lastName', 'someNumber']
        }, {
          userId: 'alex',
          score: 12,
          lastName: 'lopatron',
          someNumber: 2
        })).toEqual('user12_2_alex_lopatron');
      });

      it('ignoring any fields with \'cacheIgnore\': true', () => {
        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          fields: ['userId', {name: 'fraudLevel', cacheIgnore: true}, 'lastName']
        }, {
          userId: 'noah',
          fraudLevel: 'high',
          lastName: 'grant'
        })).toEqual('usergrant_noah');
      });

      it('that modifies any prop value if a field has a \'map\' property', () => {
        expect(getCacheKey({
          modelKey: ResourceKeys.USER,
          fields: [
            {name: 'userId', map: (val, props) => `super${props.fraudLevel}${val}`},
            'fraudLevel',
            'lastName'
          ]
        }, {
          userId: 'noah',
          fraudLevel: 'high',
          lastName: 'grant'
        })).toEqual('usergrant_high_superhighnoah');
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
      dataChild = findDataChild(renderWithResources({delay: 5000}));
      expect(requestSpy.calls.count()).toEqual(3);
      dataChild = findDataChild(renderWithResources({userId: 'zorah'}));

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(requestSpy.calls.count()).toEqual(4);
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
      //
      // NOTE: this won't be necessary when we move _fetchResources to cDU
      ({dataChild, dataCarrier} = getRenderedResourceComponents(renderWithResources()));

      await waitsFor(() => dataChild.props.hasLoaded);
      // force it to an error state so that we can see the state change
      dataCarrier.setState({userLoadingState: 'error'});
      expect(dataChild.props.userLoadingState).toEqual('error');

      // trigger cWRP with a new user, but the user that's 'already cached'
      cached = true;
      dataChild = findDataChild(renderWithResources({userId: 'zorah', fraudLevel: null}));

      // now assert that we turn back to a loaded state from the cached resource
      await waitsFor(() => dataChild.props.hasLoaded);
      expect(dataChild.props.userModel.get('key')).toEqual('useruserId=zorah');
      done();
    });
  });

  describe('passes down empty models or collections', () => {
    it('for pending or errored resources (because their keys are not in cache)', async(done) => {
      dataChild = findDataChild(renderWithResources());

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
      dataChild = findDataChild(renderWithResources());

      await waitsFor(() => dataChild.props.hasErrored);

      expect(dataChild.props.decisionsCollection).toEqual(EMPTY_COLLECTION);
      expect(dataChild.props.userModel).toEqual(EMPTY_MODEL);
      done();
    });

    it('that cannot be modified', async(done) => {
      var decisionsCollection,
          userModel;

      shouldResourcesError = true;
      dataChild = findDataChild(renderWithResources());

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
        newProvides;

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
      ({dataChild, dataCarrier} = getRenderedResourceComponents(renderWithResources()));

      await waitsFor(() => dataChild.props.hasLoaded);

      expect(ModelCache.put.calls.count()).toEqual(5);
      expect(ModelCache.put.calls.argsFor(3)[0])
          .toEqual('decisionInstanceentityId=noah_entityType=content');
      expect(ModelCache.put.calls.argsFor(3)[1] instanceof ModelMap[ResourceKeys.DECISION_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.calls.argsFor(3)[2]).toEqual(dataCarrier);

      expect(ModelCache.put.calls.argsFor(4)[0])
          .toEqual('labelInstanceuserId=noah');
      expect(ModelCache.put.calls.argsFor(4)[1] instanceof ModelMap[ResourceKeys.LABEL_INSTANCE])
          .toBe(true);
      expect(ModelCache.put.calls.argsFor(4)[2]).toEqual(dataCarrier);

      done();
    });

    it('updates previously existing models if they exist', async(done) => {
      var testModel = new Schmackbone.Model({content_abuse: {id: 'another_content_decision'}}),
          testKey = 'decisionInstanceentityId=noah_entityType=content';

      ModelMap[ResourceKeys.USER].providesModels = () => newProvides;
      ModelCache.put(testKey, testModel);
      ModelCache.put.calls.reset();
      expect(ModelCache.get(testKey).get('content_abuse').id).toEqual('another_content_decision');

      ({dataChild, dataCarrier} = getRenderedResourceComponents(renderWithResources()));

      await waitsFor(() => dataChild.props.hasLoaded);

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
      expect(ModelCache.put.calls.argsFor(3)[2]).toEqual(dataCarrier);

      // same test model should exist at the test key
      expect(ModelCache.get(testKey)).toEqual(testModel);
      // but its contents have been changed!
      expect(ModelCache.get(testKey).get('content_abuse').id).toEqual('content_decision');

      done();
    });

    it('does nothing if the shouldCache function returns false', async(done) => {
      ModelMap[ResourceKeys.USER].providesModels = () => newProvides.map((config) => ({
        ...config,
        shouldCache: () => false
      }));
      ({dataChild, dataCarrier} = getRenderedResourceComponents(renderWithResources()));

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
      dataChild = findDataChild(renderWithResources());

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
        dataChild = findDataChild(renderWithResources());
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
    beforeEach(() => {
      ({dataChild, dataCarrier, resources} = getRenderedResourceComponents(
        renderWithResources({serial: true})
      ));
    });

    it('will not fetch until the dependent prop is available', async(done) => {
      expect(requestSpy.calls.count()).toEqual(4);
      expect(requestSpy.calls.all().map((call) => call.args[0])
          .includes(ResourceKeys.ACTIONS)).toBe(true);
      expect(requestSpy.calls.mostRecent().args[0]).not.toMatch(ResourceKeys.DECISION_LOGS);

      await waitsFor(() => dataCarrier.props.serialProp);
      expect(requestSpy.calls.count()).toEqual(5);
      expect(requestSpy.calls.mostRecent().args[0]).toMatch(ResourceKeys.DECISION_LOGS);
      done();
    });

    it('reverts back to pending state if its dependencies are removed', async(done) => {
      expect(dataCarrier.state.decisionLogsLoadingState).toEqual('pending');

      await waitsFor(() => dataCarrier.props.serialProp);
      expect(isLoading(dataCarrier.state.decisionLogsLoadingState)).toBe(true);
      expect(requestSpy.calls.mostRecent().args[0]).toMatch(ResourceKeys.DECISION_LOGS);

      await waitsFor(() => hasLoaded(dataCarrier.state.decisionLogsLoadingState));
      resources.setState({serialProp: null});

      await waitsFor(() => !dataCarrier.props.serialProp);
      expect(dataCarrier.state.decisionLogsLoadingState).toEqual('pending');
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

      dataCarrier = findDataCarrier(renderWithResources({serial: true}));

      expect(dataCarrier.props.serialProp).not.toBeDefined();
      expect(transformSpy).toHaveBeenCalled();
      actionsModel = transformSpy.calls.mostRecent().args[0];
      expect(actionsModel instanceof Schmackbone.Model).toBe(true);
      expect(actionsModel.get('key')).toEqual(ResourceKeys.ACTIONS);

      await waitsFor(() => dataCarrier.props.serialProp);
      expect(dataCarrier.props.serialProp).toEqual(42);
      done();
    });

    it('will set dynamic props if passed the spread character as a key', async(done) => {
      var actionsModel;

      dataCarrier = findDataCarrier(renderWithResources({serial: true, spread: true}));

      expect(dataCarrier.props.provides1).not.toBeDefined();
      expect(dataCarrier.props.provides2).not.toBeDefined();
      expect(transformSpy).toHaveBeenCalled();

      actionsModel = transformSpy.calls.mostRecent().args[0];
      expect(actionsModel instanceof Schmackbone.Model).toBe(true);
      expect(actionsModel.get('key')).toEqual(ResourceKeys.ACTIONS);

      await waitsFor(() => dataCarrier.props.provides1);
      expect(dataCarrier.props.provides1).toEqual('moose');
      expect(dataCarrier.props.provides2).toEqual('theberner');
      done();
    });
  });

  describe('accepts an array of configuration options', () => {
    it('that passes the first entry down as the model prop', async(done) => {
      ({dataChild} = getRenderedResourceComponents(renderWithResources({prefetch: true})));

      // first entry has data: {from: 0}
      await waitsFor(() => dataChild.props.hasLoaded);
      expect(dataChild.props.searchQueryModel.get('from')).toEqual(0);
      done();
    });

    describe('that prefetches the other entries', () => {
      it('and does not send them down as props', async(done) => {
        ({dataChild} = getRenderedResourceComponents(renderWithResources({prefetch: true})));

        expect(requestSpy.calls.count()).toEqual(5);
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

        requestSpy.and.callFake((key, Const, options={}) => new Promise((res, rej) => {
          window.requestAnimationFrame(() => {
            var model = new Schmackbone.Model({key, ...(options.data || {})});

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

        ({dataChild} = getRenderedResourceComponents(renderWithResources({prefetch: true})));

        // first test the case where the prefetch takes a long time--we should still be in
        // a loaded state
        await waitsFor(() => dataChild.props.searchQueryModel && haveCalledPrefetch);
        expect(dataChild.props.hasLoaded).toBe(true);

        ReactDOM.unmountComponentAtNode(jasmineNode);
        prefetchLoading = false;
        prefetchError = true;
        haveCalledPrefetch = false;
        ({dataChild} = getRenderedResourceComponents(renderWithResources({prefetch: true})));

        // now test when the prefetch has errored--we should still be in a loaded state
        await waitsFor(() => dataChild.props.searchQueryModel && haveCalledPrefetch);
        expect(dataChild.props.hasLoaded).toBe(true);

        ReactDOM.unmountComponentAtNode(jasmineNode);
        prefetchError = false;
        searchQueryLoading = true;
        haveCalledPrefetch = false;
        ({dataChild} = getRenderedResourceComponents(renderWithResources({prefetch: true})));

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
      dataChild = findDataChild(renderWithResources({status: true}));
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
      dataChild = findDataChild(renderWithResources({status: true}));
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
    dataChild = findDataChild(renderWithResources());
    expect(isLoading(dataChild.props.decisionsLoadingState)).toBe(true);

    await waitsFor(() => dataChild.props.hasErrored);
    expect(hasErrored(dataChild.props.decisionsLoadingState)).toBe(true);
    expect(ResourcesConfig.log).not.toHaveBeenCalled();
    done();
  });

  it('sets an error state and logs when a component errors after returning a resource',
    async(done) => {
      var boundary,
          originalError = window.onerror;

      spyOn(ResourcesConfig, 'log');
      window.onerror = noOp();
      causeLogicError = true;

      dataCarrier = findDataCarrier(renderWithResources());
      expect(isLoading(dataCarrier.state.decisionsLoadingState)).toBe(true);
      expect(isLoading(dataCarrier.state.decisionsLoadingState)).toBe(true);
      boundary = scryRenderedComponentsWithType(dataCarrier, ErrorBoundary)[0];

      await waitsFor(() => boundary.state.caughtError);
      expect(ResourcesConfig.log).toHaveBeenCalled();
      expect(scryRenderedDOMComponentsWithClass(dataCarrier, 'caught-error').length).toEqual(1);

      window.onerror = originalError;
      done();
    });

  it('accepts custom resource names for local model, loading state, and status names',
    async(done) => {
      dataChild = findDataChild(renderWithResources({customName: true}));
      expect(requestSpy.calls.count()).toEqual(4);
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

  describe('wrapping stateless functional components', () => {
    it('receive props normally', async(done) => {
      var FunctionComponent = (props) =>
            props.isLoading ?
              <span>LOADING</span> :
              <p>Hello, {props.userModel.id}</p>,
          WrappedFunctionComponent = withResources((props) => (
            {[ResourceKeys.USER]: {options: {userId: props.userId}, data: {id: props.userId}}}
          ))(FunctionComponent);

      ({dataCarrier, resources} = getRenderedResourceComponents(
        ReactDOM.render(<WrappedFunctionComponent {...defaultProps} />, jasmineNode)
      ));
      expect(ReactDOM.findDOMNode(resources).textContent).toEqual('LOADING');
      expect(requestSpy.calls.count()).toEqual(1);
      expect(requestSpy.calls.mostRecent().args[0]).toEqual('useruserId=noah');

      // wait for model to load and verify function updates
      await waitsFor(() => hasLoaded(dataCarrier.state.userLoadingState));

      expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, noah');

      // now have it fetch a new resource
      dataCarrier.props.setResourceState({userId: 'zorah'});
      expect(ReactDOM.findDOMNode(resources).textContent).toEqual('LOADING');
      expect(requestSpy.calls.count()).toEqual(2);
      expect(requestSpy.calls.mostRecent().args[0]).toEqual('useruserId=zorah');

      await waitsFor(() => hasLoaded(dataCarrier.state.userLoadingState));

      expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, zorah');

      done();
    });

    it('can be updated via a model update', async(done) => {
      var FunctionComponent = (props) =>
            props.isLoading ?
              <span>LOADING</span> :
              <p onClick={() => props.userModel.set({id: 'zorah'})}>Hello, {props.userModel.id}</p>,
          WrappedFunctionComponent = withResources((props) => ({
            [ResourceKeys.USER]: {
              data: {id: props.userId},
              options: {userId: props.userId}
            }
          }))(FunctionComponent);

      ({dataCarrier, resources} = getRenderedResourceComponents(
        ReactDOM.render(<WrappedFunctionComponent {...defaultProps} />, jasmineNode)
      ));
      expect(ReactDOM.findDOMNode(resources).textContent).toEqual('LOADING');
      expect(requestSpy.calls.count()).toEqual(1);
      expect(requestSpy.calls.mostRecent().args[0]).toEqual('useruserId=noah');

      // wait for model to load and verify function updates
      await waitsFor(() => hasLoaded(dataCarrier.state.userLoadingState));

      expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, noah');
      Simulate.click(ReactDOM.findDOMNode(resources));

      expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, zorah');

      done();
    });

    describe('if memoized', () => {
      it('will update as expected when new models are fetched', async(done) => {
        // this is the same test as the 'receive props normally' except that
        // this is wrapped in React.memo
        var FunctionComponent = React.memo((props) =>
              props.isLoading ?
                <span>LOADING</span> :
                <p>Hello, {props.userModel.id}</p>),
            WrappedFunctionComponent = withResources((props) => (
              {[ResourceKeys.USER]: {options: {userId: props.userId}, data: {id: props.userId}}}
            ))(FunctionComponent);

        ({dataCarrier, resources} = getRenderedResourceComponents(
          ReactDOM.render(<WrappedFunctionComponent {...defaultProps} />, jasmineNode)
        ));
        expect(ReactDOM.findDOMNode(resources).textContent).toEqual('LOADING');
        expect(requestSpy.calls.count()).toEqual(1);
        expect(requestSpy.calls.mostRecent().args[0]).toEqual('useruserId=noah');

        // wait for model to load and verify function updates
        await waitsFor(() => hasLoaded(dataCarrier.state.userLoadingState));

        expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, noah');

        // now have it fetch a new resource
        dataCarrier.props.setResourceState({userId: 'zorah'});
        expect(ReactDOM.findDOMNode(resources).textContent).toEqual('LOADING');
        expect(requestSpy.calls.count()).toEqual(2);
        expect(requestSpy.calls.mostRecent().args[0]).toEqual('useruserId=zorah');

        await waitsFor(() => hasLoaded(dataCarrier.state.userLoadingState));

        expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, zorah');

        done();
      });

      it('will not update with a resource update', async(done) => {
        var FunctionComponent = React.memo((props) =>
              props.isLoading ?
                <span>LOADING</span> : (
                  <p onClick={() => props.userModel.set({id: 'zorah'})}>
                  Hello, {props.userModel.id}
                  </p>
                )),
            WrappedFunctionComponent = withResources((props) => ({
              [ResourceKeys.USER]: {
                data: {id: props.userId},
                options: {userId: props.userId}
              }
            }))(FunctionComponent);

        ({dataCarrier, resources} = getRenderedResourceComponents(
          ReactDOM.render(<WrappedFunctionComponent {...defaultProps} />, jasmineNode)
        ));
        expect(ReactDOM.findDOMNode(resources).textContent).toEqual('LOADING');
        expect(requestSpy.calls.count()).toEqual(1);
        expect(requestSpy.calls.mostRecent().args[0]).toEqual('useruserId=noah');

        // wait for model to load and verify function updates
        await waitsFor(() => hasLoaded(dataCarrier.state.userLoadingState));

        expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, noah');
        Simulate.click(ReactDOM.findDOMNode(resources));

        // doesn't change because memoized and we're updating the resource in place!
        expect(ReactDOM.findDOMNode(resources).textContent).not.toEqual('Hello, zorah');
        expect(ReactDOM.findDOMNode(resources).textContent).toEqual('Hello, noah');

        done();
      });
    });
  });

  it('exports Model and Collection constructors directly', () => {
    expect(_prefetch).toEqual(prefetch);
    expect(Model).toEqual(Schmackbone.Model);
    expect(Collection).toEqual(Schmackbone.Collection);
  });
});
/* eslint-enable max-nested-callbacks */

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
