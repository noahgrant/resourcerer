## Testing Components that Use `withResources`

When writing tests for components that use the `withResources` HOC, we want to be able to easily avoid any kind of async behavior with the data fetching, and ideally we don’t even need to stub out the `fetch` requests. One way to get around this is to pass all resources to your test component as props. When this happens, the fetching is bypassed, and the component will render synchronously with the resources present, no stubbing necessary! Here’s an example for a component called `UserTodosList` that requires both a usersCollection and a todosCollection:

```js
    // ...
    defaultProps = () => ({
      todosCollection: new Schmackbone.Collection(mockTodos),
      usersCollection: new Schmackbone.Collection(mockUsers),
      userId: 'noah'
    },
    
    renderUserTodosList = (props={}) => ReactDOM.render(
      <UserTodosList {...defaultProps()} {...props} />,
      document.body
    );

        
    it('runs a test', () => {
      // both resources are passed as props, so no fetching takes place, and the component
      // is rendered synchronously!
      var userTodosList = renderUserTodosList();
    });
```

### Access to HOC-wrapped Components

In the last example, `userTodosList` is a reference to an instance of the fully-wrapped component class&mdash;not an instance of the class itself. To get references to the child components within our HOC, `resourcerer` exposes a few helper methods. There are generally two components of interest:

- `DataCarrier` - the HOC wrapper component (useful to test changes in loading statuses for a component)
- `DataChild` - the wrapped component (ie, the `UserTodosList` class instance)

```jsx
import {findDataCarrier, findDataChild, getRenderedResourceComponents} from 'resourcerer/test-utils';

// ...
    it('runs a test', () => {
      // this actually a reference to the HOC-wrapped component instance
      var resources = renderUserTodosList(),
          // this is a reference to the component that does the data fetching, keeps loading states
          // as state, and passes in models from the ModelCache to its child (user-defined component)
          dataCarrier = findDataCarrier(resources),
          // this is a reference to the unwrapped user-defined component class instance
          dataChild = findDataChild(resources);
          
      // equivalently, you can use the `getRenderedResourceComponents` method to get all in one fell swoop:
      ({dataCarrier, dataChild, resources} = getRenderedResourceComponents(renderUserTodosList()));
      
      console.log(resources.props.userTodosLoadingState); // undefined
      console.log(dataCarrier.props.userTodosLoadingState); // undefined
      console.log(dataCarrier.state.userTodosLoadingState); // 'loaded'
      console.log(dataChild.props.userTodosLoadingState); // 'loaded'
    });

```

### Testing Loading/Error States

This problem arises when we’ve stubbed out `withResources` with the resources it expects but have no way of easily controlling how the HOC passes down critical loading states (`hasLoaded`/`isLoading`/`hasErrored`). We can pass down individual loading states, ie `renderUserTodosSection({usersLoadingState: LoadingStates.ERROR})`, and that will help for noncritical loading UIs in the console, but it won’t have any effect on the critical loading props. (Side note: this is because `withResources` looks at its own state for those properties, and those don’t get overridden by props passed in.) Yet we often want to ensure that we get the correct error state is displayed when a component’s loading has errored, or that we show a loader when the component is loading.
    
In order to test these, we need to change the state itself, and we can do that by adding a reference to our wrapping component, ie in a `beforeEach` hook or similar:

```js
import {findDataCarrier, findDataChild, getRenderedResourceComponents} from 'resourcerer/test-utils';
import {scryRenderedComponentsWithType} from 'react-dom/test-utils';

// ...
    beforeEach(() => {
      resources = renderLoginsSection();
      // wrapping resources component that holds loading states
      dataCarrier = findDataCarrier(resources)
      // wrapped component
      userTodosList = findDataChild(resources);
      // equivalently:
      // ({dataCarrier, dataChild: userTodosList, resources} = getRenderedResourceComponents(renderLoginsSection()));
    });
    
    // now, we can set state directly on our resources instance
    it('blocks rendering until the todos and users collection has loaded', () => {
      dataCarrier.setState({
        todosLoadingState: LoadingStates.LOADING,
        usersLoadingState: LoadingStates.LOADING
      });
    
      expect(userTodosList.props.isLoading).toBe(true);
      expect(scryRenderedComponentsWithType(resources, Loader).length).toEqual(1);
    
      resources.setState({
        todosLoadingState: LoadingStates.LOADED,
        usersLoadingState: LoadingStates.LOADED
      });
    
      expect(scryRenderedComponentsWithType(resources, Loader).length).toEqual(0);
      expect(userTodosList.props.hasLoaded).toBe(true);
    });
```

## Testing Components that Use `useResources`

When using the `useResources` hook, we are necessarily using React function components that have no backing instances (and thus whose return from `render` is `null`). Therefore, we can't assert any prop values on components and we can't navigate a DOM tree the way we can when using classes. However, we can simply mock out `useResources` itself to test functionality. Here's an example (using [jest](https://jestjs.io/)) for testing how a component that uses `useResources` looks under a loading state:

```jsx
import * as resourcerer from 'resourcerer';

// ...
it('shows a loader when in a loading state', () => {
   jest.spyOn(resourcerer, 'useResources').mockImplementation((fn, props) => ({
     ...props,
     hasLoaded: false,
     isLoading: true
   ));

   const {container} = render(<MyComponent />);
   
   expect(container.querySelector('.Loader')).toBeInTheDocument();
});
```

This should solve most of your use cases; you can return any mocked info you want, such as a noncritical loading state. You can also mock out `setResourceState`:

```jsx
 var setResourceMock = jest.fn();
 
 jest.spyOn(resourcerer, 'useResources').mockImplementation((fn, props) => ({
   ...props,
   setResourceState: setResourceMock
 ));
```

Keep in mind that in this case the calls to `setResourceState` won't actually go through, and so state won't persist. 
