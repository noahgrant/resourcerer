## Testing Components that Use Resourcerer

When writing tests for components that use either the `useResources` hook or the `withResources` HOC, we want to be able to easily avoid any kind of async behavior with the data fetching&mdash;and ideally we don’t even need to stub out the `fetch` requests. One way to get around this is to pass all resources to your test component as props. When this happens, the fetching is bypassed, and the component will render synchronously with the resources present, no stubbing necessary! Here’s an example for a component called `UserTodosList` that requires both a usersCollection and a todosCollection:

```js
import {Collection} from 'resourcerer';

// ...
const defaultProps = () => ({
  todosCollection: new Collection(mockTodos),
  usersCollection: new Collection(mockUsers),
  userId: 'noah'
},
    
renderUserTodosList = (props={}) => render(<UserTodosList {...defaultProps()} {...props} />);

        
it('runs a test', () => {
  // both resources are passed as props, so no fetching takes place, and the component
  // is rendered synchronously!
  var userTodosList = renderUserTodosList();
});
```

### Changing resource loading states

When using `resourcerer`, we are React function components that have no backing instances (and thus whose return from `render` is `null`). Therefore, we can't assert any prop values on components and we can't navigate a DOM tree the way we can when using classes. However, we can simply mock out `useResources` itself to test functionality. Because the `withResources` HOC also uses `useResources` under the hood, this will work when testing both. Here's an example (using [jest](https://jestjs.io/)) for testing how a component that uses `useResources` looks under a loading state:

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
