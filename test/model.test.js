import * as sync from '../lib/sync';

import Collection from '../lib/collection';
import Model from '../lib/model';

describe('Model', () => {
  var model,
      collection,
      callback = jest.fn();

  beforeEach(() => {
    jest.spyOn(sync, 'default').mockResolvedValue([]);
  });

  afterEach(() => {
    model = collection = null;
    sync.default.mockRestore();
    callback.mockClear();
  });

  it('is given a cid', () => {
    model = new Model;

    expect(model.cid).toBeDefined();
    expect(model.cid.startsWith('c')).toBe(true);
  });

  it('has expected default static properties', () => {
    expect(Model.idAttribute).toEqual('id');
    expect(Model.cacheFields).toEqual([]);
    expect(Model.dependencies).toEqual([]);
    expect(Model.defaults).toEqual({});
  });

  it('gets its collection assigned to a `collection` property if passed', () => {
    model = new Model;
    collection = new Collection;

    expect(model.collection).not.toBeDefined();

    model = new Model({}, {collection});
    expect(model.collection).toEqual(collection);
  });

  it('parses its attributes before being set if passed a `parse: true` option', () => {
    class _Model extends Model {
      parse(attrs) {
        return Object.keys(attrs).reduce(
          (memo, attr) => Object.assign(memo, {[attr]: attrs[attr] + 5}),
          {}
        );
      }
    }

    class __Model extends Model {
      parse() {}
    }

    model = new _Model({one: 1, two: 2});
    expect(model.toJSON()).toEqual({one: 1, two: 2});

    model = new _Model({one: 1, two: 2}, {parse: true});
    expect(model.toJSON()).toEqual({one: 6, two: 7});
    model = new __Model({one: 1, two: 2}, {parse: true});
    expect(model.toJSON()).toEqual({});
  });

  it('unreserved option items are assigned to a `urlOptions` instance property', () => {
    model = new Model({}, {one: 1, two: 2, parse: true, silent: true});

    expect(model.urlOptions).toEqual({one: 1, two: 2});
  });

  it('can optionally have defaults that are a function', () => {
    class _Model extends Model {
      static defaults = {one: 1, two: 2}
    }

    model = new _Model({two: 5});
    expect(model.toJSON()).toEqual({one: 1, two: 5});

    class __Model extends Model {
      static defaults() {
        return {one: 1, two: 2};
      }
    }

    model = new __Model({two: 5});
    expect(model.toJSON()).toEqual({one: 1, two: 5});
  });

  it('model.sync proxies the sync module', () => {
    model = new Model;
    model.sync('GET', {});
    expect(sync.default).toHaveBeenCalledWith('GET', {});
  });

  describe('get', () => {
    it('returns the value of the data at the given property', () => {
      model = new Model({one: 'one', two: null});

      expect(model.get('one')).toEqual('one');
      expect(model.get('two')).toBe(null);
    });
  });

  describe('has', () => {
    it('returns the true if there is a defined, non-null value at the given property', () => {
      model = new Model({one: 'one', two: null, three: undefined, four: 0});

      expect(model.has('one')).toBe(true);
      expect(model.has('two')).toBe(false);
      expect(model.has('three')).toBe(false);
      expect(model.has('four')).toBe(true);
    });
  });

  describe('pick', () => {
    it('returns a subset of a model\'s attributes', () => {
      model = new Model({one: 'one', two: null, three: undefined, four: 0});

      expect(model.pick('one', 'two', 'five')).toEqual({one: 'one'});
    });
  });

  describe('set', () => {
    it('sets new attributes on a model', () => {
      model = new Model().set({one: 'one', two: 2});
      expect(model.toJSON()).toEqual({one: 'one', two: 2});
    });

    describe('triggers an update', () => {
      beforeEach(() => {
        model = new Model({id: '1234', one: 'one', two: {three: 'four'}});
        model.onUpdate(callback);
      });

      it('if a value has changed', () => {
        model.set({one: 'one'});
        expect(callback).not.toHaveBeenCalled();

        model.set({two: {three: 'four'}});
        expect(callback).not.toHaveBeenCalled();

        model.set({one: 'five'});
        expect(callback).toHaveBeenCalled();

        callback.mockClear();
        model = new Model;
        model.set();
        expect(callback).not.toHaveBeenCalled();
      });

      it('unless the `silent` option is passed', () => {
        model.set({one: 'five'}, {silent: true});
        expect(callback).not.toHaveBeenCalled();
      });
    });

    it('updates its id property, if appropriate, as well as that of the collection', () => {
      model = new Model({id: '1234', one: 'one', two: {three: 'four'}});
      collection = new Collection;

      expect(model.id).toEqual('1234');
      model.set({id: '2345'});
      expect(model.id).toEqual('2345');

      model = new Model({id: '1234'});
      collection.add(model);
      expect(collection.has('1234')).toBe(true);

      model.set({id: '2345'});
      expect(collection.has('1234')).toBe(false);
      expect(collection.has('2345')).toBe(true);
    });
  });

  describe('unset', () => {
    it('removes an attribute from a model\'s data', () => {
      model = new Model({one: 'one', two: null, three: undefined, four: 0});

      model.unset('two');
      expect(model.toJSON()).toEqual({one: 'one', three: undefined, four: 0});
    });
  });

  describe('clear', () => {
    it('removes all attributes from a model', () => {
      model = new Model({one: 'one', two: null, three: undefined, four: 0});

      model.clear();
      expect(model.toJSON()).toEqual({});
    });
  });

  describe('fetch', () => {
    var response = {};

    beforeEach(() => {
      class _Model extends Model {
        parse(resp) {
          return resp.data;
        }
      }

      model = new _Model;
      sync.default.mockResolvedValue([
        {data: {one: 'one', two: 'two'}},
        response
      ]);
    });

    it('calls sync with a GET method', async() => {
      await model.fetch();

      expect(sync.default).toHaveBeenCalledWith(model, {method: 'GET', parse: true});
      await model.fetch({method: 'POST', url: '/library'});

      expect(sync.default).toHaveBeenCalledWith(model, {
        method: 'POST',
        parse: true,
        url: '/library'
      });
    });

    it('triggers an update on returning', async() => {
      var request;

      model.onUpdate(callback);
      request = model.fetch();
      expect(callback).not.toHaveBeenCalled();

      await request;
      expect(callback).toHaveBeenCalled();
      expect(model.toJSON()).toEqual({one: 'one', two: 'two'});
      model.clear();
      callback.mockClear();

      await model.fetch({parse: false});
      expect(callback).toHaveBeenCalled();
      expect(model.toJSON()).toEqual({data: {one: 'one', two: 'two'}});
    });

    it('resolves a tuple of the model instance and repsonse object', async() => {
      expect(await model.fetch()).toEqual([model, response]);
    });

    it('rejects the response', async() => {
      sync.default.mockRejectedValue(response);

      try {
        await model.fetch();
      } catch (err) {
        expect(err).toEqual(response);
      }
    });
  });

  describe('save', () => {
    var response = {};

    class _Model extends Model {
      parse(resp) {
        return resp.data;
      }
    }

    beforeEach(() => {
      model = new _Model({one: 'one'});
      sync.default.mockResolvedValue([
        {data: {one: 'one', two: 'two'}},
        response
      ]);
    });

    it('calls sync with a write method', async() => {
      await model.save();

      expect(sync.default).toHaveBeenCalledWith(model, {parse: true, method: 'POST'});

      model = new _Model({id: '1234'});
      await model.save({one: 'one'});
      expect(sync.default).toHaveBeenCalledWith(model, {parse: true, method: 'PUT'});
      expect(model.get('one')).toEqual('one');

      model = new _Model({id: '1234'});
      await model.save({one: 'one'}, {patch: true});
      expect(sync.default).toHaveBeenCalledWith(
        model,
        {parse: true, patch: true, method: 'PATCH', attrs: {one: 'one'}}
      );
    });

    it('parses results unless `parse` is set to false', async() => {
      var result;

      model.onUpdate(callback);

      result = await model.save();
      expect(model.toJSON()).toEqual({one: 'one', two: 'two'});
      expect(result).toEqual([model, response]);

      model.clear();
      callback.mockClear();

      await model.save({three: 'three'}, {parse: false});
      expect(model.toJSON()).toEqual({data: {one: 'one', two: 'two'}, three: 'three'});
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('does not set attributes until after the request returns when `wait` is true', async() => {
      var result;

      model.onUpdate(callback);

      result = model.save({three: 'three'}, {wait: true});
      expect(callback).not.toHaveBeenCalled();
      expect(model.toJSON()).toEqual({one: 'one'});

      await result;

      expect(callback).toHaveBeenCalled();
      expect(model.toJSON()).toEqual({one: 'one', two: 'two', three: 'three'});
    });

    it('restores previous attributes if error', async() => {
      sync.default.mockRejectedValue(response);

      try {
        await model.save({one: 'two', two: 'three'});
      } catch (err) {
        expect(err).toEqual(response);
        expect(model.toJSON()).toEqual({one: 'one'});
      }

      try {
        await model.save({one: 'two', two: 'three'}, {wait: true});
      } catch (err) {
        expect(err).toEqual(response);
        expect(model.toJSON()).toEqual({one: 'one'});
      }
    });
  });

  describe('destroy', () => {
    var response = {};

    beforeEach(() => {
      model = new Model({id: '1234'});
      sync.default.mockResolvedValue([undefined, response]);
    });

    it('resolves immediately if new', async() => {
      model = new Model();

      expect(await model.destroy()).toEqual([model, undefined]);
    });

    it('calls sync with a DELETE method', async() => {
      await model.destroy();

      expect(sync.default).toHaveBeenCalledWith(model, {method: 'DELETE'});
      await model.destroy({url: '/library'});

      expect(sync.default).toHaveBeenCalledWith(model, {method: 'DELETE', url: '/library'});
    });

    it('resolves a tuple of the model instance and repsonse object', async() => {
      expect(await model.destroy()).toEqual([model, response]);
    });

    it('rejects the response', async() => {
      sync.default.mockRejectedValue(response);

      try {
        await model.destroy();
      } catch (err) {
        expect(err).toEqual(response);
      }
    });

    it('updates immediately if `wait` is false', async() => {
      var request;

      collection = new Collection([model]);
      model.onUpdate(callback);
      expect(collection.has(model.id)).toBe(true);

      request = model.destroy();

      expect(callback).toHaveBeenCalled();
      expect(collection.has(model.id)).toBe(false);
      await request;
    });

    it('updates when the promise resolves if `wait` is true', async() => {
      var request;

      collection = new Collection([model]);
      model.onUpdate(callback);
      expect(collection.has(model.id)).toBe(true);

      request = model.destroy({wait: true});

      expect(callback).not.toHaveBeenCalled();
      expect(collection.has(model.id)).toBe(true);
      await request;

      expect(callback).toHaveBeenCalled();
      expect(collection.has(model.id)).toBe(false);
    });

    it('adds the model back to its collection when the promise rejects if `wait` is false',
      async() => {
        var request,
            collectionCallback = jest.fn();

        sync.default.mockRejectedValue(response);

        collection = new Collection([model]);
        collection.onUpdate(collectionCallback);
        model.onUpdate(callback);

        expect(collection.has(model.id)).toBe(true);

        request = model.destroy();

        expect(callback).toHaveBeenCalled();
        expect(collectionCallback).toHaveBeenCalled();
        expect(collection.has(model.id)).toBe(false);

        try {
          await request;
        } catch (err) {
          expect(collectionCallback).toHaveBeenCalledTimes(2);
          expect(collection.has(model.id)).toBe(true);
          expect(err).toEqual(response);
        }

        collectionCallback.mockClear();

        try {
          await model.destroy({wait: true});
        } catch (err) {
          expect(collectionCallback).not.toHaveBeenCalled();
          expect(collection.has(model.id)).toBe(true);
          expect(err).toEqual(response);
        }
      });
  });

  describe('url', () => {
    it('throws if there is no overridden url property and the model is not in a collection', () => {
      model = new Model;

      expect(() => model.url()).toThrowError('A "url" property or function must be specified');
      model.urlRoot = '/library';
      expect(model.url()).toEqual('/library');

      collection = new Collection();
      collection.url = '/library';
      model = new Model({}, {collection});
      expect(model.url()).toEqual('/library');
    });

    it('appends its id to the url if not new', () => {
      class _Model extends Model {
        static idAttribute = 'name'
      }

      model = new _Model({name: 'noah?grant'});
      model.urlRoot = () => '/library';
      expect(model.url()).toEqual('/library/noah%3Fgrant');

      collection = new Collection();
      collection.url = () => '/library';
      model = new _Model({name: 'noah?grant'}, {collection});
      expect(model.url()).toEqual('/library/noah%3Fgrant');
    });

    it('is called by default with its urlOptions', () => {
      class _Model extends Model {
        urlRoot({section}) {
          return `/library/${section}`;
        }
      }

      model = new _Model({}, {section: 'nature'});
      expect(model.url()).toEqual('/library/nature');

      collection = new Collection();
      collection.url = ({section}) => `/library/${section}`;
      model = new Model({}, {collection, section: 'history'});
      expect(model.url()).toEqual('/library/history');
    });
  });

  describe('parse', () => {
    it('is by default the identity function', () => {
      model = new Model();
      expect(model.parse({foo: 'bar'})).toEqual({foo: 'bar'});
    });
  });

  describe('isNew', () => {
    it('returns true if the model has an id attribute', () => {
      class _Model extends Model {
        static idAttribute = 'name'
      }

      model = new Model;
      expect(model.isNew()).toBe(true);
      model.set({id: '1234'});
      expect(model.isNew()).toBe(false);

      model = new _Model({id: '1234'});
      expect(model.isNew()).toBe(true);
      model.set({name: 'noah'});
      expect(model.isNew()).toBe(false);
    });
  });
});
