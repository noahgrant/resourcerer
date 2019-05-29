import _ from 'underscore';
import React from 'react';
import {ResourcesConfig} from './config';

/**
 * As of React 16, Error Boundaries (components with a componentDidCatch method)
 * allow component trees to gracefully fail when an unexpected error is caught
 * somewhere else in the application. A convenient place to use one is around
 * our withResources wrapped components, where any errors can bubble up and
 * allow us to show an error message in its place.
 *
 * The component displayed when an error is caught can be custom configured by
 * using the `setConfig` function in your config file:
 *
 * ```jsx
 * import {setConfig} from 'with-resources/config';
 *
 * setConfig({errorBoundaryChild: <MyErroredComponent />});
 * ```
 *
 * Note that as of React 16, if these boundaries don't exist at all, an uncaught
 * error will cause the entire application to unmount.
 */
export default class ErrorBoundary extends React.Component {
  constructor() {
    super();

    this.state = {
      /** Whether the error boundary has a bubbled error to catch */
      caughtError: false
    };
  }

  componentDidCatch(err, info) {
    this.setState({caughtError: true});
    // hook to allow custom error reporting for an application
    ResourcesConfig.log(err, info);
  }

  render() {
    if (this.state.caughtError) {
      return ResourcesConfig.errorBoundaryChild;
    }

    return React.cloneElement(this.props.children, _.omit(this.props, 'children'));
  }
}
