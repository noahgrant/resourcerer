import * as Request from '../lib/request';
import {DecisionsCollection, UserModel} from './model-mocks';

import prefetch from '../lib/prefetch';
import ReactDOM from 'react-dom';
import Schmackbone from 'schmackbone';

const jasmineNode = document.createElement('div');
const getResources = (props, {DECISIONS, USER}) => ({
  [USER]: {
    data: {home: props.home, source: props.source},
    options: {userId: props.userId}
  },
  [DECISIONS]: {}
});
const props = {userId: 'noah', home: 'sf', source: 'hbase'};
const dummyEvt = {target: jasmineNode};

describe('prefetch', () => {
  beforeEach(() => {
    document.body.appendChild(jasmineNode);
    spyOn(Request, 'default').and.callFake(() => Promise.resolve(new Schmackbone.Collection([])));

    jasmine.clock().install();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(jasmineNode);
    jasmineNode.remove();
    jasmine.clock().uninstall();
  });

  it('correctly turns the config object into cache key, data, and options', () => {
    var oldFields = UserModel.cacheFields;

    UserModel.cacheFields = ['userId', 'source'];

    prefetch(getResources, props)(dummyEvt);
    jasmine.clock().tick(100);

    expect(Request.default.calls.argsFor(0)[0]).toEqual('usersource=hbase_userId=noah');
    expect(Request.default.calls.argsFor(0)[1]).toEqual(UserModel);
    expect(Request.default.calls.argsFor(0)[2]).toEqual({
      options: {userId: 'noah'},
      fetchData: {home: 'sf', source: 'hbase'},
      prefetch: true
    });

    expect(Request.default.calls.argsFor(1)[0]).toEqual('decisions');
    expect(Request.default.calls.argsFor(1)[1]).toEqual(DecisionsCollection);
    expect(Request.default.calls.argsFor(1)[2]).toEqual({
      fetchData: undefined,
      options: undefined,
      prefetch: true
    });

    UserModel.cacheFields = oldFields;
  });

  it('will fire if the user hovers over the element for longer than the timeout', () => {
    var leaveEvt = new Event('mouseleave');

    prefetch(getResources, props)(dummyEvt);
    jasmine.clock().tick(50);
    jasmineNode.dispatchEvent(leaveEvt);
    expect(Request.default).toHaveBeenCalled();
  });

  it('will not fetch if the user leaves the element before the timeout', () => {
    var leaveEvt = new Event('mouseleave');

    prefetch(getResources, props)(dummyEvt);
    jasmine.clock().tick(25);
    jasmineNode.dispatchEvent(leaveEvt);
    jasmine.clock().tick(25);
    expect(Request.default).not.toHaveBeenCalled();
  });
});
