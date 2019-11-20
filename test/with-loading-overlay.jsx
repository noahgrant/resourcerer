import React from 'react';
import ReactDOM from 'react-dom';
import {ResourcesConfig} from '../lib/config';
import {scryRenderedComponentsWithType} from 'react-dom/test-utils';
import {waitsFor} from './test-utils';
import withLoadingOverlay from '../lib/with-loading-overlay.js';

const TestClass = class TestComponent extends React.Component {
  render() {
    return <div />;
  }
};

const {Loader} = ResourcesConfig;
const jasmineNode = document.createElement('div');

describe('WithLoadingOverlay', () => {
  var Loady = withLoadingOverlay()(TestClass),
      loady,
      loaders,

      renderLoady = (props={}, Component=Loady) =>
        ReactDOM.render(<Component {...props} />, jasmineNode);

  beforeEach(() => {
    document.body.appendChild(jasmineNode);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(jasmineNode);
    jasmineNode.remove();
  });

  it('shows a loading overlay when \'isLoading\' is true', () => {
    loady = renderLoady();
    expect(scryRenderedComponentsWithType(loady, Loader).length).toEqual(0);
    loady = renderLoady({isLoading: true});

    loaders = scryRenderedComponentsWithType(loady, Loader);
    expect(loaders.length).toEqual(1);
    expect(loaders[0].props.overlay).toBe(true);
  });

  it('renders the wrapped component only after \'hasLoaded\' has been true once', (done) => {
    loady = renderLoady();
    expect(scryRenderedComponentsWithType(loady, TestClass).length).toEqual(0);
    loady = renderLoady({hasLoaded: true});

    return waitsFor(() => loady.state.hasInitiallyLoaded).then(() => {
      expect(scryRenderedComponentsWithType(loady, TestClass).length).toEqual(1);
      done();
    });
  });

  it('does not show the spinner if passed a \'noLoader\' option', () => {
    loady = renderLoady({isLoading: true}, withLoadingOverlay({noLoader: true})(TestClass));
    loaders = scryRenderedComponentsWithType(loady, Loader);

    expect(loaders.length).toEqual(0);
  });
});
