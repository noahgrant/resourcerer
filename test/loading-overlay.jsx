import {LoadingOverlay} from '../lib/loading-overlay.js';
import ReactDOM from 'react-dom';
import {waitsFor} from './test-utils';

function TestComponent(props) {
  return (
    <LoadingOverlay {...props}>
      {props.children}
    </LoadingOverlay>
  );
}

const jasmineNode = document.createElement('div');

describe('LoadingOverlay', () => {
  var renderLoady = (props={}) => ReactDOM.render(<TestComponent {...props} />, jasmineNode),
      assertOverlayStyles = () => {
        var overlayStyle = window.getComputedStyle(jasmineNode.firstChild.firstChild);

        expect(overlayStyle.backgroundColor).toEqual('rgba(255, 255, 255, 0.6)');
        expect(overlayStyle.bottom).toEqual('0px');
        expect(overlayStyle.left).toEqual('0px');
        expect(overlayStyle.position).toEqual('absolute');
        expect(overlayStyle.right).toEqual('0px');
        expect(overlayStyle.top).toEqual('0px');
      };

  beforeEach(() => {
    document.body.appendChild(jasmineNode);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(jasmineNode);
    jasmineNode.remove();
  });

  it('shows a loading overlay when \'isLoading\' is true', () => {
    renderLoady();
    expect(jasmineNode.querySelector('.Loader')).toBe(null);
    expect(jasmineNode.firstChild.firstChild).toBe(null);

    ReactDOM.unmountComponentAtNode(jasmineNode);
    renderLoady({isLoading: true});
    assertOverlayStyles();
    expect(jasmineNode.querySelector('.Loader')).toBeDefined();
  });

  it('renders the wrapped component only after \'hasLoaded\' has been true once', async(done) => {
    renderLoady({children: <p>some children</p>});
    expect(jasmineNode.textContent).toEqual('');

    ReactDOM.unmountComponentAtNode(jasmineNode);
    renderLoady({children: <p>some children</p>, hasLoaded: true});

    await waitsFor(() => jasmineNode.querySelector('p'));
    expect(jasmineNode.textContent).toEqual('some children');
    done();
  });

  it('renders the wrapped component if \'hasErrored\' is true', () => {
    renderLoady({children: <p>some children</p>});
    expect(jasmineNode.textContent).toEqual('');

    ReactDOM.unmountComponentAtNode(jasmineNode);
    renderLoady({children: <p>some children</p>, hasErrored: true});
    expect(jasmineNode.textContent).toEqual('some children');
  });

  it('does not show the spinner if passed a \'noLoader\' option', () => {
    renderLoady({isLoading: true, noLoader: true});
    expect(jasmineNode.querySelector('.Loader')).toBe(null);
    assertOverlayStyles();
  });
});
