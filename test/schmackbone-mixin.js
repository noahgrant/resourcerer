import React from 'react';
import Schmackbone from 'schmackbone';
import schmackboneMixin from '../lib/schmackbone-mixin';

describe('SchmackboneMixin', () => {
  var dummyComponent,
      model1 = new Schmackbone.Model(),
      model2 = new Schmackbone.Collection(),
      model3 = new Schmackbone.Model(),
      forceUpdateSpy;

  beforeEach(() => {
    dummyComponent = new (schmackboneMixin(class Component extends React.Component {
      constructor() {
        super();

        this.model1 = model1;
        this.model2 = model2;
      }

      _getBackboneModels() {
        return [
          model1,
          model2,
          model3
        ];
      }
    }));

    forceUpdateSpy = spyOn(dummyComponent, 'forceUpdate').and.returnValue();
    dummyComponent.componentDidMount();
  });

  afterEach(() => {
    dummyComponent.componentWillUnmount();
  });

  it('calls the component\'s forceUpdate when any of its models sync, change, or destroy', () => {
    model1.trigger('sync');
    expect(forceUpdateSpy).toHaveBeenCalled();
    model2.trigger('change');
    expect(forceUpdateSpy.calls.count()).toEqual(2);
    model3.trigger('destroy');
    expect(forceUpdateSpy.calls.count()).toEqual(3);
  });

  it('removes event listeners before the component unmounts', () => {
    dummyComponent.componentWillUnmount();
    model1.trigger('sync');
    expect(forceUpdateSpy).not.toHaveBeenCalled();
    model2.trigger('change');
    expect(forceUpdateSpy).not.toHaveBeenCalled();
    model3.trigger('destroy');
    expect(forceUpdateSpy).not.toHaveBeenCalled();
  });

  describe('if _getBackboneModels is defined on the component', () => {
    it('binds events to models it returns', () => {
      // should expect forceUpdate to be invoked when all three models are syncd
      model1.trigger('sync');
      expect(forceUpdateSpy).toHaveBeenCalled();
      model2.trigger('sync');
      expect(forceUpdateSpy.calls.count()).toEqual(2);
      model3.trigger('sync');
      expect(forceUpdateSpy.calls.count()).toEqual(3);
    });
  });

  describe('if _getBackboneModels is not defined on the component', () => {
    beforeEach(() => {
      dummyComponent.componentWillUnmount();
      dummyComponent._getBackboneModels = null;
      dummyComponent.componentDidMount();
    });

    it('detects backbone models and collections defined on instance properties', () => {
      model1.trigger('sync');
      expect(forceUpdateSpy).toHaveBeenCalled();
      model2.trigger('sync');
      expect(forceUpdateSpy.calls.count()).toEqual(2);
      // expect forceUpdate _not_ to get called after model3 sync now
      model3.trigger('sync');
      expect(forceUpdateSpy.calls.count()).toEqual(2);
    });
  });
});
