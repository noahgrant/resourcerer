import {areAnyLoading, areAnyPending, haveAllLoaded, haveAnyErrored} from '../index';
import {
  camelize,
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
  urlError
} from '../lib/utils';
// these will just test that our top-level exports are working as expected
import {LoadingStates} from '../lib/constants';

describe('Utils', () => {
  describe('hasErrored method', () => {
    it('returns true if any loading state has errored', () => {
      expect(hasErrored([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(hasErrored(LoadingStates.ERROR)).toBe(true);
      expect(hasErrored({myLoadingState: LoadingStates.ERROR})).toBe(true);
      expect(haveAnyErrored([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(haveAnyErrored(LoadingStates.ERROR)).toBe(true);
      expect(haveAnyErrored({myLoadingState: LoadingStates.ERROR})).toBe(true);
    });

    it('returns false if no loading states have errored', () => {
      expect(hasErrored([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(hasErrored(LoadingStates.LOADED)).toBe(false);
      expect(hasErrored({myLoadingState: LoadingStates.LOADED})).toBe(false);
      expect(haveAnyErrored([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(haveAnyErrored(LoadingStates.LOADED)).toBe(false);
      expect(haveAnyErrored({myLoadingState: LoadingStates.LOADED})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(hasErrored(undefined)).toBe(false);
      expect(haveAnyErrored(undefined)).toBe(false);
    });
  });

  describe('isLoading method', () => {
    it('returns true if any loading state is loading', () => {
      expect(isLoading([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(isLoading(LoadingStates.LOADING)).toBe(true);
      expect(isLoading({myLoadingState: LoadingStates.LOADING})).toBe(true);
      expect(areAnyLoading([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(areAnyLoading(LoadingStates.LOADING)).toBe(true);
      expect(areAnyLoading({myLoadingState: LoadingStates.LOADING})).toBe(true);
    });

    it('returns false if no loading states are loading', () => {
      expect(isLoading([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(false);
      expect(isLoading(LoadingStates.LOADED)).toBe(false);
      expect(isLoading({myLoadingState: LoadingStates.LOADED})).toBe(false);
      expect(areAnyLoading([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(false);
      expect(areAnyLoading(LoadingStates.LOADED)).toBe(false);
      expect(areAnyLoading({myLoadingState: LoadingStates.LOADED})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(isLoading(undefined)).toBe(false);
      expect(areAnyLoading(undefined)).toBe(false);
    });
  });

  describe('hasLoaded method', () => {
    it('returns true if all loading states have loaded', () => {
      expect(hasLoaded([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(true);
      expect(hasLoaded(LoadingStates.LOADED)).toBe(true);
      expect(hasLoaded({myLoadingState: LoadingStates.LOADED})).toBe(true);
      expect(haveAllLoaded([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(true);
      expect(haveAllLoaded(LoadingStates.LOADED)).toBe(true);
      expect(haveAllLoaded({myLoadingState: LoadingStates.LOADED})).toBe(true);
    });

    it('returns false if any state has not loaded', () => {
      expect(hasLoaded([LoadingStates.ERROR, LoadingStates.LOADED])).toBe(false);
      expect(hasLoaded([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(hasLoaded(LoadingStates.LOADING)).toBe(false);
      expect(hasLoaded({myLoadingState: LoadingStates.LOADING})).toBe(false);
      expect(haveAllLoaded([LoadingStates.ERROR, LoadingStates.LOADED])).toBe(false);
      expect(haveAllLoaded([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(haveAllLoaded(LoadingStates.LOADING)).toBe(false);
      expect(haveAllLoaded({myLoadingState: LoadingStates.LOADING})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(hasLoaded(undefined)).toBe(false);
      expect(haveAllLoaded(undefined)).toBe(false);
    });
  });

  describe('isPending method', () => {
    it('returns true if any loading state is pending', () => {
      expect(isPending([LoadingStates.PENDING, LoadingStates.LOADING])).toBe(true);
      expect(isPending(LoadingStates.PENDING)).toBe(true);
      expect(isPending({myLoadingState: LoadingStates.PENDING})).toBe(true);
      expect(areAnyPending([LoadingStates.PENDING, LoadingStates.LOADING])).toBe(true);
      expect(areAnyPending(LoadingStates.PENDING)).toBe(true);
      expect(areAnyPending({myLoadingState: LoadingStates.PENDING})).toBe(true);
    });

    it('returns false if no loading states are pending', () => {
      expect(isPending([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(isPending(LoadingStates.LOADED)).toBe(false);
      expect(isPending({myLoadingState: LoadingStates.LOADED})).toBe(false);
      expect(areAnyPending([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(areAnyPending(LoadingStates.LOADED)).toBe(false);
      expect(areAnyPending({myLoadingState: LoadingStates.LOADED})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(isPending(undefined)).toBe(false);
      expect(areAnyPending(undefined)).toBe(false);
    });
  });

  describe('camelize', () => {
    it('passes words that are already camelCase', () => {
      expect(camelize('camelCase')).toEqual('camelCase');
      // also leaves alone PascalCase
      expect(camelize('PascalCase')).toEqual('PascalCase');
      // defaults
      expect(camelize()).toEqual('');
    });

    it('passes words that are single word lowercase', () => {
      expect(camelize('lowercase')).toEqual('lowercase');
    });

    it('lowercases words that are all uppercase', () => {
      expect(camelize('UPPERCASE')).toEqual('uppercase');
    });

    it('turns snake_case words into camelcase', () => {
      expect(camelize('snake_case_words')).toEqual('snakeCaseWords');
    });

    it('turns spine-case words into camelcase', () => {
      expect(camelize('spine-case-words')).toEqual('spineCaseWords');
    });

    it('turns space-separated words into camelcase', () => {
      expect(camelize('space separated words')).toEqual('spaceSeparatedWords');
    });
  });

  describe('once', () => {
    it('invokes a function maximum once', () => {
      var testFn = jest.fn(),
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

  describe('pick', () => {
    it('picks an objects properties and returns a new object', () => {
      expect(pick({foo: 'foo', bar: 'bar', baz: 'baz'}, 'foo', 'quux')).toEqual({foo: 'foo'});
    });

    it('works with defaults', () => {
      expect(pick()).toEqual({});
    });
  });

  describe('omit', () => {
    it('omits an objects properties and returns a new object', () => {
      expect(omit({foo: 'foo', bar: 'bar', baz: 'baz'}, 'foo', 'quux'))
          .toEqual({bar: 'bar', baz: 'baz'});
    });

    it('works with defaults', () => {
      expect(omit()).toEqual({});
    });
  });

  describe('result', () => {
    it('returns the correct value if a function', () => {
      expect(result({foo: () => 'bar'}, 'foo')).toEqual('bar');
    });

    it('returns the correct value if not a function', () => {
      expect(result({foo: 'bar'}, 'foo')).toEqual('bar');
      // safe
      expect(result()).not.toBeDefined();
    });
  });

  describe('uniqueId', () => {
    it('returns a unique id with every call, optionally prefixed', () => {
      expect(uniqueId()).toEqual('1');
      expect(uniqueId('noah')).toEqual('noah2');
      expect(uniqueId()).toEqual('3');
    });
  });

  describe('urlError', () => {
    it('throw an error with a message about a missing url', () => {
      expect(urlError).toThrowError('A "url" property or function must be specified');
    });
  });

  describe('isDeepEqual', () => {
    describe('returns true', () => {
      it('if the same referential object', () => {
        var obj = {};

        expect(isDeepEqual(obj, obj)).toBe(true);
      });

      it('if the objects have equal values, deeply', () => {
        expect(isDeepEqual({one: 'one', two: 2, three: null}, {one: 'one', two: 2, three: null}))
            .toBe(true);
        // nested
        expect(isDeepEqual({
          one: 'one',
          two: {three: 'three'}
        }, {
          one: 'one',
          two: {three: 'three'}
        })).toBe(true);
      });
    });

    describe('returns false', () => {
      it('if not objects', () => {
        expect(isDeepEqual(null, false)).toBe(false);
      });

      it('if one object has more properties', () => {
        expect(isDeepEqual({one: 'one', two: 'two'}, {one: 'one'})).toBe(false);
      });

      it('if the objects do not have equal values', () => {
        expect(isDeepEqual({one: 'one'}, {one: 'two'})).toBe(false);
        expect(isDeepEqual({one: 'one'}, {two: 'three'})).toBe(false);
        // nested
        expect(isDeepEqual({one: {two: 'three'}}, {one: {two: 'four'}})).toBe(false);
      });
    });
  });

  describe('sortBy', () => {
    it('sorts a list by a comparator function', () => {
      expect(sortBy([
        {name: 'zorah'},
        {name: 'alex'},
        {name: undefined},
        {name: 'noah'},
        {name: undefined},
        {name: 'alex'},
        {name: 'zorah'},
        {name: 'alex'}
      ], ({name}) => name)).toEqual([
        {name: 'alex'},
        {name: 'alex'},
        {name: 'alex'},
        {name: 'noah'},
        {name: 'zorah'},
        {name: 'zorah'},
        {name: undefined},
        {name: undefined}
      ]);

      expect(sortBy()).toEqual([]);
    });
  });
});
