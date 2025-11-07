import CanonicalModelCache from "../lib/canonical-model-cache";
import CanonicalModel from "../lib/canonical-model";
import { beforeEach, vi } from "vitest";

class CanonicalTestModel extends CanonicalModel {}

describe("CanonicalModelCache", () => {
  beforeEach(() => {
    vi.spyOn(CanonicalModelCache, "set");
    CanonicalModelCache.remove(CanonicalTestModel, "1234");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getOrInsert", () => {
    it("returns the canonical model for the given id", () => {
      const testModel = new CanonicalTestModel();

      CanonicalModelCache.set(CanonicalTestModel, "1234", testModel);
      CanonicalModelCache.set.mockClear();

      const canonicalModel = CanonicalModelCache.getOrInsert(CanonicalTestModel, "1234");

      expect(canonicalModel).toBeDefined();
      expect(canonicalModel).toEqual(testModel);
      expect(CanonicalModelCache.set).not.toHaveBeenCalled();
    });

    it("creates a new canonical model if one doesn't exist", () => {
      const canonicalModel = CanonicalModelCache.getOrInsert(CanonicalTestModel, "1234");

      expect(canonicalModel).toBeDefined();
      expect(CanonicalModelCache.set).toHaveBeenCalledWith(
        CanonicalTestModel,
        "1234",
        canonicalModel,
      );
    });
  });

  describe("set", () => {
    it("adds a canonical model to the cache at its id and model class", () => {
      const canonicalModel = new CanonicalTestModel();
      const canonicalModel2 = new CanonicalTestModel();

      CanonicalModelCache.set(CanonicalTestModel, "1234", canonicalModel);
      CanonicalModelCache.set(CanonicalTestModel, "1235", canonicalModel2);
      expect(CanonicalModelCache.getOrInsert(CanonicalTestModel, "1234")).toEqual(canonicalModel);
      expect(CanonicalModelCache.getOrInsert(CanonicalTestModel, "1235")).toEqual(canonicalModel2);

      CanonicalModelCache.remove(CanonicalTestModel, "1235");
    });

    it("creates a new map for the model class if one doesn't exist", () => {
      const canonicalModel = new CanonicalTestModel();

      CanonicalModelCache.set(CanonicalTestModel, "1234", canonicalModel);
      expect(CanonicalModelCache.getOrInsert(CanonicalTestModel, "1234")).toEqual(canonicalModel);
    });
  });

  describe("remove", () => {
    it("removes a canonical model from the cache", () => {
      const canonicalModel = new CanonicalTestModel();

      vi.spyOn(Map.prototype, "delete");
      CanonicalModelCache.set(CanonicalTestModel, "1234", canonicalModel);
      CanonicalModelCache.remove(CanonicalTestModel, "1234");

      expect(Map.prototype.delete).toHaveBeenCalledWith("1234");
    });
  });
});
