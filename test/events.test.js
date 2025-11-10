import * as sync from "../lib/sync";
import Collection from "../lib/collection";
import Model from "../lib/model";
import CanonicalModel from "../lib/canonical-model";
import { vi } from "vitest";
import { canonicalModelCache } from "../lib/canonical-model-cache";

class TestCollection extends Collection {
  url() {
    return "/url";
  }
}

describe("Events", () => {
  describe("a callback is triggered", () => {
    var callback = vi.fn(),
      collectionCallback = vi.fn(),
      model,
      collection;

    beforeEach(() => {
      model = new Model({ id: "alex" });
      model.onUpdate(callback, model);

      vi.spyOn(sync, "default").mockResolvedValue([{}, {}]);

      collection = new TestCollection([model]);
      collection.onUpdate(collectionCallback, collection);
    });

    afterEach(() => {
      callback.mockClear();
      collectionCallback.mockClear();
      sync.default.mockRestore();
    });

    it("when a model updates its attributes", () => {
      model.set({ noah: "grant" });
      expect(callback).toHaveBeenCalled();
    });

    it("except when a model's attributes have not changed", () => {
      model.set({ noah: { david: "grant" } });
      callback.mockClear();

      model.set({ noah: { david: "grant" } });
      expect(callback).not.toHaveBeenCalled();
    });

    it("except when a model's listener has been removed", () => {
      model.offUpdate();
      model.set({ noah: "grant" });
      expect(callback).toHaveBeenCalled();

      callback.mockClear();
      model.offUpdate(model);
      model.set({ noah: "grant" });
      expect(callback).not.toHaveBeenCalled();
    });

    it("when a model fetches successfully", async () => {
      await model.fetch();
      expect(callback).toHaveBeenCalled();

      callback.mockClear();
      sync.default.mockRejectedValue({});

      await model.fetch().catch(() => false);
      expect(callback).not.toHaveBeenCalled();
    });

    it("when a model is successfully deleted", async () => {
      var request;

      request = model.destroy();
      expect(callback).toHaveBeenCalled();

      await request;
      expect(callback).toHaveBeenCalledTimes(1);

      callback.mockClear();
      sync.default.mockRejectedValue({});

      await model.destroy().catch(() => false);
      // gets called when model is added back to collection
      expect(callback).toHaveBeenCalled();
      callback.mockClear();

      await model.destroy({ wait: true }).catch(() => false);
      expect(callback).not.toHaveBeenCalled();

      sync.default.mockResolvedValue([{}, {}]);
      request = model.destroy({ wait: true });
      expect(callback).not.toHaveBeenCalled();

      await request;
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("when a model is successfully saved", async () => {
      var request = model.save({ noah: "grant" });

      // called for initial set
      expect(callback).toHaveBeenCalled();

      await request;

      // now called again for sync return
      expect(callback).toHaveBeenCalledTimes(2);

      callback.mockClear();
      sync.default.mockRejectedValue({});

      request = model.save();
      expect(callback).not.toHaveBeenCalled();

      await request.catch(() => false);
      // gets called when previous attributes are added back to model
      expect(callback).toHaveBeenCalled();
      callback.mockClear();

      request = model.save({ zorah: "fung" }, { wait: true });
      expect(callback).not.toHaveBeenCalled();

      await request.catch(() => false);
      expect(callback).not.toHaveBeenCalled();
      sync.default.mockResolvedValue([{}, {}]);

      request = model.save({ zorah: "fung" }, { wait: true });
      expect(callback).not.toHaveBeenCalled();
      await request;
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("when a model is added to a collection", () => {
      collection.add({ alex: "lopatron" });
      expect(collectionCallback).toHaveBeenCalled();
    });

    it("when a model is removed from a collection", () => {
      collection.remove(model);
      expect(collectionCallback).toHaveBeenCalled();
    });

    it("when a model on a collection is updated", () => {
      model.set({ lastName: "lopatron" });
      expect(collectionCallback).toHaveBeenCalled();
    });

    it("but not when a model is updated after it has been removed from the collection", () => {
      collection.remove(model);
      collectionCallback.mockClear();

      model.set({ lastName: "lopatron" });
      expect(collectionCallback).not.toHaveBeenCalled();
    });

    it("when a collection is reset", () => {
      collection.reset();
      expect(collectionCallback).toHaveBeenCalled();
    });

    it("when a collection fetches successfully", async () => {
      var request = collection.fetch();

      expect(collectionCallback).not.toHaveBeenCalled();
      await request;
      // reset is silent here, once for sync
      expect(collectionCallback).toHaveBeenCalledTimes(1);

      collectionCallback.mockClear();
      sync.default.mockRejectedValue({});

      await collection.fetch().catch(() => false);
      expect(collectionCallback).not.toHaveBeenCalled();
    });

    it("when a new model is created on a collection", async () => {
      var request = collection.create({ alex: "lopatron" });

      // callback gets called first, not later
      expect(collectionCallback).toHaveBeenCalled();
      collectionCallback.mockClear();
      await request;
      // sync update
      expect(collectionCallback).toHaveBeenCalledTimes(1);

      collectionCallback.mockClear();
      request = collection.create({ zorah: "fung" }, { wait: true });
      expect(collectionCallback).not.toHaveBeenCalled();

      await request;
      // for the sync, because the late add is silent
      expect(collectionCallback).toHaveBeenCalledTimes(1);
    });

    describe("from a canonical model when a subscribing model is updated, updating the target model's attributes", () => {
      let sourceModel, targetModel;

      beforeEach(() => {
        sourceModel = new SubscribingSourceModel();
        targetModel = new SubscribingTargetModel({ id: "1234" });
      });

      afterEach(() => {
        sourceModel.unsubscribe();
        targetModel.unsubscribe();
        canonicalModelCache.clear();
      });

      it("when the targetModel is solo", () => {
        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).toEqual("C. Zorah");
      });

      it("when the targetModel is part of a collection", () => {
        const collection = new SubscribingTargetCollection([{ id: "1234" }]);

        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(collection.get("1234").get("name")).toEqual("C. Zorah");
      });

      it("when the targetModel is part of a collection with shorthand subscriptions defined", () => {
        const collection = new SubscribingTargetShorthandCollection([{ id: "1234" }]);

        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(collection.get("1234").get("name")).toEqual("C. Zorah");
      });

      it("when the source model is part of a collection with shorthand subscriptions defined", () => {
        new SubscribingSourceShorthandCollection([{ _id: "1234", name: "Zorah" }]);

        expect(targetModel.get("name")).toEqual("C. Zorah");
      });

      it("when the target is also a source", () => {
        const sourceModel = new SubscribingSourceAndTargetModel({ id: "1234" });
        const targetModel = new SubscribingSourceAndTargetModel({ id: "1234" });

        sourceModel.set({ name: "Zorah" });
        expect(targetModel.get("name")).toEqual("Zorah");
        targetModel.set({ name: "Zorah 2" });
        expect(sourceModel.get("name")).toEqual("Zorah 2");
      });

      it("unless a model has unsubscribed", () => {
        sourceModel.set({ _id: "1234", name: "Zorah" });
        expect(targetModel.get("name")).toEqual("C. Zorah");
        targetModel.unsubscribe();
        sourceModel.set({ name: "Zorah 2" });
        expect(targetModel.get("name")).toEqual("C. Zorah");
      });
    });
  });

  it("gracefully removes listeners even if there are none", () => {
    var model = new Model();

    expect(() => model.offUpdate(model)).not.toThrow();
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

class SubscribingTargetCollection extends Collection {
  static Model = SubscribingTargetModel;
}

class SubscribingTargetShorthandCollection extends Collection {
  static subscriptions = [
    {
      Model: CanonicalTestModel,
      fromSource: (attrs) => ({ id: attrs._id, name: "C. " + attrs.name }),
    },
  ];
}

class SubscribingSourceShorthandCollection extends Collection {
  static subscriptions = [
    {
      Model: CanonicalTestModel,
      idField: "_id",
      toSource: (attrs) => ({ _id: attrs._id, name: attrs.name }),
    },
  ];
}

class SubscribingSourceAndTargetModel extends Model {
  static subscriptions = [
    {
      Model: CanonicalTestModel,
      fromSource: (attrs) => attrs,
      toSource: (attrs) => attrs,
    },
  ];
}
