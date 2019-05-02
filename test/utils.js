import {_hasErrored, _hasLoaded, _isLoading} from '../lib/utils';
import {LoadingStates} from '../lib/constants';

describe('modelLoadingStatus', () => {
  describe('_hasErrored method', () => {
    it('returns true if any loading state has errored', () => {
      expect(_hasErrored([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(_hasErrored(LoadingStates.ERROR)).toBe(true);
    });

    it('returns false if no loading states have errored', () => {
      expect(_hasErrored([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(_hasErrored(LoadingStates.LOADED)).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(_hasErrored(undefined)).toBe(false);
    });
  });

  describe('_isLoading method', () => {
    it('returns true if any loading state is loading', () => {
      expect(_isLoading([LoadingStates.ERROR, LoadingStates.LOADING])).toBe(true);
      expect(_isLoading(LoadingStates.LOADING)).toBe(true);
    });

    it('returns false if no loading states are loading', () => {
      expect(_isLoading([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(false);
      expect(_isLoading(LoadingStates.LOADED)).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(_isLoading(undefined)).toBe(false);
    });
  });

  describe('_hasLoaded method', () => {
    it('returns true if all loading states have loaded', () => {
      expect(_hasLoaded([LoadingStates.LOADED, LoadingStates.LOADED])).toBe(true);
      expect(_hasLoaded(LoadingStates.LOADED)).toBe(true);
    });

    it('returns false if any state has not loaded', () => {
      expect(_hasLoaded([LoadingStates.ERROR, LoadingStates.LOADED])).toBe(false);
      expect(_hasLoaded([LoadingStates.LOADED, LoadingStates.LOADING])).toBe(false);
      expect(_hasLoaded(LoadingStates.LOADING)).toBe(false);
    });

    it('returns false if an undefined loading state is passed', () => {
      expect(_hasLoaded(undefined)).toBe(false);
    });
  });
});
