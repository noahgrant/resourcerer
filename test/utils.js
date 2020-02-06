import {camelize, hasErrored, hasLoaded, isLoading, isPending} from '../lib/utils';
import {LoadingStates} from '../lib/constants';

describe('modelLoadingStatus', () => {
  describe('hasErrored method', () => {
    it('returns true if any loading state has errored', () => {
      expect(hasErrored([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(hasErrored(LoadingStates.ERROR)).toBe(true);
    });

    it('returns false if no loading states have errored', () => {
      expect(hasErrored([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(hasErrored(LoadingStates.LOADED)).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(hasErrored(undefined)).toBe(false);
    });
  });

  describe('isLoading method', () => {
    it('returns true if any loading state is loading', () => {
      expect(isLoading([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(isLoading(LoadingStates.LOADING)).toBe(true);
    });

    it('returns false if no loading states are loading', () => {
      expect(isLoading([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(false);
      expect(isLoading(LoadingStates.LOADED)).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(isLoading(undefined)).toBe(false);
    });
  });

  describe('hasLoaded method', () => {
    it('returns true if all loading states have loaded', () => {
      expect(hasLoaded([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(true);
      expect(hasLoaded(LoadingStates.LOADED)).toBe(true);
    });

    it('returns false if any state has not loaded', () => {
      expect(hasLoaded([LoadingStates.ERROR, LoadingStates.LOADED])).toBe(false);
      expect(hasLoaded([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(hasLoaded(LoadingStates.LOADING)).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(hasLoaded(undefined)).toBe(false);
    });
  });

  describe('isPending method', () => {
    it('returns true if any loading state is pending', () => {
      expect(isPending([LoadingStates.PENDING, LoadingStates.LOADING])).toBe(true);
      expect(isPending(LoadingStates.PENDING)).toBe(true);
    });

    it('returns false if no loading states are pending', () => {
      expect(isPending([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(isPending(LoadingStates.LOADED)).toBe(false);
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
});
