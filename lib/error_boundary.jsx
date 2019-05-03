import _ from 'underscore';
import React from 'react';
import {ResourcesConfig} from './config';

/**
 * As of React 16, Error Boundaries (components with a componentDidCatch method)
 * allow component trees to gracefully fail when an unexpected error is caught
 * somewhere else in the application. Where exactly we use this is up to us, but
 * A critical place is around our withResources wrapped components, where any
 * errors can bubble up and allow us to show an error message in its place.
 *
 * Note that as of React 16, if these boundaries don't exist, an uncaught error
 * will cause the entire application to unmount.
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
    ResourcesConfig.log(err);
  }

  render() {
    if (this.state.caughtError) {
      // TODO....
      return 'An error occurred.';
    }

    return React.cloneElement(this.props.children, _.omit(this.props, 'children'));
  }
}
