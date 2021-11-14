// Save references to native timeout functions, in case they are mocked by mock.clock().
const origSetTimeout = window.setTimeout;
const origClearTimeout = window.clearTimeout;
const origSetInterval = window.setInterval;
const origClearInterval = window.clearInterval;

/**
 * Returns a Promise that resolves when the given condition becomes true.
 *
 * @param {function} condition - a function that returns a value representing the condition
 *    we're waiting for. The promise resolves when this function returns a truthy value.
 * @param {number} time - the time (in milliseconds) to wait for the condition before timing out.
 * @param {string} name - the display string of what we're waiting for.
 */
export function waitsFor(condition, time=3000, name='something to happen') {
  var interval,
      timeout = origSetTimeout(() => {
        origClearInterval(interval);
        throw new Error(`Timed out after ${time}ms waiting for ${name}`);
      }, time);

  return new Promise((res) => {
    interval = origSetInterval(() => {
      if (condition()) {
        origClearInterval(interval);
        origClearTimeout(timeout);
        res();
      }
    }, 0);
  });
}
