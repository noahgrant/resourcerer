import React, {useEffect, useState} from 'react';

import ErrorBoundary from './error-boundary';
import PropTypes from 'prop-types';
import {ResourcesConfig} from './config';

const propTypes = {
  /**
   * These props reflect loading states of any data necessary to render the
   * child component, and don't necessarily have any correlation with similarly-
   * named props from withResources (though they might).
   */
  isLoading: PropTypes.bool,
  hasLoaded: PropTypes.bool
};

const defaultOptions = {
  /**
   * If true, does not add an additional component with falsy sCU after
   * moving into a loading state. Allows for children to set their own
   * sCU and use other lifecycle methods like cWRP on the client component.
   */
  direct: false,
  /**
   * If `noLoader` is true, only displays the translucent overlay without
   * the spinner on top of it.
   */
  noLoader: false
};

const overlayStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.6)',
  bottom: 0,
  left: 0,
  margin: 'auto',
  position: 'absolute',
  right: 0,
  top: 0,
  zIndex: 10
};

/**
 * This HOC renders a translucent overlay with a loader over its wrapped
 * component, allowing for an easy 'display the old while we fetch the new'.
 */
export const withLoadingOverlay = (options=defaultOptions) =>
  (Component) => {
    class _LoadingOverlay extends React.Component {
      constructor(props) {
        super();

        this.state = {
          /**
           * {boolean} Whether the child has requisite data to initially render content. From that
           *    point on, this component can keep the child rendered with old data while new
           *    data fetches.
           */
          hasInitiallyLoaded: props.hasLoaded
        };
      }

      componentDidUpdate(prevProps, prevState) {
        if (!prevState.hasInitiallyLoaded && this.props.hasLoaded) {
          this.setState({hasInitiallyLoaded: true});
        }
      }

      render() {
        const {Loader} = ResourcesConfig;

        return (
          <div className='LoadingOverlay' style={{position: 'relative'}}>
            {this.props.isLoading ? (
              <div style={overlayStyle}>
                {!options.noLoader ? <Loader overlay /> : null}
              </div>
            ) : null}
            {this.state.hasInitiallyLoaded || this.props.hasErrored ? (
              options.direct ? (
                <Component
                  {...(Component.prototype || {}).isReactComponent ?
                    {ref: (child) => this.child = child} :
                    {}}
                  {...this.props}
                />
              ) : (
                <NoUpdateIfLoading
                  Component={Component}
                  forwardRef={(child) => this.child = child}
                  {...this.props}
                />
              )
            ) : null}
          </div>
        );
      }
    }

    _LoadingOverlay.propTypes = propTypes;

    return _LoadingOverlay;
  };

// helper class to keep the wrapped component from updating when we move
// into a loading state
export class NoUpdateIfLoading extends React.Component {
  shouldComponentUpdate(nextProps) {
    return !nextProps.isLoading;
  }

  render() {
    var {forwardRef, Component, ...rest} = this.props;

    return (
      <Component
        {...(Component.prototype || {}).isReactComponent ? {ref: forwardRef} : {}}
        {...rest}
      />
    );
  }
}

/**
 * This version of the loading overlay uses React hooks and is meant to be used
 * in conjunction with the useResources hook. It is a simple React functional
 * component and not, as withLoadingOverlay is, a HOC. Takes the same props as
 * the PropTypes for withLoadingOverlay, and accepts as React children the
 * content to lay over.
 *
 * Because useResources keeps its models as state instead of reading directly
 * from the cache, there is no need for a sCU-equivalent to keep the children
 * from updating when we go to a loading state.
 *
 * NOTE: THIS COMPONENT IS DEPRECATED AND WILL BE REMOVED IN A FUTURE RELEASE.
 * OPT INSTEAD TO USE `HASINITIALLYLOADED` AS RETURNED FROM THE HOOK.
 */
export function LoadingOverlay(props) {
  const {Loader} = ResourcesConfig;
  var [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(props.hasLoaded);

  useEffect(() => {
    if (!hasInitiallyLoaded && props.hasLoaded) {
      setHasInitiallyLoaded(true);
    }
  }, [props.hasLoaded]);

  return (
    <ErrorBoundary>
      <div className='LoadingOverlay' style={{position: 'relative'}}>
        {props.isLoading ? (
          <div style={overlayStyle}>
            {!props.noLoader ? <Loader overlay /> : null}
          </div>
        ) : null}
        {hasInitiallyLoaded || props.hasErrored ? props.children : null}
      </div>
    </ErrorBoundary>
  );
}

LoadingOverlay.propTypes = propTypes;
