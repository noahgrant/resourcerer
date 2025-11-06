import CanonicalModelCache from "../lib/canonical-model-cache";
import Model from "../lib/model";
import { vi } from "vitest";
import CanonicalModel from "../lib/canonical-model";

class CanonicalTestModel extends CanonicalModel {}

describe("CanonicalModel", () => {
  let model;
  let context = {};
  const callback = vi.fn();

  afterEach(() => {
    callback.mockClear();
  });

  describe("get", () => {
    it("returns the attribute value", () => {
      model = new CanonicalTestModel();
      model.set({ one: "one" });
      expect(model.get("one")).toEqual("one");
    });
  });

  describe("set", () => {
    describe("triggers an update", () => {
      beforeEach(() => {
        model = new CanonicalTestModel();
        model.onUpdate(callback);
      });

      it("if a value has changed", () => {
        model.set({ one: "one" }, context);
        expect(callback).toHaveBeenCalledWith(model.toJSON(), context);
        callback.mockClear();

        model.set({ two: { three: "four" } }, context);
        expect(callback).toHaveBeenCalledWith(model.toJSON(), context);
        callback.mockClear();

        model.set({ one: "one" });
        expect(callback).not.toHaveBeenCalled();

        model.set();
        expect(callback).not.toHaveBeenCalled();

        model.set({ one: null }, context, { unset: true });
        expect(model.toJSON()).toEqual({ two: { three: "four" } });
        expect(callback).toHaveBeenCalledWith(model.toJSON(), context);
      });
    });
  });

  describe("removeSubscription", () => {
    const subscriberModel = new Model();

    beforeEach(() => {
      model = new CanonicalTestModel();
      model.onUpdate(callback, subscriberModel);
    });

    it("removes the subscription from the canonical model", () => {
      model.removeSubscription(subscriberModel, "1234");
      model.set({ one: "one" }, subscriberModel);
      expect(callback).not.toHaveBeenCalled();
    });

    it("removes the canonical model from the cache if there are no more subscriptions", () => {
      vi.spyOn(CanonicalModelCache, "remove").mockReturnValue();

      model.removeSubscription(subscriberModel, "1234");
      expect(CanonicalModelCache.remove).toHaveBeenCalledWith(CanonicalTestModel, "1234");
    });
  });

  describe("toJSON", () => {
    it("returns a copy of the attributes", () => {
      model = new CanonicalTestModel();
      model.set({ one: "one" });

      const json = model.toJSON();

      json.one = "two";
      expect(model.toJSON()).toEqual({ one: "one" });
    });
  });
});
