import { result, urlError } from "./utils.js";

import { ResourcererConfig, ResourcesConfig } from "./config.js";
import Model from "./model.js";
import Collection from "./collection.js";

const MIME_TYPE_JSON = "application/json";

type SyncResolvedValue = [any, Response];

export type SyncOptions = {
  attrs?: Record<string, any>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: Record<string, any>;
  url?: string;
  minDuration?: number;
  error?: (response: Response) => any;
  headers?: Record<string, string>;
  // they are free to add any other options they like
  [key: string]: any;
};

let prefilter: ResourcererConfig["prefilter"] = (x) => x;

/**
 * The basic sync function, which does very little other than prep the options argument sent to the
 * ajax function. It basically sets up defaults, seeding the query params if not explicitly
 * specified already. It also finds the base url or throws if one does not exist.
 *
 * @param {Model|Collection} model - model making API request
 * @param {object} options - generic map of request options
 * @return {promise} fetch request. resolves with an array of the model and its request status or
 *   rejects with the response
 */
export default function (model: Model | Collection, options: SyncOptions = {}) {
  return ajax({
    contentType: MIME_TYPE_JSON,
    params:
      options.params || ["POST", "PATCH", "PUT"].includes(options.method || "") ?
        options.attrs || model.toJSON()
      : {},
    // url can be passed via the model (as a property or function) or via options.url directly
    url: options.url || result(model, "url", model.urlOptions) || urlError(),
    // default catch block. most large applications should override this in the config settings to
    // provide support for things like 401s or 429s.
    error: (response: Response) => response,
    ...options,
  });
}

/**
 * This is the method that actually makes the fetch call. It also runs the prefilter set up in the
 * config to modify any request options before the fetch takes place.
 *
 * @param {object} options - map of request options:
 *   * url {string} - this is required, but will be present automatically if not passed directly in
 *     the sync method's request object
 *   * params {object} - will be url-stringified for GET requests and JSON-stringified for POST
 *     bodies
 *   * headers {object} - map of headers to their values
 *   * contentType {string} value of content type header, which will also determine how the POST
 *     bodies are assembled
 *   * error {function} - rejected promise callback, called with the request Response object. this
 *     should be customized for most large applications
 * @return {promise} fetch request. resolves with an array of the model and its request status or
 *   rejects with the response
 */
export function ajax(
  options: SyncOptions & Required<Pick<SyncOptions, "error" | "url" | "params">>
): Promise<SyncResolvedValue> {
  const hasParams = options.params instanceof FormData || !!Object.keys(options.params).length;
  const hasBodyContent = !/^(?:GET|HEAD)$/.test(options.method || "") && hasParams;
  const startTime = Date.now();

  const onRequestComplete = (json: any, response: Response): Promise<SyncResolvedValue> => {
    const requestDuration = Date.now() - startTime;
    const routeRequest = (
      resolve: (value: SyncResolvedValue) => void,
      reject: (response?: any) => void
    ) =>
      response.ok ?
        resolve([json, response])
      : reject(options.error(Object.assign(response, { json })));

    return new Promise((resolve, reject) =>
      !options.minDuration || requestDuration >= options.minDuration ?
        // resolve immediately if no min duration or duration exceeds min, otherwise wait
        routeRequest(resolve, reject)
      : window.setTimeout(
          () => routeRequest(resolve, reject),
          options.minDuration - requestDuration
        )
    );
  };

  if (options.method === "GET" && hasParams) {
    options.url +=
      (options.url.indexOf("?") > -1 ? "&" : "?") +
      ResourcesConfig.stringify(options.params, options);
  }

  options = { ...options, ...prefilter(options) };

  return window
    .fetch(options.url, {
      ...options,
      headers: {
        Accept: MIME_TYPE_JSON,
        // only set contentType header if a write request and if there is body params. also, default
        // to JSON contentTypes, but allow for it to be overridden, ie with x-www-form-urlencoded.
        ...(hasBodyContent ? { "Content-Type": options.contentType } : {}),
        ...options.headers,
      },
      ...(hasBodyContent ?
        {
          body:
            typeof options.params === "string" || options.params instanceof FormData ?
              options.params
            : options.contentType === MIME_TYPE_JSON ? JSON.stringify(options.params)
            : ResourcesConfig.stringify(options.params, options),
        }
      : {}),
    })
    .then((res) =>
      res
        .json()
        // catch block here handles the case where the response isn't valid json,
        // like for example a 204 no content
        .catch(() => ({}))
        .then((json) => onRequestComplete(json, res))
    );
}

/**
 * Override this to provide custom request options manipulation before a request
 * goes out, for example, to add auth headers to the `headers` property, or to
 * custom wrap the error callback in the `error` property.
 */
export function setRequestPrefilter(_prefilter: ResourcererConfig["prefilter"]) {
  prefilter = _prefilter;
}
