## Testing Components that Use `withResources`

When writing tests for components that use the `withResources` HOC, we want to be able to easily avoid any kind of async behavior with the data fetching, and ideally we don’t even need to stub out the `fetch` requests. One way to get around this is to pass all resources to your test component as props. When this happens, the fetching is bypassed, and the component will render synchronously with the resources present, no stubbing necessary! Here’s an example for a component called `UserTodosList` that requires both a usersCollection and a todosCollection:

```js
    // ...
    defaultProps = () => ({
      todosCollection: new Schmackbone.Collection(mockTodos),
      usersCollection: new Schmackbone.Collection(mockUsers),
      userId: 'noah'
    },
    
    renderUserTodosList = (props={}, ref='dataChild') => {
      var component = ReactDOM.render(
        <UserTodosList {...defaultProps()} {...props} />,
        document.body
      );
      
      return ref && component[ref] || component;
    };
        
    it('runs a test', () => {
      // both resources are passed as props, so no fetching takes place, and the component
      // is rendered synchronously!
      var userTodosList = renderUserTodosList();
    });
```

One thing you may have noticed is the `ref` argument to the function. The HOC attaches a couple different refs to its children so that they can be accessed, if necessary. The only time it usually ever is necessary is during testing, where we may want to invoke an instance method on our component. So we usually bake it into our helper method when we need to. There are two refs of interest with the `withResources` HOC:


- `dataCarrier` - the HOC wrapper component (useful to test changes in loading statuses for a component)
- `dataChild` - the wrapped component (ie, the `UserTodosList` class instance) 


## Testing Loading/Error states and Resource Requests

There are a few testing situations that are admittedly pretty clunky with `withResources`, and it’s largely due to lack of HOC-related access. So let’s walk through an example:


#### Testing Loading/Error States

    This problem arises when we’ve stubbed out `withResources` with the resources it expects but have no way of easily controlling how the HOC passes down critical loading states (`hasLoaded`/`isLoading`/`hasErrored`). We can pass down individual loading states, ie `renderUserTodosSection({usersLoadingState: LoadingStates.ERROR})`, and that will help for noncritical loading UIs in the console, but it won’t have any effect on the critical loading props. (Side note: this is because `withResources` looks at its own state for those properties, and those don’t get overridden by props passed in.) Yet we often want to ensure that we get the correct error state is displayed when a component’s loading has errored, or that we show a loader when the component is loading.
    
    In order to test these, we need to change the state itself, and we can do that by adding a reference to our wrapping component, ie in a `beforeEach` hook or similar:

    ```js
    beforeEach(() => {
      resources = renderLoginsSection();
      // wrapping resources component that holds loading states
      dataCarrier = resources.dataCarrier;
      // wrapped component
      userTodosList = resources.dataChild;
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
