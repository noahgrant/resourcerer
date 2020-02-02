import {NoUpdateIfLoading, withLoadingOverlay} from '../lib/loading-overlay.js';

import React from 'react';
import ReactDOM from 'react-dom';
import {ResourcesConfig} from '../lib/config';
import {scryRenderedComponentsWithType} from 'react-dom/test-utils';
import {waitsFor} from './test-utils';

class TestComponent extends React.Component {
  render() {
    return <div />;
  }
}

const {Loader} = ResourcesConfig;
const jasmineNode = document.createElement('div');

describe('WithLoadingOverlay', () => {
  var Loady = withLoadingOverlay()(TestComponent),
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

  it('renders the wrapped component only after \'hasLoaded\' has been true once', async(done) => {
    loady = renderLoady();
    expect(scryRenderedComponentsWithType(loady, TestComponent).length).toEqual(0);
    loady = renderLoady({hasLoaded: true});

    await waitsFor(() => loady.state.hasInitiallyLoaded);

    expect(scryRenderedComponentsWithType(loady, TestComponent).length).toEqual(1);
    done();
  });

  it('does not show the spinner if passed a \'noLoader\' option', () => {
    loady = renderLoady({isLoading: true}, withLoadingOverlay({noLoader: true})(TestComponent));
    loaders = scryRenderedComponentsWithType(loady, Loader);

    expect(loaders.length).toEqual(0);
  });

  it('does not include its own intermediary component if passed a \'direct\' option', () => {
    // pass hasErrored just as an easy way to render its children
    loady = renderLoady({hasErrored: true});
    expect(scryRenderedComponentsWithType(loady, NoUpdateIfLoading).length).toEqual(1);
    expect(scryRenderedComponentsWithType(loady, NoUpdateIfLoading)[0].props.Component)
        .toEqual(TestComponent);
    ReactDOM.unmountComponentAtNode(jasmineNode);

    loady = renderLoady({hasErrored: true}, withLoadingOverlay({direct: true})(TestComponent));
    expect(scryRenderedComponentsWithType(loady, NoUpdateIfLoading).length).toEqual(0);
    expect(loady.child instanceof TestComponent).toBe(true);
  });
});
