import * as sync from "../lib/sync";
import CanonicalModel from "../lib/canonical-model";
import { canonicalModelCache } from "../lib/canonical-model-cache";

import Collection from "../lib/collection";
import Model from "../lib/model";
import { vi } from "vitest";

describe("Model", () => {
  var model,
    collection,
    callback = vi.fn();

  beforeEach(() => {
    vi.spyOn(sync, "default").mockResolvedValue([]);
  });

  afterEach(() => {
    model = collection = null;
    sync.default.mockRestore();
    callback.mockClear();
  });

  it("is given a cid", () => {
    model = new Model();

    expect(model.cid).toBeDefined();
    expect(model.cid.startsWith("c")).toBe(true);
  });

  it("has expected default static properties", () => {
    expect(Model.idAttribute).toEqual("id");
    expect(Model.dependencies).toEqual([]);
    expect(Model.defaults).toEqual({});
  });

  it("gets its collection assigned to a `collection` property if passed", () => {
    model = new Model();
    collection = new Collection();

    expect(model.collection).not.toBeDefined();

    model = new Model({}, { collection });
    expect(model.collection).toEqual(collection);
  });

  it("parses its attributes before being set if passed a `parse: true` option", () => {
    class _Model extends Model {
      parse(attrs) {
        return Object.keys(attrs).reduce(
          (memo, attr) => Object.assign(memo, { [attr]: attrs[attr] + 5 }),
          {},
        );
      }
    }

    class __Model extends Model {
      parse() {}
    }

    model = new _Model({ one: 1, two: 2 });
    expect(model.toJSON()).toEqual({ one: 1, two: 2 });

    model = new _Model({ one: 1, two: 2 }, { parse: true });
    expect(model.toJSON()).toEqual({ one: 6, two: 7 });
    model = new __Model({ one: 1, two: 2 }, { parse: true });
    expect(model.toJSON()).toEqual({});
  });

  it("unreserved option items are assigned to a `urlOptions` instance property", () => {
    model = new Model({}, { one: 1, two: 2, parse: true, silent: true });

    expect(model.urlOptions).toEqual({ one: 1, two: 2 });
  });

  it("can optionally have defaults that are a function", () => {
    class _Model extends Model {
      static defaults = { one: 1, two: 2 };
    }

    model = new _Model({ two: 5 });
    expect(model.toJSON()).toEqual({ one: 1, two: 5 });

    class __Model extends Model {
      static defaults() {
        return { one: 1, two: 2 };
      }
    }

    model = new __Model({ two: 5 });
    expect(model.toJSON()).toEqual({ one: 1, two: 5 });
  });

  it("model.sync proxies the sync module", () => {
    model = new Model();
    model.sync("GET", {});
    expect(sync.default).toHaveBeenCalledWith("GET", {});
  });

  describe("get", () => {
    it("returns the value of the data at the given property", () => {
      model = new Model({ one: "one", two: null });

      expect(model.get("one")).toEqual("one");
      expect(model.get("two")).toBe(null);
    });
  });

  describe("has", () => {
    it("returns the true if there is a defined, non-null value at the given property", () => {
      model = new Model({ one: "one", two: null, three: undefined, four: 0 });

      expect(model.has("one")).toBe(true);
      expect(model.has("two")).toBe(false);
      expect(model.has("three")).toBe(false);
      expect(model.has("four")).toBe(true);
    });
  });

  describe("pick", () => {
    it("returns a subset of a model's attributes", () => {
      model = new Model({ one: "one", two: null, three: undefined, four: 0 });

      expect(model.pick("one", "two", "five")).toEqual({ one: "one" });
    });
  });

  describe("set", () => {
    it("sets new attributes on a model", () => {
      model = new Model().set({ one: "one", two: 2 });
      expect(model.toJSON()).toEqual({ one: "one", two: 2 });
    });

    describe("triggers an update", () => {
      beforeEach(() => {
        model = new Model({ id: "1234", one: "one", two: { three: "four" } });
        model.onUpdate(callback);
      });

      it("if a value has changed", () => {
        model.set({ one: "one" });
        expect(callback).not.toHaveBeenCalled();

        model.set({ two: { three: "four" } });
        expect(callback).not.toHaveBeenCalled();

        model.set({ one: "five" });
        expect(callback).toHaveBeenCalled();

        callback.mockClear();
        model = new Model();
        model.set();
        expect(callback).not.toHaveBeenCalled();
      });

      it("unless the `silent` option is passed", () => {
        model.set({ one: "five" }, { silent: true });
        expect(callback).not.toHaveBeenCalled();
      });
    });

    it("updates its id property, if appropriate, as well as that of the collection", () => {
      model = new Model({ id: "1234", one: "one", two: { three: "four" } });
      collection = new Collection();

      expect(model.id).toEqual("1234");
      model.set({ id: "2345" });
      expect(model.id).toEqual("2345");

      model = new Model({ id: "1234" });
      collection.add(model);
      expect(collection.has("1234")).toBe(true);

      model.set({ id: "2345" });
      expect(collection.has("1234")).toBe(false);
      expect(collection.has("2345")).toBe(true);
    });
  });

  describe("unset", () => {
    it("removes an attribute from a model's data", () => {
      model = new Model({ one: "one", two: null, three: undefined, four: 0 });

      model.unset("two");
      expect(model.toJSON()).toEqual({ one: "one", three: undefined, four: 0 });
    });
  });

  describe("clear", () => {
    it("removes all attributes from a model", () => {
      model = new Model({ one: "one", two: null, three: undefined, four: 0 });

      model.clear();
      expect(model.toJSON()).toEqual({});
    });
  });

  describe("fetch", () => {
    var response = {};

    beforeEach(() => {
      class _Model extends Model {
        parse(resp) {
          return resp.data;
        }
      }

      model = new _Model();
      sync.default.mockResolvedValue([{ data: { one: "one", two: "two" } }, response]);
    });

    it("calls sync with a GET method", async () => {
      await model.fetch();

      expect(sync.default).toHaveBeenCalledWith(model, { method: "GET", parse: true });
      await model.fetch({ method: "POST", url: "/library" });

      expect(sync.default).toHaveBeenCalledWith(model, {
        method: "POST",
        parse: true,
        url: "/library",
      });
    });

    it("triggers an update on returning", async () => {
      var request;

      model.onUpdate(callback);
      request = model.fetch();
      expect(callback).not.toHaveBeenCalled();

      await request;
      expect(callback).toHaveBeenCalled();
      expect(model.toJSON()).toEqual({ one: "one", two: "two" });
      model.clear();
      callback.mockClear();

      await model.fetch({ parse: false });
      expect(callback).toHaveBeenCalled();
      expect(model.toJSON()).toEqual({ data: { one: "one", two: "two" } });
    });

    it("resolves a tuple of the model instance and repsonse object", async () => {
      expect(await model.fetch()).toEqual([model, response]);
    });

    it("rejects the response", async () => {
      sync.default.mockRejectedValue(response);

      try {
        await model.fetch();
      } catch (err) {
        expect(err).toEqual(response);
      }
    });
  });

  describe("save", () => {
    var response = {};

    class _Model extends Model {
      parse(resp) {
        return resp.data;
      }
    }

    beforeEach(() => {
      model = new _Model({ one: "one" });
      sync.default.mockResolvedValue([{ data: { one: "one", two: "two" } }, response]);
    });

    it("calls sync with a write method", async () => {
      await model.save();

      expect(sync.default).toHaveBeenCalledWith(model, { parse: true, method: "POST" });

      model = new _Model({ id: "1234" });
      await model.save({ one: "one" });
      expect(sync.default).toHaveBeenCalledWith(model, { parse: true, method: "PUT" });
      expect(model.get("one")).toEqual("one");

      model = new _Model({ id: "1234" });
      await model.save({ one: "one" }, { patch: true });
      expect(sync.default).toHaveBeenCalledWith(model, {
        parse: true,
        patch: true,
        method: "PATCH",
        attrs: { one: "one" },
      });
    });

    it("parses results unless `parse` is set to false", async () => {
      var result;

      model.onUpdate(callback);

      result = await model.save();
      expect(model.toJSON()).toEqual({ one: "one", two: "two" });
      expect(result).toEqual([model, response]);

      model.clear();
      callback.mockClear();

      await model.save({ three: "three" }, { parse: false });
      expect(model.toJSON()).toEqual({ data: { one: "one", two: "two" }, three: "three" });
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("does not set attributes until after the request returns when `wait` is true", async () => {
      var result;

      model.onUpdate(callback);

      result = model.save({ three: "three" }, { wait: true });
      expect(callback).not.toHaveBeenCalled();
      expect(model.toJSON()).toEqual({ one: "one" });

      await result;

      expect(callback).toHaveBeenCalled();
      expect(model.toJSON()).toEqual({ one: "one", two: "two", three: "three" });
    });

    it("restores previous attributes if error", async () => {
      sync.default.mockRejectedValue(response);

      try {
        await model.save({ one: "two", two: "three" });
      } catch (err) {
        expect(err).toEqual(response);
        expect(model.toJSON()).toEqual({ one: "one" });
      }

      try {
        await model.save({ one: "two", two: "three" }, { wait: true });
      } catch (err) {
        expect(err).toEqual(response);
        expect(model.toJSON()).toEqual({ one: "one" });
      }
    });
  });

  describe("destroy", () => {
    var response = {};

    beforeEach(() => {
      model = new Model({ id: "1234" });
      sync.default.mockResolvedValue([undefined, response]);
    });

    it("resolves immediately if new", async () => {
      model = new Model();

      expect(await model.destroy()).toEqual([model, undefined]);
    });

    it("calls sync with a DELETE method", async () => {
      await model.destroy();

      expect(sync.default).toHaveBeenCalledWith(model, { method: "DELETE" });
      await model.destroy({ url: "/library" });

      expect(sync.default).toHaveBeenCalledWith(model, { method: "DELETE", url: "/library" });
    });

    it("resolves a tuple of the model instance and repsonse object", async () => {
      expect(await model.destroy()).toEqual([model, response]);
    });

    it("rejects the response", async () => {
      sync.default.mockRejectedValue(response);

      try {
        await model.destroy();
      } catch (err) {
        expect(err).toEqual(response);
      }
    });

    it("updates immediately if `wait` is false", async () => {
      var request;

      collection = new Collection([model]);
      model.onUpdate(callback);
      expect(collection.has(model.id)).toBe(true);

      request = model.destroy();

      expect(callback).toHaveBeenCalled();
      expect(collection.has(model.id)).toBe(false);
      await request;
    });

    it("updates when the promise resolves if `wait` is true", async () => {
      var request;

      collection = new Collection([model]);
      model.onUpdate(callback);
      expect(collection.has(model.id)).toBe(true);

      request = model.destroy({ wait: true });

      expect(callback).not.toHaveBeenCalled();
      expect(collection.has(model.id)).toBe(true);
      await request;

      expect(callback).toHaveBeenCalled();
      expect(collection.has(model.id)).toBe(false);
    });

    it("adds the model back to its collection when the promise rejects if `wait` is false", async () => {
      var request,
        collectionCallback = vi.fn();

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
        await model.destroy({ wait: true });
      } catch (err) {
        expect(collectionCallback).not.toHaveBeenCalled();
        expect(collection.has(model.id)).toBe(true);
        expect(err).toEqual(response);
      }
    });
  });

  describe("url", () => {
    it("throws if there is no overridden url property and the model is not in a collection", () => {
      model = new Model();

      expect(() => model.url()).toThrowError('A "url" property or function must be specified');
      model.urlRoot = "/library";
      expect(model.url()).toEqual("/library");

      collection = new Collection();
      collection.url = "/library";
      model = new Model({}, { collection });
      expect(model.url()).toEqual("/library");
    });

    it("appends its id to the url if not new", () => {
      class _Model extends Model {
        static idAttribute = "name";
      }

      model = new _Model({ name: "noah?grant" });
      model.urlRoot = () => "/library";
      expect(model.url()).toEqual("/library/noah%3Fgrant");

      collection = new Collection();
      collection.url = () => "/library";
      model = new _Model({ name: "noah?grant" }, { collection });
      expect(model.url()).toEqual("/library/noah%3Fgrant");
    });

    it("is called by default with its urlOptions", () => {
      class _Model extends Model {
        urlRoot({ section }) {
          return `/library/${section}`;
        }
      }

      model = new _Model({}, { section: "nature" });
      expect(model.url()).toEqual("/library/nature");

      collection = new Collection();
      collection.url = ({ section }) => `/library/${section}`;
      model = new Model({}, { collection, section: "history" });
      expect(model.url()).toEqual("/library/history");
    });
  });

  describe("parse", () => {
    it("is by default the identity function", () => {
      model = new Model();
      expect(model.parse({ foo: "bar" })).toEqual({ foo: "bar" });
    });
  });

  describe("isNew", () => {
    it("returns true if the model has an id attribute", () => {
      class _Model extends Model {
        static idAttribute = "name";
      }

      model = new Model();
      expect(model.isNew()).toBe(true);
      model.set({ id: "1234" });
      expect(model.isNew()).toBe(false);

      model = new _Model({ id: "1234" });
      expect(model.isNew()).toBe(true);
      model.set({ name: "noah" });
      expect(model.isNew()).toBe(false);
    });
  });

  describe("subscriptions", () => {
    let sourceModel, targetModel;

    beforeEach(() => {
      sourceModel = new SubscribingSourceModel();
      targetModel = new SubscribingTargetModel();
    });

    afterEach(() => {
      sourceModel.unsubscribe();
      targetModel.unsubscribe();
      canonicalModelCache.clear();
    });

    describe("are not made", () => {
      it("if the model is the empty model", async () => {
        vi.spyOn(targetModel, "fetch").mockResolvedValue([{}, {}]);

        targetModel.isEmptyModel = true;
        await targetModel.fetch();
        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).toBeUndefined();
        delete targetModel.isEmptyModel;
      });

      it("if the model is new", () => {
        // there is no id linking them, so no subscriptions will be made
        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).toBeUndefined();
      });

      it("if the subscribe option is false when the model is instantiated", () => {
        sourceModel = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });
        targetModel = new SubscribingTargetModel({ id: "1234", subscribe: false });

        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).toBeUndefined();
      });

      it("if the model is already subscribed", () => {
        targetModel = new SubscribingTargetModel({ id: "1234" });
        sourceModel = new SubscribingSourceModel();

        vi.spyOn(targetModel, "set");

        targetModel._subscribe();
        targetModel._subscribe();
        targetModel._subscribe();
        targetModel._subscribe();

        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).toBe("C. Zorah");
        // only called once!
        expect(targetModel.set).toHaveBeenCalledTimes(1);
      });
    });

    describe("are made", () => {
      it("when the model is instantiated", () => {
        targetModel = new SubscribingTargetModel({ id: "1234" });

        vi.spyOn(targetModel, "set");
        sourceModel = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });

        expect(targetModel.get("name")).toBe("C. Zorah");
        expect(targetModel.set).toHaveBeenCalledTimes(1);
      });

      it("when the model is fetched", async () => {
        // no id yet, so no subscription made
        targetModel = new SubscribingTargetModel();
        // id will return on the fetch
        vi.spyOn(targetModel, "sync").mockResolvedValue([{ id: "1234" }, {}]);

        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).not.toBe("C. Zorah");

        await targetModel.fetch();

        sourceModel.set({ _id: "1234", name: "Zorah 2" });
        expect(targetModel.get("name")).toBe("C. Zorah 2");
      });

      it("when the model is saved", async () => {
        // no id yet, so no subscription made
        targetModel = new SubscribingTargetModel();
        // id will return on the save
        vi.spyOn(targetModel, "sync").mockResolvedValue([{ id: "1234" }, {}]);

        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).not.toBe("C. Zorah");

        await targetModel.save();

        sourceModel.set({ _id: "1234", name: "Zorah 2" });
        expect(targetModel.get("name")).toBe("C. Zorah 2");
      });
    });

    describe("are not updated", () => {
      it("if the subscribe option is false", () => {
        sourceModel = new SubscribingSourceModel();
        targetModel = new SubscribingTargetModel({ id: "1234" });

        sourceModel.set({ _id: "1234", name: "Zorah" }, { subscribe: false });
        expect(targetModel.get("name")).not.toBeDefined();
      });

      it("if the source options is 'subscription'", () => {
        sourceModel = new SubscribingSourceModel();
        targetModel = new SubscribingTargetModel({ id: "1234" });

        sourceModel.set({ _id: "1234", name: "Zorah" }, { source: "subscription" });
        expect(targetModel.get("name")).not.toBeDefined();
      });

      it("if nothing changes", () => {
        vi.spyOn(SubscribingTargetModel.prototype, "_updateSubscriptions");

        sourceModel = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });
        targetModel = new SubscribingTargetModel({ id: "1234", name: "C. Zorah" });

        expect(SubscribingTargetModel.prototype._updateSubscriptions).toHaveBeenCalledTimes(1);
        SubscribingTargetModel.prototype._updateSubscriptions.mockClear();

        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(SubscribingTargetModel.prototype._updateSubscriptions).not.toHaveBeenCalled();
      });
    });
  });

  describe("_subscribe", () => {
    beforeEach(() => {
      vi.spyOn(CanonicalModel.prototype, "onUpdate").mockReturnValue();
      vi.spyOn(CanonicalModel.prototype, "offUpdate").mockReturnValue();
    });

    describe("does nothing", () => {
      it("if the model is the empty model", () => {
        const emptyModel = new SubscribingTargetModel();

        emptyModel.isEmptyModel = true;
        emptyModel._subscribe();

        expect(CanonicalModel.prototype.onUpdate).not.toHaveBeenCalled();
        expect(CanonicalModel.prototype.offUpdate).not.toHaveBeenCalled();
      });

      it("if the model has no canonical model id", () => {
        const model = new SubscribingTargetModel({ name: "Zorah" });

        model._subscribe();

        expect(CanonicalModel.prototype.onUpdate).not.toHaveBeenCalled();
        expect(CanonicalModel.prototype.offUpdate).not.toHaveBeenCalled();
      });
    });

    describe("the id field", () => {
      it("can come from attributes set on the model", () => {
        const model = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });

        model._subscribe();

        expect(CanonicalModel.prototype.onUpdate).toHaveBeenCalled();
        expect(CanonicalModel.prototype.offUpdate).toHaveBeenCalledWith(model);
      });

      it("can come from the attributes passed to the _subscribe method", () => {
        const model = new SubscribingSourceModel();

        model._subscribe({ _id: "1234", name: "Zorah" });

        expect(CanonicalModel.prototype.onUpdate).toHaveBeenCalled();
        expect(CanonicalModel.prototype.offUpdate).toHaveBeenCalledWith(model);
      });

      it("can be nested with a dot-separated string", () => {
        class NestedSubscribingSourceModel extends SubscribingSourceModel {
          static subscriptions = [
            {
              Model: CanonicalTestModel,
              idField: "nested._id",
            },
          ];
        }

        const model = new NestedSubscribingSourceModel({ nested: { _id: "1234", name: "Zorah" } });

        model._subscribe();

        expect(CanonicalModel.prototype.onUpdate).toHaveBeenCalled();
        expect(CanonicalModel.prototype.offUpdate).toHaveBeenCalledWith(model);
      });
    });

    describe("the onUpdate callback", () => {
      describe("does nothing", () => {
        it("if the context is the same as the model instance", () => {
          const model = new SubscribingTargetModel({ id: "1234", name: "Zorah" });
          const model2 = new SubscribingTargetModel({ id: "1234", name: "Zorah" });

          vi.spyOn(model, "set");

          expect(CanonicalModel.prototype.onUpdate).toHaveBeenCalled();
          // same context
          CanonicalModel.prototype.onUpdate.mock.calls[0][0]({ name: "Zorah 2" }, model);

          expect(model.set).not.toHaveBeenCalled();
        });

        it("if there is no fromSource function", () => {
          // the source model is toSource only
          const model = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });
          const model2 = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });

          vi.spyOn(model, "set");

          expect(CanonicalModel.prototype.onUpdate).toHaveBeenCalled();
          // different context
          CanonicalModel.prototype.onUpdate.mock.calls[0][0]({ name: "Zorah 2" }, model2);

          expect(model.set).not.toHaveBeenCalled();
        });
      });

      describe("updates the model", () => {
        it("if the fromSource function is provided", () => {
          const model = new SubscribingTargetModel({ id: "1234", name: "Zorah" });
          const model2 = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });

          vi.spyOn(model, "set");

          expect(CanonicalModel.prototype.onUpdate).toHaveBeenCalled();
          // different context
          CanonicalModel.prototype.onUpdate.mock.calls[0][0](
            { _id: "1234", name: "Zorah 2" },
            model2,
          );

          expect(model.set).toHaveBeenCalledWith(
            // mapped attributes
            { id: "1234", name: "C. Zorah 2" },
            { source: "subscription" },
          );
        });
      });
    });
  });

  describe("unsubscribe", () => {
    beforeEach(() => {
      vi.spyOn(CanonicalModel.prototype, "removeSubscription").mockReturnValue();
    });

    it("does nothing if the model has no canonical model id", () => {
      const model = new SubscribingTargetModel({ name: "Zorah" });

      model.unsubscribe();

      expect(CanonicalModel.prototype.removeSubscription).not.toHaveBeenCalled();
    });

    it("removes the model from the canonical model's subscriptions", () => {
      const model = new SubscribingTargetModel({ id: "1234", name: "Zorah" });

      model.unsubscribe();

      expect(CanonicalModel.prototype.removeSubscription).toHaveBeenCalledWith(model, "1234");
    });
  });

  describe("_updateSubscriptions", () => {
    beforeEach(() => {
      vi.spyOn(CanonicalModel.prototype, "set").mockReturnValue();
    });

    describe("does nothing", () => {
      it("if the model has no canonical model id", () => {
        const model = new SubscribingTargetModel({ name: "Zorah" });

        model._updateSubscriptions();

        expect(CanonicalModel.prototype.set).not.toHaveBeenCalled();
      });

      it("if the model is the empty model", () => {
        const model = new SubscribingSourceModel();

        model.isEmptyModel = true;
        model.set({ _id: "1234", name: "Zorah" });
        model._updateSubscriptions();

        expect(CanonicalModel.prototype.set).not.toHaveBeenCalled();
      });

      it("if there is no toSource function", () => {
        const model = new SubscribingTargetModel({ id: "1234", name: "Zorah" });

        model._updateSubscriptions({ _id: "1234", name: "Zorah" });

        expect(CanonicalModel.prototype.set).not.toHaveBeenCalled();
      });
    });

    describe("the id field", () => {
      it("can come from attributes set on the model", () => {
        const model = new SubscribingSourceModel({ _id: "1234", name: "Zorah" });

        model._updateSubscriptions();

        expect(CanonicalModel.prototype.set).toHaveBeenCalledWith(
          { _id: "1234", name: "Zorah" },
          model,
          {},
        );
      });

      it("can come from the attributes passed to the _updateSubscriptions method", () => {
        const model = new SubscribingSourceModel();
        const options = {};

        model._updateSubscriptions({ _id: "1234", name: "Zorah" }, options);

        expect(CanonicalModel.prototype.set).toHaveBeenCalledWith(
          { _id: "1234", name: "Zorah" },
          model,
          options,
        );
      });
    });
  });
});

class CanonicalTestModel extends CanonicalModel {}
// this model has its own idattribute of id, but the canonical model uses the value of the _id property
class SubscribingSourceModel extends Model {
  static subscriptions = [
    {
      Model: CanonicalTestModel,
      idField: "_id",
      toSource: (attrs) => ({ _id: attrs._id, name: attrs.name }),
    },
  ];
}

class SubscribingTargetModel extends Model {
  static subscriptions = [
    {
      Model: CanonicalTestModel,
      // default idField to id
      fromSource: (attrs) => ({ id: attrs._id, name: "C. " + attrs.name }),
    },
  ];
}
