var prefilter = (x) => x;

// override this to provide custom request options manipulation before a request
// goes out, for example, to add auth headers to the `headers` property, or to
// custom wrap the error callback in the `error` property
export function getRequestPrefilter() {
  return prefilter;
}

export function setRequestPrefilter(_prefilter) {
  prefilter = _prefilter;
}
