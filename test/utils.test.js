import { Utils } from "../index";
import {
  hasErrored,
  hasLoaded,
  isDeepEqual,
  isLoading,
  isPending,
  omit,
  once,
  pick,
  result,
  sortBy,
  uniqueId,
  urlError,
} from "../lib/utils";
import { vi } from "vitest";

describe("Utils", () => {
  describe("hasErrored method", () => {
    it("returns true if any loading state has errored", () => {
      expect(hasErrored(["error", "loading"])).toBe(true);
      expect(hasErrored("error")).toBe(true);
      expect(Utils.hasErrored(["error", "loading"])).toBe(true);
      expect(Utils.hasErrored("error")).toBe(true);
    });

    it("returns false if no loading states have errored", () => {
      expect(hasErrored(["loaded", "loading"])).toBe(false);
      expect(hasErrored("loaded")).toBe(false);
      expect(Utils.hasErrored(["loaded", "loading"])).toBe(false);
      expect(Utils.hasErrored("loaded")).toBe(false);
    });

    it("returns false if an undefined loading state is passed", () => {
      expect(hasErrored(undefined)).toBe(false);
      expect(Utils.hasErrored(undefined)).toBe(false);
    });
  });

  describe("isLoading method", () => {
    it("returns true if any loading state is loading", () => {
      expect(isLoading(["error", "loading"])).toBe(true);
      expect(isLoading("loading")).toBe(true);
      expect(Utils.isLoading(["error", "loading"])).toBe(true);
      expect(Utils.isLoading("loading")).toBe(true);
    });

    it("returns false if no loading states are loading", () => {
      expect(isLoading(["loaded", "loaded"])).toBe(false);
      expect(isLoading("loaded")).toBe(false);
      expect(Utils.isLoading(["loaded", "loaded"])).toBe(false);
      expect(Utils.isLoading("loaded")).toBe(false);
    });

    it("returns false if an undefined loading state is passed", () => {
      expect(isLoading(undefined)).toBe(false);
      expect(Utils.isLoading(undefined)).toBe(false);
    });
  });

  describe("hasLoaded method", () => {
    it("returns true if all loading states have loaded", () => {
      expect(hasLoaded(["loaded", "loaded"])).toBe(true);
      expect(hasLoaded("loaded")).toBe(true);
      expect(Utils.hasLoaded(["loaded", "loaded"])).toBe(true);
      expect(Utils.hasLoaded("loaded")).toBe(true);
    });

    it("returns false if any state has not loaded", () => {
      expect(hasLoaded(["error", "loaded"])).toBe(false);
      expect(hasLoaded(["loaded", "loading"])).toBe(false);
      expect(hasLoaded("loading")).toBe(false);
      expect(Utils.hasLoaded(["error", "loaded"])).toBe(false);
      expect(Utils.hasLoaded(["loaded", "loading"])).toBe(false);
      expect(Utils.hasLoaded("loading")).toBe(false);
    });

    it("returns false if an undefined loading state is passed", () => {
      expect(hasLoaded(undefined)).toBe(false);
      expect(Utils.hasLoaded(undefined)).toBe(false);
    });
  });

  describe("isPending method", () => {
    it("returns true if any loading state is pending", () => {
      expect(isPending(["pending", "loading"])).toBe(true);
      expect(isPending("pending")).toBe(true);
      expect(Utils.isPending(["pending", "loading"])).toBe(true);
      expect(Utils.isPending("pending")).toBe(true);
    });

    it("returns false if no loading states are pending", () => {
      expect(isPending(["loaded", "loading"])).toBe(false);
      expect(isPending("loaded")).toBe(false);
      expect(Utils.isPending(["loaded", "loading"])).toBe(false);
      expect(Utils.isPending("loaded")).toBe(false);
    });

    it("returns false if an undefined loading state is passed", () => {
      expect(isPending(undefined)).toBe(false);
      expect(Utils.isPending(undefined)).toBe(false);
    });
  });

  describe("once", () => {
    it("invokes a function maximum once", () => {
      var testFn = vi.fn(),
        testFnOnce = once(testFn);

      testFnOnce();
      testFnOnce();
      testFnOnce();
      testFnOnce();
      testFnOnce();
      testFnOnce();

      expect(testFn.mock.calls.length).toEqual(1);
    });
  });

  describe("pick", () => {
    it("picks an objects properties and returns a new object", () => {
      expect(pick({ foo: "foo", bar: "bar", baz: "baz" }, "foo", "quux")).toEqual({ foo: "foo" });
    });

    it("works with defaults", () => {
      expect(pick()).toEqual({});
      expect(pick({ foo: "foo" }, "bar")).toEqual({});
      expect("bar" in pick({ foo: "foo" }, "bar")).toBe(false);
    });
  });

  describe("omit", () => {
    it("omits an objects properties and returns a new object", () => {
      expect(omit({ foo: "foo", bar: "bar", baz: "baz" }, "foo", "quux")).toEqual({
        bar: "bar",
        baz: "baz",
      });
    });

    it("works with defaults", () => {
      expect(omit()).toEqual({});
    });
  });

  describe("result", () => {
    it("returns the correct value if a function", () => {
      expect(result({ foo: () => "bar" }, "foo")).toEqual("bar");
      expect(result({ foo: (x, y) => x + y + 5 }, "foo", 10, 5)).toEqual(20);
    });

    it("returns the correct value if not a function", () => {
      expect(result({ foo: "bar" }, "foo")).toEqual("bar");
      // safe
      expect(result()).not.toBeDefined();
    });
  });

  describe("uniqueId", () => {
    it("returns a unique id with every call, optionally prefixed", () => {
      expect(uniqueId()).toEqual("1");
      expect(uniqueId("noah")).toEqual("noah2");
      expect(uniqueId()).toEqual("3");
    });
  });

  describe("urlError", () => {
    it("throw an error with a message about a missing url", () => {
      expect(urlError).toThrowError('A "url" property or function must be specified');
    });
  });

  describe("isDeepEqual", () => {
    describe("returns true", () => {
      it("if the same referential object", () => {
        var obj = {};

        expect(isDeepEqual(obj, obj)).toBe(true);
      });

      it("if the objects have equal values, deeply", () => {
        expect(
          isDeepEqual({ one: "one", two: 2, three: null }, { one: "one", two: 2, three: null })
        ).toBe(true);
        // nested
        expect(
          isDeepEqual(
            {
              one: "one",
              two: { three: "three" },
            },
            {
              one: "one",
              two: { three: "three" },
            }
          )
        ).toBe(true);
      });
    });

    describe("returns false", () => {
      it("if not objects", () => {
        expect(isDeepEqual(null, false)).toBe(false);
      });

      it("if one object has more properties", () => {
        expect(isDeepEqual({ one: "one", two: "two" }, { one: "one" })).toBe(false);
      });

      it("if the objects do not have equal values", () => {
        expect(isDeepEqual({ one: "one" }, { one: "two" })).toBe(false);
        expect(isDeepEqual({ one: "one" }, { two: "three" })).toBe(false);
        // nested
        expect(isDeepEqual({ one: { two: "three" } }, { one: { two: "four" } })).toBe(false);
      });
    });
  });

  describe("sortBy", () => {
    it("sorts a list by a comparator function", () => {
      expect(
        sortBy(
          [
            { name: "zorah" },
            { name: "alex" },
            { name: undefined },
            { name: "noah" },
            { name: undefined },
            { name: "alex" },
            { name: "zorah" },
            { name: "alex" },
          ],
          ({ name }) => name
        )
      ).toEqual([
        { name: "alex" },
        { name: "alex" },
        { name: "alex" },
        { name: "noah" },
        { name: "zorah" },
        { name: "zorah" },
        { name: undefined },
        { name: undefined },
      ]);

      expect(sortBy()).toEqual([]);
    });
  });
});
