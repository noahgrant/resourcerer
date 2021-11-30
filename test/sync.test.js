import sync, {setRequestPrefilter} from '../lib/sync';

import Collection from '../lib/collection';
import Model from '../lib/model';

class Library extends Collection {
  url() {
    return '/library';
  }
}

describe('sync', () => {
  var library,
      attrs = {
        title: 'The Tempest',
        author: 'Bill Shakespeare',
        length: 123
      };

  beforeEach(() => {
    library = new Library;
    jest.spyOn(window, 'fetch').mockResolvedValue(
      new Response(new Blob([{test: 'response!'}], {type: 'application/json'}), {status: 200})
    );
  });

  afterEach(() => {
    window.fetch.mockRestore();

    setRequestPrefilter((options) => options);
  });

  it('read', async() => {
    await library.fetch();

    expect(window.fetch.mock.calls[0][0]).toEqual('/library');
    expect(window.fetch.mock.calls[0][1].method).toEqual('GET');
    expect(window.fetch.mock.calls[0][1].params).not.toBeDefined();
    window.fetch.mockClear();

    await library.fetch({params: {one: 'two'}});
    expect(window.fetch.mock.calls[0][0]).toEqual('/library?one=two');
    expect(window.fetch.mock.calls[0][1].method).toEqual('GET');
    expect(window.fetch.mock.calls[0][1].params).toEqual({one: 'two'});
    window.fetch.mockClear();

    await library.fetch({url: '/library?one=two', params: {two: 'three'}});
    expect(window.fetch.mock.calls[0][0]).toEqual('/library?one=two&two=three');
    expect(window.fetch.mock.calls[0][1].method).toEqual('GET');
    expect(window.fetch.mock.calls[0][1].params).toEqual({two: 'three'});
    window.fetch.mockClear();

    // safe call with no options, even though this won't work
    expect(async() => sync(library)).not.toThrow();
    expect(window.fetch.mock.calls[0][0]).toEqual('/library');
    expect(window.fetch.mock.calls[0][1].method).not.toBeDefined();
    expect(window.fetch.mock.calls[0][1].params).not.toBeDefined();
  });

  it('passing params', async() => {
    // GET
    await library.fetch({params: {a: 'a', one: 1}});

    expect(window.fetch.mock.calls[0][0]).toEqual('/library?a=a&one=1');
    window.fetch.mockClear();

    // with body content: already stringified
    await library.add(attrs).at(0).save(null, {params: 'somestring'});

    expect(window.fetch.mock.calls[0][0]).toEqual('/library');
    expect(window.fetch.mock.calls[0][1].body).toEqual('somestring');
    window.fetch.mockClear();

    // with body content: as JSON
    await library.at(0).save(null, {params: {a: 'a', one: 1}});
    expect(window.fetch.mock.calls[0][0]).toEqual('/library');
    expect(window.fetch.mock.calls[0][1].body).toEqual(JSON.stringify({a: 'a', one: 1}));
    window.fetch.mockClear();

    // with body content: not as json
    await library.at(0).save(null, {params: {a: 'a', one: 1}, contentType: 'resourcerer/json'});
    expect(window.fetch.mock.calls[0][0]).toEqual('/library');
    expect(window.fetch.mock.calls[0][1].body).toEqual('a=a&one=1');
  });

  it('create', async() => {
    await library.create(attrs, {wait: false});

    expect(window.fetch.mock.calls[0][0]).toEqual('/library');
    expect(window.fetch.mock.calls[0][1].method).toEqual('POST');
    expect(window.fetch.mock.calls[0][1].params).toEqual({
      title: 'The Tempest',
      author: 'Bill Shakespeare',
      length: 123
    });
  });

  it('update', async() => {
    library.add(attrs);
    await library.at(0).save({id: '1-the-tempest', author: 'William Shakespeare'});

    expect(window.fetch.mock.calls[0][0]).toEqual('/library/1-the-tempest');
    expect(window.fetch.mock.calls[0][1].method).toEqual('PUT');
    expect(window.fetch.mock.calls[0][1].params).toEqual({
      id: '1-the-tempest',
      title: 'The Tempest',
      author: 'William Shakespeare',
      length: 123
    });
  });

  it('read model', async() => {
    library.add(attrs);
    await library.at(0).save({id: '2-the-tempest', author: 'Tim Shakespeare'});
    await library.at(0).fetch();

    expect(window.fetch.mock.calls[1][0]).toEqual('/library/2-the-tempest');
    expect(window.fetch.mock.calls[1][1].method).toEqual('GET');
    expect(window.fetch.mock.calls[1][1].params).not.toBeDefined();
  });

  it('destroy', async() => {
    library.add(attrs);
    await library.at(0).save({id: '2-the-tempest', author: 'Tim Shakespeare'});
    await library.at(0).destroy({wait: true});

    expect(window.fetch.mock.calls[1][0]).toEqual('/library/2-the-tempest');
    expect(window.fetch.mock.calls[1][1].method).toEqual('DELETE');
    expect(window.fetch.mock.calls[1][1].params).not.toBeDefined();
  });

  it('rejects non-2xx', async() => {
    window.fetch.mockResolvedValue(
      new Response(new Blob(
        [JSON.stringify({test: 'womp'})],
        {type: 'application/json'}
      ), {status: 500})
    );

    try {
      await library.fetch();
    } catch (err) {
      expect(err.json).toEqual({test: 'womp'});
    }
  });

  it('urlError', async() => {
    var model = new Model();

    expect(() => model.fetch()).toThrow();

    await model.fetch({url: '/one/two'});
    expect(window.fetch.mock.calls[0][0]).toEqual('/one/two');
    window.fetch.mockClear();

    // url as property
    class _Model extends Model {
      url = '/library/one'
    }

    await new _Model().fetch();
    expect(window.fetch.mock.calls[0][0]).toEqual('/library/one');

    // url as undefined
    class __Model extends Model {
      url = undefined
    }

    expect(() => new __Model().fetch()).toThrow();
  });

  it('default rejected promise callback just rejects again', async() => {
    window.fetch.mockRejectedValue('response');
    library.add(attrs);

    try {
      await library.at(0).save({id: '2-the-tempest', author: 'Tim Shakespeare'});
    } catch (err) {
      expect(err).toEqual('response');
    }

    library.remove(attrs);
    // now use setRequestPrefilter to add error override
    setRequestPrefilter((options) => ({
      ...options,
      error: () => Promise.reject('override')
    }));

    try {
      await library.at(0).save({id: '2-the-tempest', author: 'Tim Shakespeare'});
    } catch (err) {
      expect(err).toEqual('override');
    }
  });

  describe('headers', () => {
    it('can override contentType in options', async() => {
      setRequestPrefilter((options) => ({
        ...options,
        contentType: 'resourcerer/json'
      }));

      await library.add(attrs).at(0).save();

      expect(window.fetch.mock.calls[0][1].headers['Content-Type']).toEqual('resourcerer/json');
    });

    it('can add any header in the \'headers\' option', async() => {
      setRequestPrefilter((options) => ({
        ...options,
        headers: {Accept: 'resourcerer/json', Authorization: 'baaaaaad mofo'}
      }));

      await library.fetch();

      expect(window.fetch.mock.calls[0][1].headers).toEqual({
        Accept: 'resourcerer/json',
        Authorization: 'baaaaaad mofo'
      });
    });
  });
});
