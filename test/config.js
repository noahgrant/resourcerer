import * as Config from '../lib/config';
import {noOp} from '../lib/utils';
import Schmackbone from 'schmackbone';

const TestModel = Schmackbone.Model.extend();
const TestModel2 = Schmackbone.Model.extend();

/* eslint-disable max-nested-callbacks */
describe('Config', () => {
  afterEach(() => {
    delete Config.ResourceKeys.TEST_MODEL;
    delete Config.ResourceKeys.TEST_MODEL2;
  });

  describe('#addResourceKeys', () => {
    it('adds keys to the ResourceKeys object', () => {
      expect(Config.ResourceKeys.TEST_MODEL).not.toBeDefined();
      expect(Config.ResourceKeys.TEST_MODEL2).not.toBeDefined();

      Config.ResourceKeys.add({TEST_MODEL: 'testModel', TEST_MODEL2: 'testModel2'});

      expect(Config.ResourceKeys.TEST_MODEL).toEqual('testModel');
      expect(Config.ResourceKeys.TEST_MODEL2).toEqual('testModel2');
    });
  });

  describe('#addModels', () => {
    beforeEach(() => {
      expect(Config.ModelMap.testModel).not.toBeDefined();
      expect(Config.ModelMap.testModel2).not.toBeDefined();
    });

    afterEach(() => {
      delete Config.ModelMap.testModel;
      delete Config.ModelMap.testModel2;
    });

    it('adds models passed as an object to the model map', () => {
      Config.ModelMap.add({testModel: TestModel, testModel2: TestModel2});

      expect(Config.ModelMap.testModel).toEqual(TestModel);
      expect(Config.ModelMap.testModel2).toEqual(TestModel2);
    });
  });

  describe('adding UnfetchedResources', () => {
    it('adds a resource to the unfetched list', () => {
      Config.ResourceKeys.add({TEST_MODEL: 'testModel', TEST_MODEL2: 'testModel2'});
      expect(Config.UnfetchedResources.has(Config.ResourceKeys.TEST_MODEL)).toBe(false);
      expect(Config.UnfetchedResources.has(Config.ResourceKeys.TEST_MODEL2)).toBe(false);

      Config.UnfetchedResources.add(Config.ResourceKeys.TEST_MODEL);
      Config.UnfetchedResources.add(Config.ResourceKeys.TEST_MODEL2);

      expect(Config.UnfetchedResources.has(Config.ResourceKeys.TEST_MODEL)).toBe(true);
      expect(Config.UnfetchedResources.has(Config.ResourceKeys.TEST_MODEL2)).toBe(true);

      Config.UnfetchedResources.delete(Config.ResourceKeys.TEST_MODEL);
      Config.UnfetchedResources.delete(Config.ResourceKeys.TEST_MODEL2);
    });
  });

  describe('#setConfig', () => {
    it('adds a setting to the configs, overriding defaults', () => {
      var logSpy = jasmine.createSpy('log'),
          trackSpy = jasmine.createSpy('track');

      expect(Config.ResourcesConfig.cacheGracePeriod).toEqual(120000);
      expect(Config.ResourcesConfig.log).toEqual(noOp);
      expect(Config.ResourcesConfig.track).toEqual(noOp);
      expect(Config.ResourcesConfig.queryParamsPropName).toEqual('urlParams');

      Config.ResourcesConfig.set({
        cacheGracePeriod: 300000,
        log: logSpy,
        track: trackSpy,
        queryParamsPropName: 'queryPs'
      });

      expect(Config.ResourcesConfig.cacheGracePeriod).toEqual(300000);
      expect(Config.ResourcesConfig.log).toEqual(logSpy);
      expect(Config.ResourcesConfig.track).toEqual(trackSpy);
      expect(Config.ResourcesConfig.queryParamsPropName).toEqual('queryPs');

      Config.ResourcesConfig.set({
        cacheGracePeriod: 120000,
        log: noOp,
        track: noOp,
        queryParamsPropName: 'queryParamsPropName'
      });
    });
  });
});
