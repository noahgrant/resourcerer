import {existsInCache, getFromCache, request} from '../lib/fetch';

import Backbone from 'backbone';
import ModelCache from '../lib/model_cache';
import {waitsFor} from './test_utils';

const component = {},
      CACHE_WAIT = 150000;

/* eslint-disable max-nested-callbacks */
describe('Fetch', () => {
  var waitSuccess,
      reject;

  beforeEach(() => {
    spyOn(Backbone.Model.prototype, 'fetch').and.callFake(function(options) {
      if (waitSuccess) {
        // use this to ensure that a model gets removed from the loadingCache
        // before other synchronous actions take place
        window.requestAnimationFrame(() => {
          if (reject) {
            options.error(this, {status: 404});
          } else {
            options.success(this, {}, {response: {status: 200}});
          }
        });
      } else if (typeof options.success === 'function') {
        options.success(new Backbone.Model(), '', {response: {status: 200}});
      }
    });

    spyOn(ModelCache, 'put').and.callThrough();
    spyOn(ModelCache, 'register').and.callThrough();
  });

  afterEach(() => {
    Backbone.Model.prototype.fetch.calls.reset();
    waitSuccess = null;
    reject = null;
    unregisterComponent(component);
  });

  it('when calling \'existsInCache\' returns true if the model exists in the model cache', () => {
    expect(existsInCache('foo')).toBe(false);
    ModelCache.put('foo', new Backbone.Model(), component);
    expect(existsInCache('foo')).toBe(true);
  });

  describe('when using request', () => {
    it('returns a promise if the model does not exist', async(done) => {
      var model,
          promise = request('foo', Backbone.Model, {component}).then((_model) => {
            model = _model;
          });

      await waitsFor(() => model instanceof Backbone.Model);

      expect(promise instanceof Promise).toBe(true);
      // in this instance we're resolving immediately, so model should be Backbone.Model
      expect(model instanceof Backbone.Model).toBe(true);
      done();
    });

    describe('if the model does exist', () => {
      it('calls the resolve immediately', async(done) => {
        var model;

        // put it in the cache
        request('foo', Backbone.Model, {component});
        // now call it again
        request('foo').then((_model) => model = _model);

        await waitsFor(() => model instanceof Backbone.Model);

        expect(model instanceof Backbone.Model).toBe(true);
        done();
      });

      it('registers the component if passed one', async(done) => {
        waitSuccess = true;
        // put it in the cache
        await request('newModel', Backbone.Model, {component});

        expect(ModelCache.register).toHaveBeenCalled();
        waitSuccess = null;
        // now call it again, since we already have it in the cache
        request('newModel', Backbone.Model, {component});
        // no new fetch, but a new register call
        expect(Backbone.Model.prototype.fetch.calls.count()).toEqual(1);
        expect(ModelCache.register.calls.count()).toEqual(2);

        done();
      });
    });

    it('puts a model in the ModelCache', async(done) => {
      waitSuccess = true;
      await request('newModel', Backbone.Model, {component});

      expect(existsInCache('newModel')).toBe(true);
      expect(ModelCache.get('newModel')).toBeDefined();
      expect(ModelCache.put).toHaveBeenCalled();

      unregisterComponent(component);

      await request('newModel2', Backbone.Model, {prefetch: true});

      expect(existsInCache('newModel2')).toBe(true);
      expect(ModelCache.get('newModel2')).toBeDefined();
      expect(ModelCache.put.calls.count()).toEqual(2);
      // haven't called register since no component was passed
      expect(ModelCache.register.calls.count()).toEqual(1);

      await request('newModel2', Backbone.Model, {prefetch: true});
      done();
    });

    describe('if the \'fetch\' option is false', () => {
      it('calls the resolve immediately', async(done) => {
        var model;

        request('nofetch', Backbone.Model, {component, fetch: false})
            .then((_model) => model = _model);

        await waitsFor(() => model instanceof Backbone.Model);

        expect(Backbone.Model.prototype.fetch).not.toHaveBeenCalled();
        done();
      });

      it('puts a model in the ModelCache', async(done) => {
        var model;

        expect(ModelCache.get('nofetch')).not.toBeDefined();
        request('nofetch', Backbone.Model, {component, fetch: false})
            .then((_model) => model = _model);

        await waitsFor(() => model instanceof Backbone.Model);

        expect(ModelCache.get('nofetch')).toBeDefined();
        expect(ModelCache.put).toHaveBeenCalled();

        expect(Backbone.Model.prototype.fetch).not.toHaveBeenCalled();
        done();
      });
    });

    describe('if called successively before the model returns', () => {
      var promise,
          promise2,
          thenSpy1,
          thenSpy2;

      beforeEach(() => {
        waitSuccess = true;
        thenSpy1 = jasmine.createSpy('thenSpy1');
        thenSpy2 = jasmine.createSpy('thenSpy2');

        promise = request('foo', Backbone.Model);
        // call it again
        promise2 = request('foo', Backbone.Model);
      });

      afterEach(() => {
        thenSpy1.calls.reset();
        thenSpy2.calls.reset();
        promise = null;
        promise2 = null;
      });

      it('returns the unfulfilled promise', async(done) => {
        var m1,
            m2;

        promise.then((model) => m1 = model);
        promise2.then((model) => m2 = model);

        await waitsFor(() => m1 instanceof Backbone.Model);

        // check that they are resolved with the same value!
        expect(m1).toEqual(m2);
        // this is kind of a hack; we might not really need it
        expect(Reflect.ownKeys(promise)[0]).toEqual(Reflect.ownKeys(promise2)[0]);
        done();
      });

      it('executes both resolve handlers', async(done) => {
        promise.then(thenSpy1);
        promise2.then(thenSpy2);

        await waitsFor(() => !!thenSpy1.calls.count());

        expect(thenSpy1).toHaveBeenCalled();
        expect(thenSpy2).toHaveBeenCalled();
        done();
      });

      describe('and the first call was a prefetch call', () => {
        it('registers the component of the second call with the model cache', () => {
          ModelCache.register.calls.reset();
          // prefetch call, no component
          request('prefetch', Backbone.Model);
          expect(ModelCache.register).not.toHaveBeenCalled();

          // call it again with a component
          request('prefetch', Backbone.Model, {component});
          expect(ModelCache.register).toHaveBeenCalled();
        });
      });
    });

    it('sets status on the model before resolving', async(done) => {
      var resultingModel = null;

      waitSuccess = true;

      request('newModel', Backbone.Model, {component}).then((model) => {
        resultingModel = model;
      });

      await waitsFor(() => resultingModel instanceof Backbone.Model);

      expect(resultingModel.status).toBe(200);
      done();
    });

    it('sets status on the model before rejecting', async(done) => {
      var resultingModel = null;

      waitSuccess = true;
      reject = true;

      request('newModel', Backbone.Model, {component}).catch((model) => {
        resultingModel = model;
      });

      await waitsFor(() => resultingModel instanceof Backbone.Model);

      expect(resultingModel.status).toBe(404);
      done();
    });

    describe('and the request errors', () => {
      it('does not cache the model', async(done) => {
        var resultingModel,
            CACHE_KEY = 'errorModel';

        waitSuccess = true;
        reject = true;

        request(CACHE_KEY, Backbone.Model, {component}).catch((model) => {
          resultingModel = model;
        });

        expect(ModelCache.get(CACHE_KEY)).toBeDefined();

        await waitsFor(() => resultingModel instanceof Backbone.Model);
        expect(ModelCache.get(CACHE_KEY)).not.toBeDefined();

        resultingModel = null;

        // now let's try legacy cache, without model cache
        request(CACHE_KEY, Backbone.Model).catch((model) => {
          resultingModel = model;
        });

        await waitsFor(() => resultingModel instanceof Backbone.Model);
        expect(existsInCache(CACHE_KEY)).toBe(false);

        waitSuccess = false;
        reject = false;
        done();
      });
    });

    describe('requested with {forceFetch: true}', () => {
      var startModel,
          finalModel;

      beforeEach(async(done) => {
        waitSuccess = true;

        startModel = await request('bar', Backbone.Model, {component});
        Backbone.Model.prototype.fetch.calls.reset();

        finalModel = await request('bar', Backbone.Model, {component, forceFetch: true});
        done();
      });

      it('fetches the model anyway', () => {
        expect(Backbone.Model.prototype.fetch).toHaveBeenCalled();
      });

      it('uses the same model instance if one already exists', () => {
        expect(startModel).toEqual(finalModel);
      });
    });
  });

  describe('when using getFromCache', () => {
    var model;

    beforeEach(() => {
      model = new Backbone.Model();
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
 * localize our use of the jasmine mock clock (otherwise waitFor would also be
 * mocked). We refactor the unregister mocking logic here.
 */
function unregisterComponent(comp) {
  jasmine.clock().install();
  ModelCache.unregister(comp);
  jasmine.clock().tick(CACHE_WAIT);
  jasmine.clock().uninstall();
}
/* eslint-enable max-nested-callbacks */
