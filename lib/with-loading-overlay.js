import PropTypes from 'prop-types';
import React from 'react';
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

// if `noLoader` is true, only displays the translucent overlay without
// the spinner on top of it.
const defaultOptions = {noLoader: false};

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
export default (options=defaultOptions) =>
  (Component) => {
    class LoadingOverlay extends React.Component {
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
          <div style={{position: 'relative'}}>
            {this.props.isLoading ? (
              <div style={overlayStyle}>
                {!options.noLoader ? <Loader overlay /> : null}
              </div>
            ) : null}
            {this.state.hasInitiallyLoaded || this.props.hasErrored ? (
              <NoUpdateIfLoading
                Component={Component}
                forwardRef={(child) => this.child = child}
                {...this.props}
              />
            ) : null}
          </div>
        );
      }
    }

    LoadingOverlay.propTypes = propTypes;

    return LoadingOverlay;
  };

// helper class to keep the wrapped component from updating when we move
// into a loading state
class NoUpdateIfLoading extends React.Component {
  shouldComponentUpdate(nextProps) {
    return !nextProps.isLoading;
  }

  render() {
    var {forwardRef, Component, ...rest} = this.props;

    return <Component ref={forwardRef} {...rest} />;
  }
}
