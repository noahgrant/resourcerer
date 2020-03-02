import {ModelMap, ResourceKeys} from './config';

import _ from 'underscore';
import {getCacheKey} from './index';
import {noOp} from './utils';
import request from './request';

// prevents api request bursts based on quick swipes
const PREFETCH_TIMEOUT = 50;

/**
 * Call this as with a resources config function and a component's props.
 * The returned function should be applied to an onMouseEnter callback.
 *
 * @param {function} getResources - function that takes props as an argument
 *   and should return a map of resources. Identical to those used in
 *   `withResources` HOC
 * @param {object} expectedProps - props in the form expected when the resource
 *   would be needed
 * @return {function} callback to be invoked onMouseEnter of appropriate DOM el
 */
export default (getResources, expectedProps={}) => {
  var fetched,
      resources = Object.entries(getResources(expectedProps, ResourceKeys) || {});

  return (evt) => {
    var {target} = evt,
        prefetchTimeout;

    if (target && !fetched) {
      // set short timeout so that we can cancel if user 'doesn't intend'
      // to click on the link
      prefetchTimeout = window.setTimeout(() => {
        resources.forEach(([name, config]) => {
          request(getCacheKey({modelKey: name, ...config}, expectedProps), ModelMap[name], {
            ...config,
            prefetch: true
          // Prefetch is only opportunistic so if we error now,
          // we'll retry and handle the error in withResources
          }).catch(noOp);
        });

        fetched = true;
      }, PREFETCH_TIMEOUT);

      // if we leave the prefetch element before the timeout, don't prefetch
      target.addEventListener('mouseleave', _.once(_onMouseLeave.bind(null, prefetchTimeout)));
    }
  };
};

/**
 * If user swipes quickly over the DOM el of interest, cancel the timeout
 * to avoid spamming the API.
 *
 * @param {number} timeout - timeout to clear so that prefetch doesn't happen
 */
function _onMouseLeave(timeout) {
  window.clearTimeout(timeout);
}
