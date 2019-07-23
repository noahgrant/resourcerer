// Save references to native timeout functions, in case they are mocked by jasmine.clock().
const origSetTimeout = window.setTimeout;
const origClearTimeout = window.clearTimeout;
const origSetInterval = window.setInterval;
const origClearInterval = window.clearInterval;

/**
 * Our own version of Jasmine's waitsFor. Returns a Promise that resolves when the given condition
 * becomes true.
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

/**
 * Returns reference the wrapped DataCarrier instance, which is in charge of
 * keeping loading states as state and passing down our models from the model
 * cache into the data child.
 *
 * @param {object} tree - the top node returned from a withResources declaration
 * @return {object} the wrapped DataCarrier instance
 */
export function findDataCarrier(tree) {
  wrapperCheck(tree);

  return findChildAtDepth(tree, 1);
}

/**
 * Returns reference the wrapped DataChild instance, which is the user-defined
 * component that gets the @withResources decorator attached to it.
 *
 * @param {object} tree - the top node returned from a withResources declaration
 * @return {object} the wrapped DataChild instance
 */
export function findDataChild(tree) {
  wrapperCheck(tree);

  return findChildAtDepth(tree, 3);
}

/**
 * Return an object with reference all wrapped children returned within a
 * withResources declaration instance.
 *
 * @param {object} tree - the top node returned from a withResources declaration
 * @return {object} an object containing references to the parent resources
 *   component, the data carrier, data child, and even the error boundary
 *   component instances.
 */
export function getRenderedResourceComponents(tree) {
  wrapperCheck(tree);

  return {
    resources: tree,
    dataCarrier: findDataCarrier(tree),
    dataChild: findDataChild(tree),
    errorBoundary: findChildAtDepth(tree, 2)
  };
}

/**
 * In order for the wrapped-component convenience methods to work, the argument
 * must be an instance of ResourceStateWrapper returned from a `withResources`
 * declaration. This check throws an error if that is not the case.
 *
 * @param {object} tree - the top node for which to verify its type
 */
function wrapperCheck(tree) {
  if (Object.getPrototypeOf(tree).constructor.name !== 'ResourceStateWrapper') {
    throw new Error('Component must be of type returned by withResources function');
  }
}

/**
 * Core to our wrapped-component convenience methods, we simply walk down the
 * React tree a specified depth, which we know to always be true for our
 * wrapped components. This is all-the-easier because there are no siblings to
 * crawl.
 *
 * @param {object} node - entry in the React render tree
 * @param {number} depth - number of entries to crawl to get the child of interest
 * @return {object} rendered instance of wrapped component
 */
function findChildAtDepth(node, depth=0) {
  var i = 0;

  while (i++ < depth) {
    node = node.child || node._reactInternalFiber.child;
  }

  return node.stateNode;
}
