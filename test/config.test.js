import * as Config from "../lib/config";
import Model from "../lib/model";
import { noOp } from "../lib/utils";
import { vi } from "vitest";

class TestModel extends Model {}
class TestModel2 extends Model {}

const { register } = Config;

/* eslint-disable max-nested-callbacks */
describe("Config", () => {
  afterEach(() => {
    Object.keys(Config.ModelMap).forEach((modelKey) => {
      delete Config.ModelMap[modelKey];
    });
  });

  describe("#register", () => {
    it("adds keys to the ModelMap object", () => {
      expect(Config.ModelMap.TEST_MODEL).not.toBeDefined();
      expect(Config.ModelMap.TEST_MODEL2).not.toBeDefined();

      register({ TEST_MODEL: "testModel", TEST_MODEL2: "testModel2" });

      expect(Config.ModelMap.TEST_MODEL).toEqual("testModel");
      expect(Config.ModelMap.TEST_MODEL2).toEqual("testModel2");
    });
  });

  describe("#setConfig", () => {
    it("adds a setting to the configs, overriding defaults", () => {
      var logSpy = vi.fn(),
        trackSpy = vi.fn(),
        prefilterSpy = vi.fn();

      expect(Config.ResourcesConfig.cacheGracePeriod).toEqual(120000);
      expect(Config.ResourcesConfig.log).toEqual(noOp);
      expect(Config.ResourcesConfig.prefilter).toEqual(noOp);
      expect(Config.ResourcesConfig.track).toEqual(noOp);

      Config.ResourcesConfig.set({
        cacheGracePeriod: 300000,
        log: logSpy,
        prefilter: prefilterSpy,
        track: trackSpy,
      });

      expect(Config.ResourcesConfig.cacheGracePeriod).toEqual(300000);
      expect(Config.ResourcesConfig.log).toEqual(logSpy);
      expect(Config.ResourcesConfig.prefilter).toEqual(prefilterSpy);
      expect(Config.ResourcesConfig.track).toEqual(trackSpy);

      Config.ResourcesConfig.set({
        cacheGracePeriod: 120000,
        log: noOp,
        prefilter: noOp,
        track: noOp,
      });
    });
  });
});
