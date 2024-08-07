import sync, { setRequestPrefilter } from "../lib/sync";

import Collection from "../lib/collection";
import Model from "../lib/model";
import { vi } from "vitest";

class Library extends Collection {
  url() {
    return "/library";
  }
}

describe("sync", () => {
  var library,
    attrs = {
      id: "tempest",
      title: "The Tempest",
      author: "Bill Shakespeare",
      length: 123,
    };

  beforeEach(() => {
    library = new Library();
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ test: "response!" }), { status: 200 })
    );
  });

  afterEach(() => {
    window.fetch.mockRestore();

    setRequestPrefilter((options) => options);
  });

  it("read", async () => {
    await library.fetch();

    expect(window.fetch.mock.calls[0][0]).toEqual("/library");
    expect(window.fetch.mock.calls[0][1].method).toEqual("GET");
    expect(window.fetch.mock.calls[0][1].params).toEqual({});
    window.fetch.mockClear();

    await library.fetch({ params: { one: "two" } });
    expect(window.fetch.mock.calls[0][0]).toEqual("/library?one=two");
    expect(window.fetch.mock.calls[0][1].method).toEqual("GET");
    expect(window.fetch.mock.calls[0][1].params).toEqual({ one: "two" });
    window.fetch.mockClear();

    await library.fetch({ url: "/library?one=two", params: { two: "three" } });
    expect(window.fetch.mock.calls[0][0]).toEqual("/library?one=two&two=three");
    expect(window.fetch.mock.calls[0][1].method).toEqual("GET");
    expect(window.fetch.mock.calls[0][1].params).toEqual({ two: "three" });
    window.fetch.mockClear();

    // safe call with no options, even though this won't work
    expect(async () => sync(library)).not.toThrow();
    expect(window.fetch.mock.calls[0][0]).toEqual("/library");
    expect(window.fetch.mock.calls[0][1].method).not.toBeDefined();
    expect(window.fetch.mock.calls[0][1].params).toEqual({});
  });

  it("passing params", async () => {
    // GET
    await library.fetch({ params: { a: "a", one: 1 } });

    expect(window.fetch.mock.calls[0][0]).toEqual("/library?a=a&one=1");
    window.fetch.mockClear();

    // with body content: already stringified
    await library.add(attrs).at(0).save(null, { params: "somestring" });

    expect(window.fetch.mock.calls[0][0]).toEqual("/library");
    expect(window.fetch.mock.calls[0][1].body).toEqual("somestring");
    window.fetch.mockClear();

    // with body content: as JSON
    await library.at(0).save(null, { params: { a: "a", one: 1 } });
    expect(window.fetch.mock.calls[0][0]).toEqual("/library");
    expect(window.fetch.mock.calls[0][1].body).toEqual(JSON.stringify({ a: "a", one: 1 }));
    window.fetch.mockClear();

    // with body content: not as json
    await library.at(0).save(null, { params: { a: "a", one: 1 }, contentType: "resourcerer/json" });
    expect(window.fetch.mock.calls[0][0]).toEqual("/library");
    expect(window.fetch.mock.calls[0][1].body).toEqual("a=a&one=1");
  });

  it("passes urlOptions to the model to formulate the url path", async () => {
    var librarySectionBook;

    class LibrarySection extends Collection {
      url({ section }) {
        return `/library/${section}`;
      }
    }

    class LibrarySectionBook extends Model {
      url({ section, bookId }) {
        return `/library/${section}/${bookId}`;
      }
    }

    library = new LibrarySection([], { section: "nature" });
    await library.fetch({ params: { a: "a", one: 1 } });

    expect(window.fetch.mock.calls[0][0]).toEqual("/library/nature?a=a&one=1");
    // safe
    library = new LibrarySection();
    await library.fetch({ params: { a: "a", one: 1 } });
    expect(window.fetch.mock.calls[1][0]).toEqual("/library/undefined?a=a&one=1");

    librarySectionBook = new LibrarySectionBook(
      {},
      { section: "nature", bookId: "all-about-frogs" }
    );
    await librarySectionBook.fetch({ params: { a: "a", one: 1 } });
    expect(window.fetch.mock.calls[2][0]).toEqual("/library/nature/all-about-frogs?a=a&one=1");

    // safe
    librarySectionBook = new LibrarySectionBook();
    await librarySectionBook.fetch({ params: { a: "a", one: 1 } });
    expect(window.fetch.mock.calls[3][0]).toEqual("/library/undefined/undefined?a=a&one=1");
  });

  it("create", async () => {
    const { id, ...rest } = attrs;

    await library.create(rest, { wait: false });

    expect(window.fetch.mock.calls[0][0]).toEqual("/library");
    expect(window.fetch.mock.calls[0][1].method).toEqual("POST");
    expect(window.fetch.mock.calls[0][1].params).toEqual({
      title: "The Tempest",
      author: "Bill Shakespeare",
      length: 123,
    });
  });

  it("update", async () => {
    library.add(attrs);
    await library.at(0).save({ id: "1-the-tempest", author: "William Shakespeare" });

    expect(window.fetch.mock.calls[0][0]).toEqual("/library/1-the-tempest");
    expect(window.fetch.mock.calls[0][1].method).toEqual("PUT");
    expect(window.fetch.mock.calls[0][1].params).toEqual({
      id: "1-the-tempest",
      title: "The Tempest",
      author: "William Shakespeare",
      length: 123,
    });
  });

  it("read model", async () => {
    library.add(attrs);
    await library.at(0).save({ id: "2-the-tempest", author: "Tim Shakespeare" });
    await library.at(0).fetch();

    expect(window.fetch.mock.calls[1][0]).toEqual("/library/2-the-tempest");
    expect(window.fetch.mock.calls[1][1].method).toEqual("GET");
    expect(window.fetch.mock.calls[1][1].params).toEqual({});
  });

  it("destroy", async () => {
    library.add(attrs);
    await library.at(0).save({ id: "2-the-tempest", author: "Tim Shakespeare" });
    await library.at(0).destroy({ wait: true });

    expect(window.fetch.mock.calls[1][0]).toEqual("/library/2-the-tempest");
    expect(window.fetch.mock.calls[1][1].method).toEqual("DELETE");
    expect(window.fetch.mock.calls[1][1].params).toEqual({});
  });

  it("rejects non-2xx", async () => {
    window.fetch.mockResolvedValue(
      new Response(JSON.stringify({ test: "womp" }), { status: 500, type: "application/json" })
    );

    try {
      await library.fetch();
    } catch (err) {
      expect(err.json).toEqual({ test: "womp" });
    }
  });

  it("urlError", async () => {
    var model = new Model();

    expect(() => model.fetch()).toThrow();

    await model.fetch({ url: "/one/two" });
    expect(window.fetch.mock.calls[0][0]).toEqual("/one/two");
    window.fetch.mockClear();

    // url as property
    class _Model extends Model {
      url = "/library/one";
    }

    await new _Model().fetch();
    expect(window.fetch.mock.calls[0][0]).toEqual("/library/one");

    // url as undefined
    class __Model extends Model {
      url = undefined;
    }

    expect(() => new __Model().fetch()).toThrow();
  });

  it("default rejected promise callback just rejects again", async () => {
    window.fetch.mockRejectedValueOnce("response");
    library.add(attrs);

    try {
      await library.at(0).save({ id: "2-the-tempest", author: "Tim Shakespeare" });
    } catch (err) {
      expect(err).toEqual("response");
    }

    const errorMock = vi.fn(() => "override");
    // set status to 400 and fetch will have ok: false
    const errorResponse = new Response(JSON.stringify({ test: "response!" }, null, 2), {
      status: 400,
    });

    window.fetch.mockResolvedValue(errorResponse);
    // now use setRequestPrefilter to add error override
    setRequestPrefilter((options) => ({
      ...options,
      error: errorMock,
    }));

    try {
      await library.at(0).save({ id: "2-the-tempest", author: "Tim Shakespeare" });
    } catch (err) {
      expect(errorMock).toHaveBeenCalledWith(Object.assign(errorResponse, { json: {} }));
      expect(err).toEqual("override");
    }

    library.remove(attrs);
  });

  it("waits minDuration to resolve if one is passed", async () => {
    var resolved;

    library.fetch({ minDuration: 150 }).then(() => (resolved = true));
    await new Promise((res) => window.setTimeout(res, 50));
    expect(resolved).not.toBeDefined();
    await new Promise((res) => window.setTimeout(res, 50));
    expect(resolved).not.toBeDefined();
    await new Promise((res) => window.setTimeout(res, 50));
    expect(resolved).toBe(true);
  });

  describe("headers", () => {
    it("can override contentType in options", async () => {
      setRequestPrefilter((options) => ({
        ...options,
        contentType: "resourcerer/json",
      }));

      await library.add(attrs).at(0).save();

      expect(window.fetch.mock.calls[0][1].headers["Content-Type"]).toEqual("resourcerer/json");
    });

    it("can add any header in the 'headers' option", async () => {
      setRequestPrefilter((options) => ({
        ...options,
        headers: { Accept: "resourcerer/json", Authorization: "baaaaaad mofo" },
      }));

      await library.fetch();

      expect(window.fetch.mock.calls[0][1].headers).toEqual({
        Accept: "resourcerer/json",
        Authorization: "baaaaaad mofo",
      });
    });
  });
});
