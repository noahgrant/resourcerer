import * as sync from "../lib/sync";
import Collection from "../lib/collection";
import Model from "../lib/model";
import { vi } from "vitest";

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
  });

  it("gracefully removes listeners even if there are none", () => {
    var model = new Model();

    expect(() => model.offUpdate(model)).not.toThrow();
  });
});
