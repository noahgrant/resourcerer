import {result, urlError} from './utils';

import {ResourcesConfig} from './config';

const MIME_TYPE_JSON = 'application/json';

var prefilter = (x) => x;

/**
 * The basic sync function, which does very little other than prep the options argument sent to the
 * ajax function. It basically sets up defaults, seeding the query data if not explicitly specified
 * already. It also finds the base url or throws if one does not exist.
 *
 * @param {Model|Collection} model - model making API request
 * @param {object} options - generic map of request options
 * @return {promise} fetch request. resolves with an array of the model and its request status or
 *   rejects with the response
 */
export default function(model, options={}) {
  return ajax({
    contentType: MIME_TYPE_JSON,
    // url can be passed via the model (as a property or function) or via options.url directly
    ...!options.url ? {url: result(model, 'url') || urlError()} : {},
    ...!options.data && ['POST', 'PATCH', 'PUT'].includes(options.method) ?
      {data: options.attrs || model.toJSON()} :
      {},
    // default catch block. most large applications should override this in the config settings to
    // provide support for things like 401s or 429s.
    error: (response) => Promise.reject(response),
    ...options
  });
}

/**
 * This is the method that actually makes the fetch call. It also runs the prefilter set up in the
 * config to modify any request options before the fetch takes place.
 *
 * @param {object} options - map of request options:
 *   * url {string} - this is required, but will be present automatically if not passed directly in
 *     the sync method's request object
 *   * data {object} - will be url-stringified for GET requests and JSON-stringified for POST bodies
 *   * headers {object} - map of headers to their values
 *   * contentType {string} value of content type header, which will also determine how the POST
 *     bodies are assembled
 *   * error {function} - rejected promise callback, called with the request Response object. this
 *     should be customized for most large applications
 * @return {promise} fetch request. resolves with an array of the model and its request status or
 *   rejects with the response
 */
export function ajax(options) {
  var hasData = !!Object.keys(options.data || {}).length,
      hasBodyContent = !/^(?:GET|HEAD)$/.test(options.method) && hasData;

  if (options.method === 'GET' && hasData) {
    options.url += (options.url.indexOf('?') > -1 ? '&' : '?') +
      ResourcesConfig.stringify(options.data, options);
  }

  options = {...options, ...prefilter(options)};

  return window.fetch(options.url, {
    ...options,
    headers: {
      Accept: MIME_TYPE_JSON,
      // only set contentType header if a write request and if there is body data. also, default to
      // JSON contentTypes, but allow for it to be overridden, ie with x-www-form-urlencoded.
      ...hasBodyContent ? {'Content-Type': options.contentType} : {},
      ...options.headers
    },
    ...hasBodyContent ? {
      body: typeof options.data === 'string' ?
        options.data :
        options.contentType === MIME_TYPE_JSON ?
          JSON.stringify(options.data) :
          ResourcesConfig.stringify(options.data, options)
    } : {}
  // catch block here handles the case where the response isn't valid json,
  // like for example a 204 no content
  }).then(
    (res) => res.json()
        .catch(() => ({}))
        .then((json) => res.ok ? [json, res] : Promise.reject(Object.assign(res, {json})))
  ).catch(options.error);
}

/**
 * Override this to provide custom request options manipulation before a request
 * goes out, for example, to add auth headers to the `headers` property, or to
 * custom wrap the error callback in the `error` property.
 */
export function setRequestPrefilter(_prefilter) {
  prefilter = _prefilter;
}
