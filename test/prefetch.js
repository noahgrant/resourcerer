import * as Request from '../lib/request';
import {DecisionsCollection, UserModel} from './model-mocks';

import Collection from '../lib/collection';
import prefetch from '../lib/prefetch';
import ReactDOM from 'react-dom';

const jasmineNode = document.createElement('div');
const getResources = (props, {DECISIONS, USER}) => ({
  [USER]: {
    data: {home: props.home, source: props.source},
    options: {userId: props.userId}
  },
  [DECISIONS]: {}
});
const expectedProps = {userId: 'noah', home: 'sf', source: 'hbase'};
const dummyEvt = {target: jasmineNode};

describe('prefetch', () => {
  beforeEach(() => {
    document.body.appendChild(jasmineNode);
    jest.spyOn(Request, 'default').mockImplementation(() => Promise.resolve(new Collection([])));

    jest.useFakeTimers();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(jasmineNode);
    jasmineNode.remove();
    jest.useRealTimers();
  });

  it('correctly turns the config object into cache key, data, and options', () => {
    var oldFields = UserModel.cacheFields;

    UserModel.cacheFields = ['userId', 'source'];

    prefetch(getResources, expectedProps)(dummyEvt);
    jest.advanceTimersByTime(100);

    expect(Request.default.mock.calls[0][0]).toEqual('usersource=hbase_userId=noah');
    expect(Request.default.mock.calls[0][1]).toEqual(UserModel);
    expect(Request.default.mock.calls[0][2]).toEqual({
      options: {userId: 'noah'},
      data: {home: 'sf', source: 'hbase'},
      prefetch: true
    });

    expect(Request.default.mock.calls[1][0]).toEqual('decisions');
    expect(Request.default.mock.calls[1][1]).toEqual(DecisionsCollection);
    expect(Request.default.mock.calls[1][2]).toEqual({prefetch: true});

    UserModel.cacheFields = oldFields;
  });

  it('will fire if the user hovers over the element for longer than the timeout', () => {
    var leaveEvt = new Event('mouseleave');

    prefetch(getResources, expectedProps)(dummyEvt);
    jest.advanceTimersByTime(50);
    jasmineNode.dispatchEvent(leaveEvt);
    expect(Request.default).toHaveBeenCalled();
  });

  it('will not fetch if the user leaves the element before the timeout', () => {
    var leaveEvt = new Event('mouseleave');

    prefetch(getResources, expectedProps)(dummyEvt);
    jest.advanceTimersByTime(25);
    jasmineNode.dispatchEvent(leaveEvt);
    jest.advanceTimersByTime(25);
    expect(Request.default).not.toHaveBeenCalled();
  });
});
