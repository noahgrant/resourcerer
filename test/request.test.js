import request, {existsInCache, getFromCache} from '../lib/request';

import Model from '../lib/model';
import ModelCache from '../lib/model-cache';
import {waitsFor} from './test-utils';

const component = {};
const CACHE_WAIT = 150000;

/* eslint-disable max-nested-callbacks */
describe('Request', () => {
  var waitSuccess,
      reject;

  beforeEach(() => {
    jest.spyOn(Model.prototype, 'fetch').mockImplementation(function(options) {
      if (waitSuccess) {
        // use this to ensure that a model gets removed from the loadingCache
        // before other synchronous actions take place
        return new Promise((res, rej) => {
          window.requestAnimationFrame(() => {
            if (reject) {
              rej({status: 404});
            } else {
              res([this, {status: 200}]);
            }
          });
        });
      }

      return Promise.resolve([this, {status: 200}]);
    });

    jest.spyOn(ModelCache, 'put');
    jest.spyOn(ModelCache, 'register');
  });

  afterEach(() => {
    ModelCache.put.mockRestore();
    ModelCache.register.mockRestore();
    Model.prototype.fetch.mockRestore();
    waitSuccess = null;
    reject = null;
    unregisterComponent(component);
  });

  it('when calling \'existsInCache\' returns true if the model exists in the model cache', () => {
    expect(existsInCache('foo')).toBe(false);
    ModelCache.put('foo', new Model(), component);
    expect(existsInCache('foo')).toBe(true);
  });

  describe('when using the default exported function', () => {
    it('returns a promise if the model does not exist', async() => {
      var model,
          promise = request('foo', Model, {options: {one: 1}, component}).then(([_model]) => {
            model = _model;
          });

      await waitsFor(() => model instanceof Model);

      expect(promise instanceof Promise).toBe(true);
      // in this instance we're resolving immediately, so model should be Model
      expect(model instanceof Model).toBe(true);
      // this tests that it properly passes along the options object to the model constructor
      expect(model.urlOptions).toEqual({one: 1});
    });

    describe('if the model does exist', () => {
      it('calls the resolve immediately', async() => {
        var model;

        // put it in the cache
        request('foo', Model, {component});
        // now call it again
        request('foo').then(([_model]) => model = _model);

        await waitsFor(() => model instanceof Model);

        expect(model instanceof Model).toBe(true);
      });

      it('registers the component if passed one', async() => {
        waitSuccess = true;
        // put it in the cache
        await request('newModel', Model, {component});

        expect(ModelCache.register).toHaveBeenCalled();
        waitSuccess = null;
        // now call it again, since we already have it in the cache
        request('newModel', Model, {component});
        // no new fetch, but a new register call
        expect(Model.prototype.fetch.mock.calls.length).toEqual(1);
        expect(ModelCache.register.mock.calls.length).toEqual(2);
      });
    });

    it('puts a model in the ModelCache', async() => {
      var modelRequest;

      waitSuccess = true;
      modelRequest = request('newModel', Model, {component});

      expect(existsInCache('newModel')).toBe(false);
      expect(ModelCache.put).not.toHaveBeenCalled();

      await modelRequest;
      expect(existsInCache('newModel')).toBe(true);
      expect(ModelCache.get('newModel')).toBeDefined();
      expect(ModelCache.put).toHaveBeenCalled();

      unregisterComponent(component);

      modelRequest = request('newModel2', Model, {prefetch: true});
      expect(existsInCache('newModel2')).toBe(false);
      expect(ModelCache.get('newModel2')).not.toBeDefined();
      expect(ModelCache.put.mock.calls.length).toEqual(1);

      await modelRequest;
      expect(existsInCache('newModel2')).toBe(true);
      expect(ModelCache.get('newModel2')).toBeDefined();
      expect(ModelCache.put.mock.calls.length).toEqual(2);
      // haven't called register since no component was passed
      expect(ModelCache.register.mock.calls.length).toEqual(1);
    });

    describe('if the \'fetch\' option is false', () => {
      it('calls the resolve immediately', async() => {
        var model;

        request('nofetch', Model, {component, fetch: false})
            .then(([_model]) => model = _model);

        await waitsFor(() => model instanceof Model);

        expect(Model.prototype.fetch).not.toHaveBeenCalled();
      });

      it('puts a model in the ModelCache', async() => {
        var model;

        expect(ModelCache.get('nofetch')).not.toBeDefined();
        request('nofetch', Model, {component, fetch: false})
            .then(([_model]) => model = _model);

        await waitsFor(() => model instanceof Model);

        expect(ModelCache.get('nofetch')).toBeDefined();
        expect(ModelCache.put).toHaveBeenCalled();

        expect(Model.prototype.fetch).not.toHaveBeenCalled();
      });
    });

    describe('if called successively before the model returns', () => {
      var promise,
          promise2,
          thenSpy1,
          thenSpy2;

      beforeEach(() => {
        waitSuccess = true;
        thenSpy1 = jest.fn();
        thenSpy2 = jest.fn();

        promise = request('foo', Model);
        // call it again
        promise2 = request('foo', Model);
      });

      afterEach(() => {
        promise = null;
        promise2 = null;
      });

      it('returns the unfulfilled promise', async() => {
        var m1,
            m2;

        promise.then(([model]) => m1 = model);
        promise2.then(([model]) => m2 = model);

        await waitsFor(() => m1 instanceof Model);

        // check that they are resolved with the same value!
        expect(m1).toEqual(m2);
        // this is kind of a hack; we might not really need it
        expect(Reflect.ownKeys(promise)[0]).toEqual(Reflect.ownKeys(promise2)[0]);
      });

      it('executes both resolve handlers', async() => {
        promise.then(thenSpy1);
        promise2.then(thenSpy2);

        await waitsFor(() => !!thenSpy1.mock.calls.length);

        expect(thenSpy1).toHaveBeenCalled();
        expect(thenSpy2).toHaveBeenCalled();
      });

      describe('and the first call was a prefetch call', () => {
        it('registers the component of the second call with the model cache', () => {
          ModelCache.register.mockClear();
          // prefetch call, no component
          request('prefetch', Model);
          expect(ModelCache.register).not.toHaveBeenCalled();

          // call it again with a component
          request('prefetch', Model, {component});
          expect(ModelCache.register).toHaveBeenCalled();
        });
      });
    });

    it('resolves request with model and request status', async() => {
      var resultingModel = null,
          resultingStatus = null;

      waitSuccess = true;

      request('newModel', Model, {component}).then(([model, status]) => {
        resultingModel = model;
        resultingStatus = status;
      });

      await waitsFor(() => resultingModel instanceof Model);

      expect(resultingStatus).toBe(200);
    });

    it('rejects request with response status', async() => {
      var resultingStatus = null;

      waitSuccess = true;
      reject = true;

      request('newModel', Model, {component}).catch((status) => {
        resultingStatus = status;
      });

      await waitsFor(() => !!resultingStatus);

      expect(resultingStatus).toBe(404);
    });

    describe('and the request errors', () => {
      it('does not cache the model', async() => {
        var resultingStatus,
            CACHE_KEY = 'errorModel';

        waitSuccess = true;
        reject = true;

        request(CACHE_KEY, Model, {component}).catch((status) => {
          resultingStatus = status;
        });

        await waitsFor(() => !!resultingStatus);
        expect(ModelCache.get(CACHE_KEY)).not.toBeDefined();

        waitSuccess = false;
        reject = false;
      });
    });

    describe('requested with {force: true}', () => {
      var startModel,
          finalModel;

      beforeEach(async() => {
        waitSuccess = true;

        startModel = await request('bar', Model, {component});
        Model.prototype.fetch.mockClear();

        finalModel = await request('bar', Model, {component, force: true});
      });

      afterEach(() => {
        ModelCache.remove('bar');
      });

      it('fetches the model anyway', () => {
        expect(Model.prototype.fetch).toHaveBeenCalled();
      });

      it('uses the same model instance if one already exists', () => {
        expect(startModel).toEqual(finalModel);
      });
    });
  });

  describe('when using getFromCache', () => {
    var model;

    beforeEach(() => {
      model = new Model();
      ModelCache.put('foo', model);
    });

    it('returns the model if it exists in the ModelCache', () => {
      expect(existsInCache('foo')).toBe(true);
      expect(getFromCache('foo')).toEqual(model);
      expect(getFromCache('bar')).not.toBeDefined();
    });
  });
});

/**
 * Because global state operations are async (and we use waitFor), we have to
 * localize our use of the jest mock clock (otherwise waitFor would also be
 * mocked). We refactor the unregister mocking logic here.
 */
function unregisterComponent(comp) {
  jest.useFakeTimers();
  ModelCache.unregister(comp);
  jest.advanceTimersByTime(CACHE_WAIT);
  jest.useRealTimers();
}
/* eslint-enable max-nested-callbacks */
