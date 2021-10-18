import {extendAll, urlError} from './utils';
import {getRequestPrefilter} from './request-prefilter';
import {ResourcesConfig} from './config';

const MIME_TYPE_JSON = 'application/json';

/**
 *
 */
export default function(model, options={}) {
  return ajax({
    contentType: MIME_TYPE_JSON,
    // url can be passed via the model or via options.url directly
    ...!options.url ? {url: model.url?.() || model.url || urlError()} : {},
    ...!options.data && ['POST', 'PATCH', 'PUT'].includes(options.method) ?
      {data: options.attrs || model.toJSON()} :
      {},
    error: (response) => Promise.reject(response),
    ...options
  });
}

/**
 *
 */
export function ajax(options) {
  var hasData = !!Object.keys(options.data || {}).length,
      hasBodyContent = !/^(?:GET|HEAD)$/.test(options.method) && hasData;

  if (options.method === 'GET' && hasData) {
    options.url += (options.url.indexOf('?') > -1 ? '&' : '?') +
      ResourcesConfig.stringify(options.data, options);
  }

  options = {...options, ...getRequestPrefilter()(options)};

  return window.fetch(options.url, {
    ...options,
    headers: {
      Accept: MIME_TYPE_JSON,
      //  * only set contentType header if a write request and if there is body data
      //  * default to JSON contentTypes, but allow for it to be overridden, ie with
      //    x-www-form-urlencoded.
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
        .then((json) => res.ok ?
          [json, res] :
          Promise.reject(extendAll(res, {json})))
  ).catch(options.error);
}
