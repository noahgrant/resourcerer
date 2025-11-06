import * as sync from "../lib/sync";
import Collection from "../lib/collection";
import Model from "../lib/model";
import { vi } from "vitest";

describe("Collection", () => {
  var collection,
    callback = vi.fn();

  beforeEach(() => {
    vi.spyOn(sync, "default").mockResolvedValue([]);
    vi.spyOn(Model.prototype, "unsubscribe");
  });

  afterEach(() => {
    collection = null;
    callback.mockClear();
    vi.restoreAllMocks();
  });

  it("is instantiated with appropriate internal properties", () => {
    collection = new Collection();

    expect(collection.length).toEqual(0);
    expect(collection.models).toEqual([]);
    expect(collection._byId).toEqual({});
  });

  it("can override class properties via the options hash", () => {
    class _Model extends Model {}
    class __Model extends Model {}

    class _Collection extends Collection {
      static Model = _Model;

      static comparator = "name";
    }

    collection = new _Collection();
    expect(collection.comparator).toEqual("name");
    expect(collection.Model).toEqual(_Model);

    collection = new _Collection([], { Model: __Model, comparator: "email" });
    expect(collection.comparator).toEqual("email");
    expect(collection.Model).toEqual(__Model);
  });

  it("unreserved option items are assigned to a `urlOptions` instance property", () => {
    collection = new Collection([], { one: 1, two: 2, comparator: "foo", parse: true });

    expect(collection.urlOptions).toEqual({ one: 1, two: 2 });
    expect(collection.toJSON()).toEqual([]);
  });

  it("urlOptions get passed down to models", async () => {
    collection = new Collection([{ id: "1" }], { one: 1, two: 2, comparator: "foo", parse: true });

    expect(collection.get("1").urlOptions).toEqual({ one: 1, two: 2 });

    collection.add({ id: "2" });
    expect(collection.get("2").urlOptions).toEqual({ one: 1, two: 2 });

    sync.default.mockResolvedValue([[{ id: "3" }], {}]);
    await collection.fetch();
    expect(collection.get("3").urlOptions).toEqual({ one: 1, two: 2 });
  });

  it("adds any models passed to its models list", () => {
    var model1 = new Model(),
      model2 = new Model();

    collection = new Collection([model1, model2]);
    expect(collection.models).toEqual([model1, model2]);

    collection = new Collection([{ id: "model3" }, { id: "model4" }]);
    expect(collection.models.map((model) => model.toJSON())).toEqual([
      { id: "model3" },
      { id: "model4" },
    ]);
    expect(collection.toJSON()).toEqual([{ id: "model3" }, { id: "model4" }]);
  });

  it("toJSON returns an data attributes for each model", () => {
    collection = new Collection([new Model({ id: "model1" }), new Model({ id: "model2" })]);
    expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }]);
  });

  it("collection.sync proxies the sync module", () => {
    collection = new Collection();
    collection.sync("GET", {});
    expect(sync.default).toHaveBeenCalledWith("GET", {});
  });

  describe("add", () => {
    it("appends a model to a collection", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }]);
      collection.onUpdate(callback);

      collection.add({ id: "model3" });
      expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      expect(callback).toHaveBeenCalled();
      callback.mockClear();

      collection.add({ id: "model3" });
      expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes a model from a collection", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      expect(collection.get("model2")).toBeDefined();
      expect(collection.length).toEqual(3);

      collection.remove({ id: "model2" });
      expect(Model.prototype.unsubscribe).toHaveBeenCalledTimes(1);
      expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model3" }]);
      expect(collection.length).toEqual(2);
      expect(collection.get("model2")).not.toBeDefined();

      collection.remove([{ id: "model1" }, { id: "model3" }]);
      expect(collection.toJSON()).toEqual([]);
      expect(collection.length).toEqual(0);

      expect(Model.prototype.unsubscribe).toHaveBeenCalledTimes(3);
    });

    it("does not trigger an update if the `silent` flag is passed", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.onUpdate(callback);

      collection.remove({ id: "model2" });
      expect(callback).toHaveBeenCalled();
      callback.mockClear();

      collection.remove({ id: "model1" }, { silent: true });
      expect(callback).not.toHaveBeenCalled();
      expect(Model.prototype.unsubscribe).toHaveBeenCalledTimes(2);
    });

    it("does not trigger an update if nothing was removed", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.onUpdate(callback);

      collection.remove({ id: "model5" });
      expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("removes all existing models and adds new ones", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.reset();

      expect(collection.toJSON()).toEqual([]);
      expect(collection.get("model1")).not.toBeDefined();
      expect(collection.get("model2")).not.toBeDefined();
      expect(collection.get("model3")).not.toBeDefined();
      expect(collection.length).toEqual(0);

      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.reset([{ id: "model4" }, { id: "model5" }, { id: "model6" }]);
      expect(collection.toJSON()).toEqual([{ id: "model4" }, { id: "model5" }, { id: "model6" }]);
      expect(collection.get("model4")).toBeDefined();
      expect(collection.get("model5")).toBeDefined();
      expect(collection.get("model6")).toBeDefined();
      expect(collection.length).toEqual(3);
    });

    it("does not trigger an update if passed the `silent` flag", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.onUpdate(callback);
      collection.reset();

      expect(callback).toHaveBeenCalled();
      callback.mockClear();

      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.onUpdate(callback);
      collection.reset([], { silent: true });
      expect(collection.toJSON()).toEqual([]);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("set", () => {
    beforeEach(() => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.onUpdate(callback);
    });

    it("adds a list of attribues as models to the collection", () => {
      collection.set([{ id: "model4" }, { id: "model5" }]);
      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3" },
        { id: "model4" },
        { id: "model5" },
      ]);
    });

    it("adds a single set of attributes as a model to the collection", () => {
      collection.set({ id: "model4" });
      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3" },
        { id: "model4" },
      ]);
    });

    it("parses attributes before setting if `parse` flag is set", () => {
      // here we parse an existing model
      collection.at(2).parse = (attrs) => ({ id: "model3_parsed" });
      collection.set({ id: "model3" }, { parse: true });
      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3_parsed" },
      ]);

      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);

      collection.parse = (resp) => resp.map((item, i) => ({ ...item, index: i }));
      collection.set([{ id: "model4" }, { id: "model5" }], { parse: true });

      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3" },
        { id: "model4", index: 0 },
        { id: "model5", index: 1 },
      ]);

      collection.parse = (resp) => resp.map((item, i) => ({ ...item, index: i }));
      collection.set(new Model({ id: "model6" }), { parse: true });

      // parse does not happen because it's a model instance already
      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3" },
        { id: "model4", index: 0 },
        { id: "model5", index: 1 },
        { id: "model6" },
      ]);
    });

    it("adds existing models as a models on a collection", () => {
      class _Model extends Model {}

      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.set([
        new _Model({ id: "model4" }),
        new _Model({ id: "model3" }),
        new _Model({ id: "model3" }),
      ]);

      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3" },
        { id: "model4" },
      ]);

      expect(collection.get("model4") instanceof _Model).toBe(true);
      expect(collection.get("model3") instanceof _Model).toBe(false);
    });

    it("parses attributes first if the `parse` flag is set", () => {
      class _Model extends Model {
        parse(attrs) {
          return { ...attrs, id: `${attrs.id}_parsed` };
        }
      }

      collection = new Collection([], { Model: _Model });
      collection.set([{ id: "model1" }, { id: "model2" }, { id: "model3" }], { parse: true });
      expect(collection.toJSON()).toEqual([
        { id: "model1_parsed" },
        { id: "model2_parsed" },
        { id: "model3_parsed" },
      ]);
    });

    it("merges changes to an existing model", () => {
      collection.set({ id: "model3", name: "noah" });

      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3", name: "noah" },
      ]);
    });

    it("appends a new model if no sorting comparator", () => {
      collection.set({ id: "model0" });

      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3" },
        { id: "model0" },
      ]);
    });

    it("re-sorts the collection if a new model is added with a sorting comparator", () => {
      collection = new Collection(
        [
          { id: "model1", name: "noah" },
          { id: "model2", name: "zorah" },
        ],
        { comparator: "name" },
      );

      collection.set({ id: "model3", name: "alex" });

      expect(collection.toJSON()).toEqual([
        { id: "model3", name: "alex" },
        { id: "model1", name: "noah" },
        { id: "model2", name: "zorah" },
      ]);
    });

    it("does not trigger an update if the `silent` flag is passed", () => {
      collection.set([{ id: "model4" }], { silent: true });
      expect(callback).not.toHaveBeenCalled();

      collection.set([{ id: "model4" }]);
      expect(callback).toHaveBeenCalled();

      collection.set([{ id: "model5" }]);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("is a noop if no models are passed", () => {
      collection.set();
      expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
    });
  });

  describe("get", () => {
    var model1 = new Model({ id: "model1" }),
      model2 = new Model({ id: "model2" });

    beforeEach(() => {
      collection = new Collection([model1, model2]);
    });

    it("returns undefined if a falsey, non-number is passed", () => {
      expect(collection.get()).not.toBeDefined();
      expect(collection.get(null)).not.toBeDefined();
      collection.set({ id: 0 });
      expect(collection.get(0)).toBeDefined();
    });

    it("returns a model at its client id, its id, or by passing those attributes", () => {
      expect(collection.get("model1")).toEqual(model1);
      expect(collection.get(model1.cid)).toEqual(model1);
      expect(collection.get(model1)).toEqual(model1);
      expect(collection.get(model1.toJSON())).toEqual(model1);
    });
  });

  describe("has", () => {
    it("returns true if a model exists for a given id", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }]);
      expect(collection.has("model1")).toBe(true);
      expect(collection.has({ id: "model1" })).toBe(true);
      expect(collection.has("model3")).toBe(false);
      expect(collection.has()).toBe(false);
    });
  });

  describe("helper methods", () => {
    var model1 = new Model({ id: "model1" }),
      model2 = new Model({ id: "model2" }),
      model3 = new Model({ id: "model3" });

    beforeEach(() => {
      collection = new Collection([model1, model2, model3]);
    });

    describe("at", () => {
      it("returns the model at a specific index", () => {
        expect(collection.at(0)).toEqual(model1);
        expect(collection.at(1)).toEqual(model2);
        expect(collection.at(2)).toEqual(model3);
        expect(collection.at(3)).not.toBeDefined();
      });

      it("returns the model at a specific index from the end for a negative index", () => {
        expect(collection.at(-1)).toEqual(model3);
        expect(collection.at(-2)).toEqual(model2);
        expect(collection.at(-3)).toEqual(model1);
        expect(collection.at(-4)).not.toBeDefined();
      });
    });

    describe("map", () => {
      it("runs a map function across the models", () => {
        collection.map((model, i) => model.set({ index: i }));
        expect(collection.toJSON()).toEqual([
          { id: "model1", index: 0 },
          { id: "model2", index: 1 },
          { id: "model3", index: 2 },
        ]);
      });
    });

    describe("find", () => {
      it("finds the first model that passes the predicate", () => {
        expect(collection.find((model, i) => i === 1)).toEqual(model2);
        expect(collection.find((model, i) => /model/.test(model.id))).toEqual(model1);
      });
    });

    describe("filter", () => {
      it("returns all models that pass the predicate", () => {
        expect(collection.filter((model, i) => i > 0)).toEqual([model2, model3]);
      });
    });

    describe("findWhere", () => {
      it("runs a find with shorthand", () => {
        expect(collection.findWhere({ id: "model2" })).toEqual(model2);
      });
    });

    describe("where", () => {
      it("runs filter with shorthand", () => {
        expect(collection.where({ id: "model2" })).toEqual([model2]);
        expect(collection.where({ id: "model4" })).toEqual([]);
      });
    });

    describe("pluck", () => {
      it("picks out a property from all models", () => {
        expect(collection.pluck("id")).toEqual(["model1", "model2", "model3"]);
      });
    });

    describe("slice", () => {
      it("returns a subarray of models", () => {
        expect(collection.slice(-2)).toEqual([model2, model3]);
        expect(collection.slice(0, 1)).toEqual([model1]);
      });
    });

    describe("sort", () => {
      beforeEach(() => {
        collection = new Collection([
          { id: "model1", name: "noah" },
          { id: "model2", name: "zorah" },
          { id: "model3", name: "alex" },
        ]);
      });

      it("throws if no comparator exists on a collection", () => {
        expect(() => collection.sort()).toThrowError("Cannot sort a set without a comparator");
      });

      it("can sort by property", () => {
        collection.comparator = "name";
        collection.sort();

        expect(collection.toJSON()).toEqual([
          { id: "model3", name: "alex" },
          { id: "model1", name: "noah" },
          { id: "model2", name: "zorah" },
        ]);
      });

      it("can sort by function with one argument", () => {
        collection.comparator = (model) => model.get("name");
        collection.sort();

        expect(collection.toJSON()).toEqual([
          { id: "model3", name: "alex" },
          { id: "model1", name: "noah" },
          { id: "model2", name: "zorah" },
        ]);
      });

      it("can sort by function with two arguments", () => {
        collection.comparator = (left, right) => (left.get("name") > right.get("name ") ? -1 : 1);
        collection.sort();

        expect(collection.toJSON()).toEqual([
          { id: "model1", name: "noah" },
          { id: "model2", name: "zorah" },
          { id: "model3", name: "alex" },
        ]);
      });
    });
  });

  describe("fetch", () => {
    var response = {};

    beforeEach(() => {
      collection = new Collection();
      collection.parse = (resp) => resp.map((item, i) => ({ ...item, index: i }));

      sync.default.mockResolvedValue([[{ id: "one" }, { id: "two" }], response]);
    });

    it("calls sync with a GET method", async () => {
      await collection.fetch();

      expect(sync.default).toHaveBeenCalledWith(collection, { method: "GET", parse: true });
      await collection.fetch({ method: "POST", url: "/books" });

      expect(sync.default).toHaveBeenCalledWith(collection, {
        method: "POST",
        parse: true,
        url: "/books",
      });
    });

    it("triggers an update on returning", async () => {
      var request;

      collection.onUpdate(callback);
      request = collection.fetch();
      expect(callback).not.toHaveBeenCalled();

      await request;
      expect(callback).toHaveBeenCalled();
      expect(collection.toJSON()).toEqual([
        { id: "one", index: 0 },
        { id: "two", index: 1 },
      ]);
      collection.reset();
      callback.mockClear();

      await collection.fetch({ parse: false });
      expect(callback).toHaveBeenCalled();
      expect(collection.toJSON()).toEqual([{ id: "one" }, { id: "two" }]);
    });

    it("resolves a tuple of the collection instance and repsonse object", async () => {
      expect(await collection.fetch()).toEqual([collection, response]);
    });

    it("rejects the response", async () => {
      sync.default.mockRejectedValue(response);

      try {
        await collection.fetch();
      } catch (err) {
        expect(err).toEqual(response);
      }
    });
  });

  describe("create", () => {
    var response = {};

    beforeEach(() => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }]);
      sync.default.mockResolvedValue([{ id: "model3" }, response]);
    });

    it("combines adding model to the collection and saving the model to the server", async () => {
      var request = collection.create({ name: "model3" });

      expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }, { name: "model3" }]);

      await request;
      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3", name: "model3" },
      ]);
    });

    it("if `wait` is true, does not add the model until the request returns", async () => {
      var request = collection.create({ name: "model3" }, { wait: true });

      expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }]);

      await request;
      expect(collection.toJSON()).toEqual([
        { id: "model1" },
        { id: "model2" },
        { id: "model3", name: "model3" },
      ]);
    });

    it("resolves a tuple of the model instance and repsonse object", async () => {
      expect(await collection.create({ name: "model3" })).toEqual([
        collection.get("model3"),
        response,
      ]);
    });

    it("rejects the response and removes the model from the collection if added", async () => {
      sync.default.mockRejectedValue(response);

      try {
        await collection.create({ name: "model3" });
      } catch (err) {
        expect(err).toEqual(response);
        expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }]);
      }

      try {
        await collection.create({ name: "model3" }, { wait: true });
      } catch (err) {
        expect(err).toEqual(response);
        expect(collection.toJSON()).toEqual([{ id: "model1" }, { id: "model2" }]);
      }
    });
  });

  describe("parse", () => {
    it("is by default the identity function", () => {
      collection = new Collection();
      expect(collection.parse({ foo: "bar" })).toEqual({ foo: "bar" });
    });
  });

  describe("setting a model id attribute", () => {
    it("on the model sets the id attributes for all models", () => {
      class _Model extends Model {
        static idAttribute = "name";
      }

      // default is just id
      collection = new Collection();
      collection.add({ id: "noahgrant", name: "Noah Grant" });
      expect(collection.get("noahgrant")).toBeDefined();
      expect(collection.get("Noah Grant")).not.toBeDefined();
      expect(collection.get("noahgrant").id).toEqual("noahgrant");
      expect(collection.Model.idAttribute).toEqual("id");

      collection = new Collection([], { Model: _Model });
      collection.add({ id: "noahgrant", name: "Noah Grant" });
      expect(collection.get("noahgrant")).not.toBeDefined();
      expect(collection.get("Noah Grant")).toBeDefined();
      expect(collection.get("Noah Grant").id).toEqual("Noah Grant");
      expect(collection.Model.idAttribute).toEqual("name");
    });

    it("on the collection sets the id attribute for its models", () => {
      class _Collection extends Collection {
        static idAttribute = "name";
      }

      collection = new _Collection();
      collection.add({ id: "noahgrant", name: "Noah Grant" });
      expect(collection.get("noahgrant")).not.toBeDefined();
      expect(collection.get("Noah Grant")).toBeDefined();
      expect(collection.get("Noah Grant").id).toEqual("Noah Grant");
      expect(collection.Model.idAttribute).toEqual("name");
    });
  });

  describe("unsubscribe", () => {
    it("unsubscribes all models in the collection", () => {
      collection = new Collection([{ id: "model1" }, { id: "model2" }, { id: "model3" }]);
      collection.unsubscribe();
      expect(Model.prototype.unsubscribe).toHaveBeenCalledTimes(3);
      expect(collection).toHaveLength(3);
    });
  });

  describe("_updateModelReference", () => {
    it("updates the reference to a model when its id changes", () => {
      var model = new Model({ id: "model1" });

      collection = new Collection(model);
      expect(model.collection).toEqual(collection);
      expect(collection.get("model1")).toEqual(model);

      model.set({ id: "1model" });
      expect(collection.get("model1")).not.toBeDefined();
      expect(collection.get("1model")).toEqual(model);
    });

    it("does not add a reference if the id does not exist", () => {
      var model = new Model({ id: "model1" });

      collection = new Collection(model);
      collection._updateModelReference(null, "model1", model);
      expect(collection.get("model1")).toEqual(model);
      expect(collection.get(null)).not.toBeDefined();
    });
  });
});
