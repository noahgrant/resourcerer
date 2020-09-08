import {
  camelize,
  hasErrored,
  hasLoaded,
  isLoading,
  isPending,
  omit,
  once,
  pick
} from '../lib/utils';
import {LoadingStates} from '../lib/constants';

describe('Utils', () => {
  describe('hasErrored method', () => {
    it('returns true if any loading state has errored', () => {
      expect(hasErrored([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(hasErrored(LoadingStates.ERROR)).toBe(true);
      expect(hasErrored({myLoadingState: LoadingStates.ERROR})).toBe(true);
    });

    it('returns false if no loading states have errored', () => {
      expect(hasErrored([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(hasErrored(LoadingStates.LOADED)).toBe(false);
      expect(hasErrored({myLoadingState: LoadingStates.LOADED})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(hasErrored(undefined)).toBe(false);
    });
  });

  describe('isLoading method', () => {
    it('returns true if any loading state is loading', () => {
      expect(isLoading([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(isLoading(LoadingStates.LOADING)).toBe(true);
      expect(isLoading({myLoadingState: LoadingStates.LOADING})).toBe(true);
    });

    it('returns false if no loading states are loading', () => {
      expect(isLoading([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(false);
      expect(isLoading(LoadingStates.LOADED)).toBe(false);
      expect(isLoading({myLoadingState: LoadingStates.LOADED})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(isLoading(undefined)).toBe(false);
    });
  });

  describe('hasLoaded method', () => {
    it('returns true if all loading states have loaded', () => {
      expect(hasLoaded([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(true);
      expect(hasLoaded(LoadingStates.LOADED)).toBe(true);
      expect(hasLoaded({myLoadingState: LoadingStates.LOADED})).toBe(true);
    });

    it('returns false if any state has not loaded', () => {
      expect(hasLoaded([LoadingStates.ERROR, LoadingStates.LOADED])).toBe(false);
      expect(hasLoaded([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(hasLoaded(LoadingStates.LOADING)).toBe(false);
      expect(hasLoaded({myLoadingState: LoadingStates.LOADING})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(hasLoaded(undefined)).toBe(false);
    });
  });

  describe('isPending method', () => {
    it('returns true if any loading state is pending', () => {
      expect(isPending([LoadingStates.PENDING, LoadingStates.LOADING])).toBe(true);
      expect(isPending(LoadingStates.PENDING)).toBe(true);
      expect(isPending({myLoadingState: LoadingStates.PENDING})).toBe(true);
    });

    it('returns false if no loading states are pending', () => {
      expect(isPending([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(isPending(LoadingStates.LOADED)).toBe(false);
      expect(isPending({myLoadingState: LoadingStates.LOADED})).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(isPending(undefined)).toBe(false);
    });
  });

  describe('camelize', () => {
    it('passes words that are already camelCase', () => {
      expect(camelize('camelCase')).toEqual('camelCase');
      // also leaves alone PascalCase
      expect(camelize('PascalCase')).toEqual('PascalCase');
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
      var testFn = jasmine.createSpy('once'),
          testFnOnce = once(testFn);

      testFnOnce();
      testFnOnce();
      testFnOnce();
      testFnOnce();
      testFnOnce();
      testFnOnce();

      expect(testFn.calls.count()).toEqual(1);
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
});
