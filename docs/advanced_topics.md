# Contents  

1. [Thoughts on the PENDING Resource](#thoughts-on-the-pending-resource)
1. [Implicit dependent resources](#implicit-dependent-resources)
1. [Unfetched Resources](#unfetched-resources)
1. [Loading Overlays](#loading-overlays)
1. [isOrWillBeLoading](#isorwillbeloading)
1. [Recaching newly-saved models](#recaching-newly-saved-models)

## Thoughts on the PENDING Resource

Using `dependsOn` in simple cases like the one highlighted in the [README](https://github.com/noahgrant/resourcerer/blob/master/README.md) is pretty straightforward and very powerful. But `PENDING` resources bring additional complexities to your resource logic, some of which are enumerated here:



1. `PENDING` critical resources don’t contribute to `isLoading`/`hasErrored` states, but will keep your component from reaching a `hasLoaded` state. Semantically, this makes sense, because `this.props.hasLoaded` should only be true when all critical resources have loaded, regardless of when a resource’s request is made.
    
1. When a `PENDING` resource request is not in flight, its model prop will still be the empty model instance whose properties are frozen (as happens when the resource is in the other three possible loading states). This is to more predictably handle our resources in our components. We don’t need to be defensive with syntax like:

   ```js
   todosCollection && todosCollection.toJSON(); // unnecessary
   ```

   Furthermore, if you've defined additional instance methods on your model, they will be present without being defensive:

   ```js
   todosCollection.myInstanceMethod(); // guaranteed not to error regardless of loading state
   ```
        
1. When a previously-`PENDING` but currently `LOADED` resource has its dependent prop removed, it goes back to a `PENDING` state (recall that if the dependent prop is changed, it gets put back into a `LOADING` state while the new resource is fetched). This puts us in an interesting state:
    
    1. `hasInitiallyLoaded` will remain true, as expected. But the `PENDING` resource’s prop&mdash;assuming the resource’s `cacheFields` list includes the dependent prop&mdash;will now return to the empty model/collection, so any child component that may remain in place after `hasInitiallyLoaded` may need to keep that in mind (if `shouldComponentUpdate` returns false when the new resource fetches, then this shouldn’t matter&mdash;see the next point).
        
    2. Recall that we can provide the dependent prop in one of two ways:
        1. We can include it in another resource’s `provides` property, in which case the dependent prop gets saved as HOC state.
        2. We can modify the url in the component’s `componentDidUpdate` (either url path or query parameter), which will filter the prop down.
    
        When we provide using method (a), the dependent prop can be changed but not removed. When we provide using method (b), the dependent prop can be changed or removed.
    
        So if we use method (b) and remove the dependent prop, we enter a state where `isLoading`, `hasLoaded`, and `hasErrored` are all false. And since we have to wait for a `componentDidUpdate` to re-update the url with the dependent prop, a lifecycle passes with this state, and there’s really nothing we can do about it.
        
        And again—`hasInitiallyLoaded` is still true and the model prop is empty, which can cause layout issues if you use, for example, an overlaid loader over a previously-rendered component. For this reason, such a previously-rendered component should use `nextProps.hasLoaded` instead of `!nextProps.isLoading` in its `shouldComponentUpdate`:

        ```js
        // overlay-wrapped component, where a loader will show over previously-rendered children,
        // which we want to then not update. but this component is also a child of a `withResources`
        // component that has a dependent resource
        shouldComponentUpdate(nextProps) {
          // using `return !nextProps.isLoading;` would update the component in the above
          // scenario, even though `nextProps.myDependentModel` would be empty
          return nextProps.hasLoaded;
        }
      
        // this assumes that the parent is handling the `hasErrored` state. if it is not, then
        // you may need to instead use:
        shouldComponentUpdate(nextProps) {
          return !(nextProps.isLoading || isPending(nextProps.myDependentLoadingState));
        }
        ```

        As an example of how we might be able to remove a dependent prop, consider someone navigating to a `/todos` url that auto-navigates to the first todo item and displays its details. The `todoItem` details resource depends on a `todoId` prop, which it gets in a `componentWillReceiveProps` via changing the url once the `todos` resource loads. So now we’re at `/todos/todo1234`. But if the user clicks the back button, we’ll be back at `/todos` with a cached `todos` resource and `PENDING` `todoItem` resource, and all three loading states set to `false`.

    3. In the case that the model's `cacheFields` does not include the dependent prop (ie, the prop is used solely for triggering the resource request and doesn't factor into the request data), the model will still exist in the cache when the dependent prop is removed. In this case, the loading state is still returned to PENDING, but the existing model will also be present in the return value.
       
## Implicit dependent resources

Another way to effectively have a dependent resource is to use a conditional in your `getResources` method:
    
```js
const getResources = (ResourceKeys, props) => ({
  [ResourceKeys.TODOS]: {},
  ...(props.todoId ? {[ResourceKeys.TODO_ITEM]: {data: {id: props.todoId}} : {})
});
```

In general, using `dependsOn` is much more preferable, both in terms of semantics and functionality. The key difference here is that the dependent resource does not get put into a `PENDING` state, and `hasLoaded` depends on an unpredictable number of resources&mdash;for example, in the above scenario, what happens if `props.todoId` never arrives? Using `dependsOn`, `hasLoaded` would not be true, but using the conditional, it would be. This means that with the conditional, you can’t freely make assumptions behind the `hasLoaded`  flag:

```jsx
{hasLoaded ? (
  // with the conditional, you don't know which resources are available. with
  // `dependsOn`, you do
) : null}
```

That doesn’t mean that the conditional can’t be useful&mdash;it’s just that its use should be relegated to components that have two discrete forms&mdash;one in which the dependent prop is always present, and one in which the dependent prop is never present. If you’re unsure whether a prop might exist, notably because it comes from a providing resource, you should use `dependsOn`. A good example of when to use a conditional is in this fake component that sometimes fetches a user model and sometimes fetches an order model depending on the presence of an `orderId` prop:

```js
const getResources = (ResourceKeys, {userId, orderId}) => ({
  ...userId ? {[ResourceKeys.USER]: {options: {userId}} : {},
  ...!userId && orderId ? {
    [ResourceKeys.ORDER]: {
      noncritical: true,
      data: {id: orderId}
    }
  } : {}
});
```

In this case, when the component is used as an order component (denoted by the presence of the `orderId` prop), we fetch the `order` resource. Otherwise, we don’t.

For all other uses of dependent resources, we should use `dependsOn`.


## Unfetched Resources

You may find, at some point in your application, that you have a `PUT` endpoint for a resource but no `GET`; the 'read portion' of the resource is received as part of some parent resource. For example, imagine you have an accounts resource at `/accounts/{account_id}`, whose response has a `config` property with some account configuration settings. To update the configuration, you make a `PUT` to `/accounts/{account_id}/config`. But reading comes from the parent resource. `resourcerer` supports this via a `providesModels` static property on the model:

```js
// resources_conifg.js
import {ResourceKeys, UnfetchedResources} from 'resourcerer';

ResourceKeys.add({
  ACCOUNT: 'account',
  ACCOUNT_CONFIG: 'accountConfig'
});

// add the ACCOUNT_CONFIG key to our set of UnfetchedResources
UnfetchedResources.add(ResourceKeys.ACCOUNT_CONFIG);


// account_model.js
export default class AccountModel extends Model {
  url() {
    return `/accounts/${this.accountId}`;
  }

  static cacheFields = ['accountId']
  
  static providesModels = (accountModel, ResourceKeys) => [{
    data: accountModel.get('config'),
    modelKey: ResourceKeys.ACCOUNT_CONFIG,
    options: {accountModel}
  }]
})
```

The `providesModels` property is a function that takes the parent model and the `ResourceKeys` as arguments and returns an array of resource configs. The resource configs have the same schema as the those used in our general executor functions. What this tells `resourcerer` to do is, after the parent model returns, instantiate the child model(s) and place them into the `ModelCache`. In other components, you can then access the model you know to exist in a `withResources` or `useResources` declaration:

```js
// child_component.jsx, rendered only after the account model is known to return
@withResources((ResourceKeys, props) => ({[ResourceKeys.ACCOUNT_CONFIG]: {}}))
class ChildComponent extends React.Component {
  // component has this.props.accountConfigModel from the cache!
  onClickSomething() {
    // and now you can update the config directly :)
    this.props.accountConfigModel.save();
  }
}
```

In general, this should be used in cases where you can ascertain that the parent model has returned before trying to access the child model. However, if by chance it has not, and the child is not found in the cache, `resourcerer` will still not attempt to fetch it, because it is listed within the `UnfetchedResources` set. In that case, the model will get instantiated with no seed data and passed as a prop.

Also, note that the `modelKey` property is required here instead of optionally being inferred from the resource config's object property, as is the case in our general `useResources`/`withResources` declarations. This is because here, in contrast, the models are simply placed in the cache and not actually used as props for any component, so they don't need to be named. Accordingly, resource configs are also returned as a list here instead of an object.

The resource config objects within `providesModels` have the same schema, as mentioned, as normal. But they also accept an additional optional property, `shouldCache`, which is a function that takes the parent model and the resource config as an argument. If the function exists and returns false, the model will not get instantiated nor placed in the cache:

```js
// account_model.js
export default class AccountModel extends Model {
  // ...
  static cacheFields: ['accountId']
  
  static providesModels = (accountModel, ResourceKeys) => [{
    data: accountModel.get('config'),
    modelKey: ResourceKeys.ACCOUNT_CONFIG,
    options: {accountModel},
    // if this returns false, account config won't get instantiated and placed in the ModelCache
    shouldCache: (accountModel, config) => accountModel.get('state') === 'ACTIVE'
  }]
})
```

## Loading Overlays

You probably want to show loaders when you are moving between one model and the next. Because your resources are held as state, both exist in this intermediate state.
Both the hook and the HOC provide a `hasInitiallyLoaded` prop that is useful here. Here's an example of what it might look like (shown over one of [Sift](https://sift.com)'s Insights Charts):

![loading_overlay](https://user-images.githubusercontent.com/1355779/69263885-10440e80-0b7b-11ea-811d-29aa404b91d2.gif)

Use it like:

```jsx
import {useResources} from 'resourcerer';

const getResources = ({TODOS}, props) => ({[TODOS]: {}});

export default function UserTodos(props) {
  var {isLoading, hasInitiallyLoaded, todosCollection} = useResources(getResources, props);
    
  return (
    <div className='MyComponent'>
      // it's up to you to make this an OverlayLoader or InlineLoader, if you so choose.
      {isLoading ? <Loader /> : null}
      // this will render once first loaded and remain rendered with a previous
      // model even while in a loading state. when a new resource request returns,
      // this will render with the updated model and the loader will be removed.
      {hasInitiallyLoaded ? (
        <ul>
          {todosCollection.map((todoModel) => (
            <li key={todoModel.id}>{todoModel.get('name')}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

## isOrWillBeLoading (`useResources` only)

Taking the previous example of [Loading Overlays](#loading-overlays) just a bit further, what if the todosCollection was 5000 entries long? Okay, you'd probably paginate. But that's not the point! Let's say it's an `<ExpensiveComponent />`, and as it is now, when we change loading states, the parent `MyComponent` would render `<ExpensiveComponent />` on every change, which will kill your UX. So let's wrap it in a `React.memo`!

But how do we tell `React.memo` when to not render? This is tricky for a couple of reasons:

* Because `useEffect`/`componentDidUpdate` occurs _after_ render, we actually have two renders we want to opt out of:
    * parent props change
    * render is called (opt out!)
    * resourcerer changes loaded state to loading from the change in props
    * render is called (opt out!). parent shows the overlay loader
    * request returns and loading state changes back to loaded
    * render (we want this update!)

    This is actually the reason why I am sad React did away with `componentWillReceiveProps` and does not offer an equivalent hook&mdash;using that instead would batch the props change and the loaded -> loading state change, and we'd only need to opt out of a single render. *sigh*. I digress.
    
* React.memo, unlike `shouldComponentUpdate`, does not change its `prevProps` if it skips a render. This makes sense if you think about `memo` being a higher-order-component&mdash;if the component doesn't update, its props don't change. But that makes it much harder to compare `prevProps` and `nextProps` when needing to skip two update cycles.

Enter `isOrWillBeLoading`. `isOrWillBeLoading` is a function returned by `useResources`/`withResources` that will take care of all these things for you, and you can invoke it in your `React.memo` [areEqual function](https://reactjs.org/docs/react-api.html#reactmemo). The previous example becomes:

```jsx
import ExpensiveComponent from 'components/expensive_component/expensive_component';
import {memo} from 'react';
import {useResources} from 'resourcerer';

const getResources = ({TODOS}, props) => ({[TODOS]: {}});
const MemoizedExpensiveComponent = memo(ExpensiveComponent, (prevProps, nextProps) => nextProps.isOrWillBeLoading());

export default function UserTodos(props) {
  var {isLoading, isOrWillBeLoading, hasInitiallyLoaded} = useResources(getResources, props);
    
  return (
    <div className='MyComponent'>
      {isLoading ? <Loader /> : null}
      {hasInitiallyLoaded ? <MemoizedExpensiveComponent {...{isOrWillBeLoading}} /> : null}
    </div>
  );
}
```

## Recaching newly-saved models

A common pattern when creating a new instance of a resource is to keep it in state until the user decides to explicitly save it. For example, when setting up a new
TODO, we might fill out a form with its name, all kept in state, at a deep-linkable RESTful url that might be `/todos/new`. After the user saves the TODO, we get a
server-provided `id` property and we might navigate to `/todos/12345`, where `12345` is the new id. This presents an inconvenience: at `/new` we want to read from
state, but at `/{id}` we want to read from the saved model (this is compounded if the UI allows the user to edit in-place).

To accomodate this scenario, `resourcerer` provides a means of re-caching a model instance the first time it receives an id. Thus you can use it with `fetch: false` like
this:

```jsx
import {useResources} from 'resourcerer';

const getResources = ({TODO}, props) => ({
  [TODO]: {
    data: {id: props.id},
    fetch: !!props.id
  }
});

export default function UserTodo(props) {
  var {todoModel} = useResources(getResources, props),
      onChange = (evt) => todoModel.set('name', evt.target.value),
      onSubmit = todoModel.save()
        .then(([model]) => !props.id ? navigate(`/todos/${model.id}`) : null)
        .catch(() => notify('An error occurred');

  return (
    <form onSubmit={onSubmit}>
      <label>
        TODO:
        <input name='name' onChange={onChange} value={todoModel.get('name')} />
      </label>
      <button>Save</button>
    </form>
  );
}
```

What's so nice about this example is that there's no balancing between React state and model state; in either case you read from
the model requested from `resourcerer`. When you load `/todos/new`, nothing is fetched and the model is created first client-side;
when you load `/todos/{todosId}`, the todos resource is first fetched. Both cases, however, are treated identically. And because of
`resourcerer`'s recaching, when you save for the first time and navigate from `/todos/new` to `/todos/{todosId}`, the model is
taken from its 'new' cache key and placed in its 'id' cache key, obviating the need to re-request the resource and moving seamlessly
from one to the other.

***NOTE:*** this is only for models requested individually and not as part of a larger collection. When adding a new model to a collection
that is fetched by `resourcerer`, you can accomplish the above without recaching.
