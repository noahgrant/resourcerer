import Collection from "../lib/collection";
import Model from "../lib/model";
import ModelCache, { invalidate } from "../lib/model-cache";
import { vi } from "vitest";

const CACHE_WAIT = 150000;
const testModel = new Model();

describe("ModelCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(ModelCache, "register");
    vi.spyOn(Model.prototype, "unsubscribe");
  });

  afterEach(() => {
    ModelCache.__removeAll__();
    vi.useRealTimers();
    ModelCache.register.mockRestore();
  });

  it("gets a model from its cache via a unique key", () => {
    var model2 = new Model();

    ModelCache.put("foo", testModel, {});
    ModelCache.put("bar", model2, {});
    expect(ModelCache.get("foo")).toEqual(testModel);
    expect(ModelCache.get("bar")).toEqual(model2);
  });

  describe("when calling 'put'", () => {
    const PUT_KEY = "putModel",
      component = {};

    it("adds the model to the cache", () => {
      ModelCache.put(PUT_KEY, testModel, component);
      expect(ModelCache.get(PUT_KEY)).toEqual(testModel);
    });

    it("registers the component if a component is passed", () => {
      ModelCache.put(PUT_KEY, testModel, component);
      expect(ModelCache.register).toHaveBeenCalledWith(PUT_KEY, component);
    });

    describe("if no component is passed", () => {
      beforeEach(() => ModelCache.put(PUT_KEY, testModel));

      it("does not register one", () => {
        expect(ModelCache.register).not.toHaveBeenCalled();
      });

      it("schedules the model for removal", () => {
        // model should be removed after CACHE_WAIT time
        expect(ModelCache.get(PUT_KEY)).toBeDefined();
        vi.advanceTimersByTime(CACHE_WAIT);
        expect(ModelCache.get(PUT_KEY)).not.toBeDefined();
      });

      it("uses a model-specific timeout if available", () => {
        class TimeoutModel extends Model {
          static cacheTimeout = 3000;
        }

        class TimeoutCollection extends Collection {
          static cacheTimeout = CACHE_WAIT + 2000;
        }

        vi.advanceTimersByTime(CACHE_WAIT);
        expect(ModelCache.get(PUT_KEY)).not.toBeDefined();

        ModelCache.put(PUT_KEY, new TimeoutModel());
        vi.advanceTimersByTime(2000);
        expect(ModelCache.get(PUT_KEY)).toBeDefined();
        vi.advanceTimersByTime(2000);
        expect(ModelCache.get(PUT_KEY)).not.toBeDefined();

        ModelCache.put(PUT_KEY, new TimeoutCollection());
        vi.advanceTimersByTime(CACHE_WAIT);
        expect(ModelCache.get(PUT_KEY)).toBeDefined();
        vi.advanceTimersByTime(2000);
        expect(ModelCache.get(PUT_KEY)).not.toBeDefined();
      });
    });
  });

  describe("registering a component", () => {
    const component = {},
      component2 = {};

    beforeEach(() => {
      ModelCache.put("foo", new Model(), component);
    });

    it("clears any current cache removal timeouts", () => {
      // if we unregister, we'll see it removed from the cache
      ModelCache.unregister(component);
      vi.advanceTimersByTime(CACHE_WAIT);
      expect(ModelCache.get("foo")).not.toBeDefined();

      // but if we re-register beforehand, we won't
      ModelCache.put("foo", new Model(), component);
      expect(ModelCache.get("foo")).toBeDefined();
      ModelCache.unregister(component);
      ModelCache.put("foo", new Model(), component);
      vi.advanceTimersByTime(CACHE_WAIT);
      expect(ModelCache.get("foo")).toBeDefined();
    });

    it("adds the component to the componentManfiest", () => {
      // we don't have access to the component manifest because it's private,
      // but we can make assertions based on when a model should be cleared
      // from the cache
      ModelCache.register("foo", component);
      // add new entry
      ModelCache.put("foo", new Model(), component2);
      ModelCache.unregister(component2);
      vi.advanceTimersByTime(CACHE_WAIT);
      // even though the first component didn't add the model, the model should
      // still exist after component2 was unregistered
      expect(ModelCache.get("foo")).toBeDefined();
    });
  });

  describe("unregistering a component", () => {
    const component = {};

    beforeEach(() => {
      ModelCache.put("foo", new Model(), component);
      ModelCache.put("bar", new Model(), component);
      ModelCache.put("baz", new Model(), component);
    });

    it("removes the component from the componentManifest for the given cache keys", () => {
      ModelCache.unregister(component, "foo", "bar");
      vi.advanceTimersByTime(CACHE_WAIT);
      expect(ModelCache.get("foo")).not.toBeDefined();
      expect(ModelCache.get("bar")).not.toBeDefined();
      expect(ModelCache.get("baz")).toBeDefined();
    });

    it("removes the component from the entire componentManifest if no cache keys passed", () => {
      ModelCache.unregister(component);
      vi.advanceTimersByTime(CACHE_WAIT);
      expect(ModelCache.get("foo")).not.toBeDefined();
      expect(ModelCache.get("bar")).not.toBeDefined();
      expect(ModelCache.get("baz")).not.toBeDefined();
    });

    it("schedules the model for cache removal if it no longer has components registered", () => {
      // let's add another component to foo and to baz
      ModelCache.put("foo", new Model(), {});
      ModelCache.put("bar", new Model(), {});

      ModelCache.unregister(component);
      vi.advanceTimersByTime(CACHE_WAIT);

      expect(ModelCache.get("foo")).toBeDefined();
      expect(ModelCache.get("bar")).toBeDefined();
      // only baz will get removed, since the others have other components
      // still attached
      expect(ModelCache.get("baz")).not.toBeDefined();
      expect(Model.prototype.unsubscribe).toHaveBeenCalledTimes(1);
      ModelCache.unregister({});
    });
  });

  it("when calling 'remove' removes the model from the cache immediately", () => {
    const component = {};

    // let's register foo to three components
    ModelCache.put("foo", new Model(), {});
    ModelCache.put("foo", new Model(), {});
    ModelCache.put("foo", new Model(), {});

    expect(ModelCache.get("foo")).toBeDefined();
    ModelCache.remove("foo");
    expect(ModelCache.get("foo")).not.toBeDefined();
    expect(Model.prototype.unsubscribe).toHaveBeenCalledTimes(1);
    Model.prototype.unsubscribe.mockClear();

    ModelCache.put("foo", new Model(), component);
    ModelCache.unregister(component);

    // still defined because of the timeout
    expect(ModelCache.get("foo")).toBeDefined();
    expect(Model.prototype.unsubscribe).not.toHaveBeenCalled();

    ModelCache.remove("foo");
    // now immediately gone
    expect(ModelCache.get("foo")).not.toBeDefined();
    expect(Model.prototype.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("when calling 'removeAllWithModel' removes all models of a specific key", () => {
    const cacheKeys = [
      "user~userId=zorah",
      "user~source=hbase_userId=noah",
      "user",
      "users",
      "users~key=value",
      "decisions",
    ];

    cacheKeys.forEach((key) => ModelCache.put(key, new Model(), {}));

    ModelCache.removeAllWithModel("user");
    expect(ModelCache.get("user")).not.toBeDefined();
    expect(ModelCache.get("user~userId=zorah")).not.toBeDefined();
    expect(ModelCache.get("user~source=hbase_userId=noah")).not.toBeDefined();
    expect(ModelCache.get("users")).toBeDefined();
    expect(ModelCache.get("users~key=value")).toBeDefined();
    expect(ModelCache.get("decisions")).toBeDefined();
  });

  it("when calling 'removeAllExcept' removes all models except those with a specific key", () => {
    const cacheKeys = [
      "user~userId=zorah",
      "user~source=hbase_userId=noah",
      "user",
      "users",
      "users~key=value",
      "aliens",
      "decisions",
    ];

    cacheKeys.forEach((key) => ModelCache.put(key, new Model(), {}));

    ModelCache.removeAllExcept(["users", "aliens"]);
    expect(ModelCache.get("user")).not.toBeDefined();
    expect(ModelCache.get("user~userId=zorah")).not.toBeDefined();
    expect(ModelCache.get("user~source=hbase_userId=noah")).not.toBeDefined();
    expect(ModelCache.get("users")).toBeDefined();
    expect(ModelCache.get("users~key=value")).toBeDefined();
    expect(ModelCache.get("aliens")).toBeDefined();
    expect(ModelCache.get("decisions")).not.toBeDefined();
  });
});

describe("invalidate", () => {
  it("removes models from the cache immediately", () => {
    ModelCache.put("foo", new Model(), {});
    ModelCache.put("bar", new Model(), {});
    ModelCache.put("baz", new Model(), {});
    invalidate("foo");
    expect(ModelCache.get("foo")).not.toBeDefined();
    expect(ModelCache.get("bar")).toBeDefined();
    expect(ModelCache.get("baz")).toBeDefined();

    // safe
    invalidate();
    expect(ModelCache.get("bar")).toBeDefined();
    expect(ModelCache.get("baz")).toBeDefined();

    invalidate(["bar", "baz"]);
    expect(ModelCache.get("bar")).not.toBeDefined();
    expect(ModelCache.get("baz")).not.toBeDefined();
  });

  it("removes models except those specified when the 'except' option is true", () => {
    ModelCache.put("foo", new Model(), {});
    ModelCache.put("bar", new Model(), {});
    ModelCache.put("baz", new Model(), {});
    invalidate(["foo", "bar"], { except: true });
    expect(ModelCache.get("foo")).toBeDefined();
    expect(ModelCache.get("bar")).toBeDefined();
    expect(ModelCache.get("baz")).not.toBeDefined();

    invalidate([], { except: true });
    expect(ModelCache.get("foo")).not.toBeDefined();
    expect(ModelCache.get("bar")).not.toBeDefined();
  });
});
