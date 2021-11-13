<img src="https://user-images.githubusercontent.com/1355779/61337603-f9fffd80-a7ea-11e9-9cb3-fa82e044c86e.png" alt="Resourcerer Icon" height="200" width="200" />

# resourcerer (now in 1.0-beta!)

`resourcerer` is a library for declaratively fetching and caching your application's data. Its powerful [`useResources`](#useresources) React hook or [`withResources`](#withresources) higher-order React component (HOC) allows you to easily construct a component's data flow, including:

* serial requests
* prioritized rendering for critical data (enabling less critical or slower requests to not block interactivity)
* delayed requests
* prefetching
* ...and more

Additional features include:

* first-class loading and error state support
* smart client-side caching
* refetching
* updating a component when a resource updates
* zero dependencies
* ...and more

Getting started is easy:

1. Define a model in your application (these are classes descending from [Model](/docs/model.md) or [Collection](/docs/collection.md)):

```js
// js/models/todos-collection.js
import {Collection} from 'resourcerer';

export default class TodosCollection extends Collection {
  url() {
    return '/todos';
  }
}
```

2. Create a config file in your application and add your constructor to the ModelMap with a key:

```js
// js/core/resourcerer-config.js
import {ModelMap} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';

// choose any string as its key, which becomes its ResourceKey
ModelMap.add({TODOS: TodosCollection});
```

```js
// in your top level js file
import 'js/core/resourcerer-config';
```

3. Use your preferred abstraction (`useResources` hook or `withResources` HOC) to request your models in any component:

    1. ### useResources
    
        ```jsx
        import React from 'react';
        import {useResources} from 'resourcerer';

        const getResources = ({TODOS}, props) => ({[TODOS]: {}});
        
        function MyComponent(props) {
          var {
            isLoading,
            hasErrored,
            hasLoaded,
            todosCollection
          } = useResources(getResources, props);
          
          // when MyComponent is mounted, the todosCollection is fetched and available
          // as `todosCollection`!
          return (
            <div className='MyComponent'>
              {isLoading ? <Loader /> : null}
        
              {hasErrored ? <ErrorMessage /> : null}
       
              {hasLoaded ? (
                <ul>
                  {todosCollection.toJSON().map(({id, name}) => (
                    <li key={id}>{name}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        }
        ```
    
    1. ### withResources
    
        ```jsx
        import React from 'react';
        import {withResources} from 'resourcerer';

        @withResources(({TODOS}, props) => ({[TODOS]: {}}))
        class MyComponent extends React.Component {
          render() {
            // when MyComponent is mounted, the todosCollection is fetched and available
            // as `this.props.todosCollection`!
            return (
              <div className='MyComponent'>
                {this.props.isLoading ? <Loader /> : null}
        
                {this.props.hasErrored ? <ErrorMessage /> : null}
        
                {this.props.hasLoaded ? (
                  <ul>
                    {this.props.todosCollection.map((todoModel) => (
                      <li key={todoModel.id}>{todoModel.get('name')}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          }
        }
        ```

There's a lot there, so let's unpack that a bit. There's also a lot more that we can do there, so let's also get into that. But first, some logistics:

# Contents  

1. [Installation](#installation)
1. [Nomenclature](#nomenclature)
1. [Tutorial](#tutorial)
    1. [Intro](#tutorial)
    1. [Other Props Returned from the Hook/Passed from the HOC (Loading States)](other-props-returned-from-the-hookpassed-from-the-hoc-loading-states)
    1. [Requesting Prop-driven Data](#requesting-prop-driven-data)
    1. [Changing Props](#changing-props)
    1. [Serial Requests](#serial-requests)
    1. [Other Common Resource Config Options](#other-common-resource-config-options)
        1. [data](#data)
        1. [options](#options)
        1. [attributes](#attributes)
        1. [noncritical](#noncritical)
        1. [forceFetch](#forcefetch)
        1. [Custom Resource Names](#custom-resource-names)
        1. [prefetches](#prefetches)
        1. [status](#status)
    1. [Data mutations](#data-mutations)
    1. [Differences between useResources and withResources](#differences-between-useresources-and-withresources)
    1. [Caching Resources with ModelCache](#caching-resources-with-modelcache)
    1. [Declarative Cache Keys](#declarative-cache-keys)
    1. [Prefetch on Hover](#prefetch-on-hover)
    1. [Refetching](#refetching)
    1. [Tracking Request Times](#tracking-request-times)
1. [Configuring resourcerer](#configuring-resourcerer)
1. [FAQs](#faqs)


# Installation

`$ npm i resourcerer`

`resourcerer` requires on React >= 16 but has no external dependencies.

Note that Resourcerer uses ES2015 in its source and does no transpiling&mdash;including import/export (Local babel configuration is for testing, only).
This means that if you're not babelifying your `node_modules` folder, you'll need to make an exception for this package, ie:

```js
// webpack.config.js or similar
module: {
  rules: [{
    test: /\.jsx?$/,
    exclude: /node_modules\/(?!(resourcerer))/,
    use: {loader: 'babel-loader?cacheDirectory=true'}
  }]
}
```

# Nomenclature

1. **Props**. Going forward in this tutorial, we'll try to describe behavior of both the `useResources` hook and the `withResources` HOC at once; we'll also rotate between the two in examples. Note that if we talking about a passed prop of, for example `isLoading`, that that corresponds to an `isLoading` property returned from the hook and a `this.props.isLoading` prop passed down from the HOC. 
  
1. **ResourceKeys**. These are the keys added to the `ModelMap` in the introduction that link to your model constructors. They are passed to the executor functions and are used to tell the hook or HOC which resources to request.

1. **Executor Function**. The executor function is a function that both the hook and HOC accept that declaratively describes which resources to request and with what config options. It accepts `ResourceKeys` and `props` as arguments and may look like, as we'll explore in an example later:

    ```js
    const getResources = ({USER}, props) => ({[USER]: {options: {userId: props.id}}});
    ```

    or

    ```js
    const getResources = ({USER_TODOS}, props) => {
      const now = Date.now();
      
      return {
        [USER_TODOS]: {
          data: {
            limit: 20,
            end_time: now,
            start_time: now - props.timeRange,
            sort_field: props.sortField
          }
        }
      };
    };
    ```

    It returns an object whose keys represent the resources to fetch and whose values are resource configuration objects that we'll discuss later (and is highlighted below).
    
1. **Resource Configuration Object (resource config)**. In the object returned by our executor function, each entry has a key equal to one of the `ResourceKeys` and whose value we will refer to in this document as a Resource Configuration Object. It holds the declarative instructions that `useResources` and `withResources` will use to request the resource.

# Tutorial

Okay, back to the initial example. Let's take a look at our `useResources` usage in the component:

```js
// Note: in these docs, you will see a combination of `ResourceKeys` in the executor function as well as
// its more common destructured version, ie `@withResources(({TODOS}, props) => ({[TODOS]: {}}))`
const getResources = (ResourceKeys, props) => ({[ResourceKeys.TODOS]: {}});

export default function MyComponent(props) {
  var resources = useResources(getResources, props);
  
  // ...
}
```

You see that `useResources` takes an executor function that returns an object. The executor function
takes two arguments: an object of `ResourceKeys` and the current props. Where does `ResourceKeys` come
from? From the ModelMap in the config file we added to earlier!

```js
// js/core/resourcerer-config.js
import {ModelMap} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';

// after adding this key, resourcerer will add an identical key to the `ResourceKeys` object with a
// camelCased version as its value. `ResourceKeys.TODOS` can then be used in our executor functions to reference
// the Todos resource. The camelCased 'todos' string value will be the default prefix added to all todos-related
// props passed from the HOC to the wrapped component. That's why we have `props.todosCollection`!
ModelMap.add({TODOS: TodosCollection});
```

(We can also pass custom prefixes for our prop names in a component, but [we'll get to that later](#custom-resource-names).)  

Back to the executor function. In the example above, you see it returns an object of `{[ResourceKeys.TODOS]: {}}`. In general, the object it should return is of type `{string<ResourceKey>: object<Options>}`, where `Options` is a generic map of config options, and can contain as many keys as resources you would like the component to request. In our initial example, the options object was empty. Further down, we'll go over the plethora of options and how to use them. For now let's take a look at some of the resource-related props this simple configuration provides our component.


## Other Props Returned from the Hook/Passed from the HOC (Loading States)

Of course, in our initial example, the todos collection won’t get passed down immediately since, after all, the resource has to be fetched from the API.  Some of the most **significant** and most common React UI states we utilize are whether a component’s critical resources have loaded entirely, whether any are still loading, or whether any have errored out. This is how we can appropriately cover our bases&mdash;i.e., we can ensure the component shows a loader while the resource is still in route, or if something goes wrong, we can ensure the component will still fail gracefully and not break the layout. To address these concerns, the `useResources` hook/`withResources` HOC gives you several loading state helper props. From our last example:


- `todosLoadingState` (can be equal to any of the [LoadingStates constants](https://github.com/noahgrant/resourcerer/blob/master/lib/constants.js), and there will be one for each resource)
- `hasLoaded` {boolean} - all critical resources have successfully completed and are ready to be used by the component
- `isLoading` {boolean} - any of the critical resources are still in the process of being fetched
- `hasErrored` {boolean} - any of the critical resource requests did not complete successfully
  
`isLoading` , `hasLoaded` , and `hasErrored` are not based on individual loading states, but are rather a collective loading state for the aforementioned-critical component resources. In the previous example, the todos resource is the only critical resource, so `isLoading` / `hasLoaded` / `hasErrored` are solely based on `todosLoadingState`. But we can also add a non-critical `users` resource, responsible, say, for only display users' names alongside their TODOs&mdash;a small piece of the overall component and not worth delaying render over. Here’s how we do that:

```js
const getResources = ({TODOS, USER}, props) => ({
  [TODOS]: {},
  [USERS]: {noncritical: true}
});

function MyClassWithTodosAndAUsers(props) {
  var resources = useResources(getResources, props);
}
```

`MyClassWithDecisionsAndAnalysts` will now receive the following loading-related props, assuming we've assigned the `USERS` key a string value of `'users'` in our config file:

- `todosLoadingState`
- `usersLoadingState` 
- `isLoading`
- `hasLoaded` 
- `hasErrored`

In this case, `isLoading` , et al, are only representative of `todosLoadingState` and completely irrespective of `usersLoadingState` . This allow us an incredible amount of flexibility for rendering a component as quickly as possible.

Here’s how might use that to our advantage in `MyClassWithTodosAndAUsers` :

```jsx
import {haveAllLoaded} from 'resourcerer';

function MyClassWithTodosAndAUsers(props) {
  var {
    isLoading,
    hasErrored,
    hasLoaded,
    todosCollection,
    usersCollection,
    usersLoadingState
  } = useResources(getResources, props);
  
  var getUserName = (userId) => {
    // usersCollection guaranteed to have returned here
    var user = usersCollection.find(({id}) => id === userId);
            
    return (
      <span className='user-name'>
        {user && user.id || 'N/A'}
      </span>
    );
  };
          
  return (
    <div className='MyClassWithTodosAndUsers'>
      {isLoading ? <Loader /> : null}
          
      {hasLoaded ? (
        // at this point we are guaranteed all critical resources have returned.
        // before that, todosCollection is a Collection instance, just empty
        <ul>
          {todosCollection.map((todoModel) => (
            <li key={todoModel.id}>
              // pure function that accepts loading states as arguments
              {haveAllLoaded(usersLoadingState) ?
                getUserName(todoModel.get('userId')) :
                // if you're anti-loader, you could opt to render nothing and have the
                // user name simply appear in place after loading
                <Loader size={Loader.Sizes.SMALL} />}
              {todoModel.get('name')}
            </li>
          )}
        </ul>
      ) : null}
          
      {hasErrored ? <ErrorMessage /> : null}
    </div>
  );
```

Here's a real-life example from the [Sift](https://sift.com) Console, where we load a customer's workflows without waiting for the workflow stats resource, which takes much longer. Instead, we gracefully show small loaders where the stats will eventually display, all-the-while keeping our console interactive:

![Noncritical Resource Loading](https://user-images.githubusercontent.com/1355779/57596645-99a9c280-7500-11e9-916d-f60cfd00ee10.png)

And here's what it looks like when the stats endpoint returns:

![Noncritical Resource Returned](https://user-images.githubusercontent.com/1355779/57596646-9a425900-7500-11e9-8121-5ced72c0fcba.png)

There’s one other loading prop offered from the hook/HOC: `hasInitiallyLoaded`. This can be useful for showing a different UI for components that have already fetched the resource. An example might be a component with filters: as the initial resource is fetched, we may want to show a generic loader, but upon changing a filter (and re-fetching the resource), we may want to show a loader with an overlay over the previous version of the component. See the [Advanced Topics docs](/docs/advanced_topics.md#loading-overlays) for more.


## Requesting Prop-driven Data

Let's say we wanted to request not the entire users collection, but just a specific user. Here's our config:

```js
// js/core/resourcerer-config.js
import {ModelMap} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';
import UserModel from 'js/models/user-model';

ModelMap.add({
  TODOS: TodosCollection,
  USER: UserModel
});
```

And here's what our model might look like:

```js
// js/models/user-model.js
import {Model} from 'resourcerer';

export default class UserModel extends Model {
  constructor(attributes, options={}) {
    this.userId = options.userId;
  }
  
  url() {
    return `/users/${this.userId}`;
  }
  
  static cacheFields = ['userId']
}
```

The `cacheFields` static property is important here, as we'll see in a second; it is a list of model properties that `resourcerer` will use to generate a cache key for the model. It will look for the `userId` property in the following places, in order:

1. the `options` object it is initialized with
1. the `attributes` object it is initialized with
1. the `data` it gets passed in a fetch

All three of these come from what's returned from our executor function; it might look like this:

```jsx
const getResources = ({USER}, props) => ({[USER]: {options: {userId: props.id}}}) 

// hook
function MyComponent(props) {
  var resources = useResources(getResources, props);
  
  // ...
}

// HOC
@withResources(getResources)
class MyComponentWithAUser extends React.Component {}
```
 
Assuming we have a `props.id` equal to `'noahgrant'`, this setup will put `MyComponentWithAUser` in a loading state until `/users/noahgrant` has returned.
  
### *...and here's the best part:*
  
Let's say that `props.id` changes to a different user. `MyComponentWithAUser` will get put _back_ into a loading state while the new endpoint is fetched, _without us having to do anything!_ This works because our model has dictated that its models should be cached by a `userId` field, which is passed to it in the [`options` property](#options).

## Changing Props
In general, there are two ways to change `props.id` as in the previous example:

1. Change the url, which is the top-most state-carrying entity of any application. The url can be changed either by path parameter or query paramter, i.e. `example.com/users/noahgrant` -> `example.com/users/fredsadaghiani`, or `example.com/users?id=noahgrant` -> `example.com/users?id=fredsadaghiani`. In this case, each prop change is _indexable_, which is sometimes desirable, sometimes not.

1. Change internal application state. For these cases, `useResources`/`withResources` make available another handy prop: `setResourceState`. `setResourceState` is a function that has the same method signature as the `setState` we all know and love. It sets internal hook/HOC state, which is then returned/passed down, respectively, overriding any initial prop, ie `setResourceState({id: 'fredsadaghiani'})`. This is _not_ indexable.

    Note that `setResourceState` is very useful for the `withResources` HOC because it allows you to 'lift' state above the fetching component that otherwise would not be possible. For `useResources`, it is a nice-to-have in some cases, but because you can always define your own `useState` above the `useResources` invocation, you may find that you use it less often. Related, `setResourceState` has some subtle discrepancies between the hook and the HOC; see [Differences between useResources and withResources](#differences-between-useresources-and-withresources) for more.


## Serial Requests

In most situations, all resource requests should be parallelized; but that’s not always possible. Every so often, there may be a situation where one request depends on the result of another. For these cases, we have the `dependsOn` resource option and the `provides` resource option. These are probably best explained by example, so here is a simplified instance from the [Sift](https://sift.com) Console, where we load a queue item that has info about a user, but we can't get further user information until we know what user id belongs to this queue item.

```js
@withResources(({QUEUE_ITEM, USER}, props) => ({
  [USER]: {
    options: {userId: props.userId},
    dependsOn: ['userId']
  },
  [QUEUE_ITEM]: {
    attributes: {id: props.itemId}
    provides: {userId: getUserIdFromItem}
  }
}))
export default class QueueItemPage extends React.Component {}
    
function getUserIdFromItem(queueItemModel) {
  return queueItemModel.get('userId');
}
```

In this simplified example, only `props.itemId` is initially present at the url `items/<itemId>`, and since the UserModel depends on `props.userId` being present, that model won’t initially get fetched. Only the QueueItemModel gets fetched at first; it has the `provides` option, which is a map of `<string: function>`, where the string is the prop that it provides to the HOC wrapper, and the function is a private static ‘transform’ function&mdash;it takes its model as an argument and returns the value for the prop it provides.

So, in this case, `getUserIdFromItem` is the transform function, which takes the `queueItemModel` as an argument and returns the userId that will be assigned to `props.userId` (or, more accurately, will be set as state for the HOC wrapper’s state wrapper as described in the previous section). When the QueueItemModel resource returns, the transform function is invoked; at that point, `props.userId` exists, and the UserModel will be fetched. And we have serially requested our resources!

One thing to note here is that while the `QUEUE_ITEM` resource is being fetched, the user resource is in a `PENDING` state, which is a special state that does not contribute to overall component `isLoading`/`hasErrored` states (though it will keep the component from being `hasLoaded`). At this point, the `QueueItemPage` in the example above is in a `LOADING` state (`isLoading === true`) because `QUEUE_ITEM` is loading. When it returns with the user id, the `USER` resource is put into a `LOADING` state, and the component then remains `isLoading === true` until it returns, after which the component has successfully loaded. If the `QUEUE_ITEM` resource happened to error, for some reason, the `USER` resource would never get out of its `PENDING` state, and the component would then take on the `ERROR` state (`hasErrored === true`) of `QUEUE_ITEM`. For more on `PENDING`, see [Thoughts on the PENDING State](/docs/advanced_topics.md#thoughts-on-the-pending-resource) in the [Advanced Topics document](/docs/advanced_topics.md).  

Finally, if a model is to provide more than a single prop, use an underscore instead of the prop name in the `provides` object. Instead of the transform function returning the prop value, it should then return an object of prop keys and values, which will get spread to the component:

```js
const getResources = ({QUEUE_ITEM, USER}, props) => ({
  [USER]: {
    options: {state: props.activeState, userId: props.userId},
    // userModel depends on multiple props from queueItemModel
    dependsOn: ['activeState', 'userId']
  },
  [QUEUE_ITEM]: {
    attributes: {id: props.itemId}
    // use an underscore here to tell resourcerer to spread the resulting object
    provides: {_: getUserDataFromItem}
  }
});
  
export default function QueueItemPage(props) {
  // activeState and userId are internal state within `useResources` and returned
  var {
    activeState,
    userId,
    userModel,
    queueItemModel
  } = useResources(getResources, props);
}
    
function getUserDataFromItem(queueItemModel) {
  // transform function now returns an object of prop names/values instead of a simple prop value
  return {userId: queueItemModel.get('userId'), activeState: queueItemModel.get('state')};
}
```

## Other Common Resource Config Options

### data

The `data` option is passed directly to the [sync](/docs/model.md#sync) module and sent either as stringified query params (GET requests) or as a body (POST/PUT). Its properties are also referenced when generating a cache key if they are listed in a model's static `cacheFields` property (See the [cache key section](#declarative-cache-keys) for more). Let's imagine that we have a lot of users and a lot of todos per user. So many that we only want to fetch the todos over a time range selected from a dropdown, sorted by a field also selected by a dropdown. These are query parameters we'd want to pass in our `data` property:

```js
  @withResources((ResourceKeys, props) => {
    const now = Date.now();
      
    return {
      [ResourceKeys.USER_TODOS]: {
        data: {
          limit: 20,
          end_time: now,
          start_time: now - props.timeRange,
          sort_field: props.sortField
        }
      }
    };
  })
  class UserTodos extends React.Component {}
```

Now, as the prop fields change, the data sent with the request changes as well (provided we set our `cacheFields` property accordingly):

`https://example.com/users/noahgrant/todos?limit=20&end_time=1494611831024&start_time=1492019831024&sort_field=importance`

### options 

[As referenced previously](#requesting-prop-driven-data), an `options` hash on a resource config will be passed directly as the second parameter to a model's `constructor` method. It will also be used in cache key generation if it has any fields specified in the model's static `cacheFields` property (See the [cache key section](#declarative-cache-keys) for more). Continuing with our User Todos example, let's add an `options` property:

```js
const getResources = (ResourceKeys, props) => {
  const now = Date.now();
      
  return {
    [ResourceKeys.USER_TODOS]: {
      data: {
        limit: 20,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      options: {userId: props.userId}
    }
  };
};
```

Here, the UserTodos collection will be instantiated with an options hash including the `userId` property, which it uses to construct its url. We'll also want to add the `'userId'` string to the collection's [static `cacheFields` array](#requesting-prop-driven-data), because each cached collection should be specific to the user.

### attributes

Pass in an attributes hash to initialize a Model instance with a body before initially fetching. This is passed directly to the [model](/docs/model.md#constructor) or [collection's](/docs/collection.md#constructor) `constructor` method along with the [`options`](#options) property, and is typically less useful than providing the properties directly to the [`data`](#data) property. Like `data` and `options`, the `attributes` object will also be used in cache key generation if it has any fields specified in the model's static `cacheFields` property (See the [cache key section](#declarative-cache-keys) for more).

  
### noncritical

As alluded to in the [Other Props](#other-props-returned-from-the-hookpassed-from-the-hoc-loading-states) section, not all resources used by the component are needed for rendering. By adding a `noncritical: true` option, we:

- De-prioritize fetching the resource until after all critical resources have been fetched
- Remove the resource from consideration within the component-wide loading states (`hasLoaded`, `isLoading`, `hasErrored`), giving us the ability to render without waiting on those resources
- Can set our own UI logic around displaying noncritical data based on their individual loading states, ie `usersLoadingState`, which can be passed to the pure helper methods, `haveAllLoaded`, `haveAnyErrored`, and `areAnyLoading` from `resourcerer`.
  
  

### forceFetch

Sometimes you want the latest of a resource, bypassing whatever model has already been cached in your application. To accomplish this, simply pass a `forceFetch: true` in a resource's config. The force-fetched response will replace any prior model in the cache, but may itself get replaced by a subsequent `forceFetch: true` request for the resource.

```js
  @withResources((ResourceKeys, props) => ({[ResourceKeys.LATEST_STATS]: {forceFetch: true}}))
  class MyComponentWithLatestStats extends React.Component {}
```

### Custom Resource Names

Passing a `modelKey: <ResourceKeys>` option allows you to pass a custom name as the `withResources` key, which will become the base name for component-related props passed down to the component. For example, this configuration:

```js
const getResources = (ResourceKeys, props) => ({myRadTodos: {modelKey: ResourceKeys.TODOS});

export default function MyComponentWithTodos {
  var {
    myRadTodosCollection,
    myRadTodosLoadingState,
    myRadTodosStatus,
    ...rest
  } = useResources(getResources, props);
}
```

would still fetch the todos resource, but the properties returned/props passed to the `MyComponentWithTodos` instance will be `myRadTodosCollection`, `myRadTodosLoadingState`, and `myRadTodosStatus`, etc, as shown. This also allows us to fetch the same resource type multiple times for a single component.

### prefetches

This option is an array of props objects that represent what is _different_ from the props in the original resource. For each array entry, a new resource configuration object will be calculated by merging the current props with the new props, and the resulting request is made. In contrast to the original resource, however, _no props representing the prefetched requests are returned or passed down to any children (ie, there are no loading state props, no model props, etc)_. They are simply returned and kept in memory so that whenever they are requested, they are already available.

A great example of this is for pagination. Let's take our previous example and add a `from` property to go with our `limit` that is based on the value of a `page` prop ([tracked either by url parameter or by `setResourceState`](#changing-props)). We want to request the first page but also prefetch the following page because we think the user is likely to click on it:

```js
const getResources = (ResourceKeys, props) => {
  const now = Date.now();
  const REQUESTS_PER_PAGE = 20;
      
  return {
    [ResourceKeys.USER_TODOS]: {
      data: {
        from: props.page * REQUESTS_PER_PAGE,
        limit: REQUESTS_PER_PAGE,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      options: {userId: props.userId},
      // this entry is how we expect the props to change. in this case, we want props.page to be
      // incremented. the resulting prefetched request will have a `from` value of 20, whereas the
      // original request will have a `from` value of 0. The `userTodosCollection` returned (hook) or
      // passed down as props (HOC) will be the latter.
      prefetches: [{page: props.page + 1}]
    }
  };
};
```

When the user clicks on a 'next' arrow that updates page state, the collection will already be in the cache, and it will get passed as the new `userTodosCollection`. Accordingly, the third page will then get prefetched (`props.page` equal to 2 and `from` equal to 40). Two important things to note here:

1. Don't forget to add `from` to the [`cacheFields`](#declarative-cache-keys) list!
1. The prefetched model does not get components registered to it; therefore, it is immediately scheduled for removal after the specified [cacheGracePeriod](#configuring). If the user clicks the next arrow, it then becomes the 'active' model and the `UserTodos` component will get registered to it, clearing the removal timer (see the [caching](caching-resources-with-modelcache) section).

If you're looking to optimistically prefetch resources when a user hovers, say, over a link, see the [Prefetch on Hover](#prefetch-on-hover) section.

### status
##### *(`withResources` only)*

Passing a `status: true` config option will pass props down to the component reflecting the resource’s status code. For example, if you pass the option to a `TODOS` resource that 404s, the wrapped component will have a prop called `todosStatus` that will be equal to `404`.

```js
@withResources((ResourceKeys, props) => ({
  [ResourceKeys.TODOS]: {measure: true, status: true}
}))
class MyComponentWithTodos extends React.Component {}
```

Note that in the `useResources` hook, which does not pollute any `props` object, statuses are returned by default; you can choose which ones you want to use in your component and ignore the rest.


# Data Mutations

So far we've only discussed fetching data. But `resourcerer` also makes it very easy to make write requests via the [Model](/docs/model.md) and [Collection](/docs/collection.md) instances that are returned. These classes are enriched data structures that hold our API server data as well as several utilities that help manage the server data in our application. There are three main write operations via these classes:

1. [Model#save](/docs/model.md#save)

    Use this to create a new resource object (POST) or update an existing one (PUT). Uses the return value of the [`isNew()`](/docs/model.md#isNew) method to determine which method to use. If updating, pass a `{patch: true}` option to use PATCH instead of PUT, which will also send over only the changed attributes instead of the entire resource.

    ```js
    function MyComponent(props) {
      var {myModel} = useResources(getResources, props),
          onSave = () => myModel.save({foo: 'bar'})
            .then([model]) => // ...)
            .catch(() => alert('request failed'));
        
      return <button onClick={onSave}>Persist model</button>;
    }
    ```

1. [Model#destroy](/docs/model.md#destroy)

    Use this to make a DELETE request at a url with this model's id. Will also remove the model from any collection it is a part of.

    ```js
    myModel.destroy().catch(() => alert('Model could not be destroyed));
    ```

1. [Collection#create](/docs/collection.md#create)

    If working with a collection instead of a model, `.create()` adds a new model to the collection and then persists it to the server (via `model.save()`). This is pretty convenient:

    ```js
    function TodoDetails(props) {
      var {hasLoaded, todosCollection} = useResources(getResources, props),
          todoModel = todosCollection.get(props.id),
      
          onSaveTodo = {
            // set some loading state...
        
            if (!props.id) {
              // create new todo!
              return todosCollection.create(attrs)
                .then(([model]) => // ...)
                .catch(() => alert('create failed'));
                .then(() => // remove loading state);
            }
        
            // update existing
            todoModel.save(attrs).then(([model]) => ...).catch(() => alert('update failed'));
          };
      
       if (hasLoaded && props.id && !todoModel) {
         return <p>Todo not found.</p>;
       }
  
       return (
         // ...
         <button onClick={onSaveTodo}>Save</button>
       );
    }
    ```

Each one of these methods exhibit the following behaviors:

1. They automatically fire off the appropriate request with the right data and at the right url
1. They will cause every component registered to that resource to re-render with the updated data, keeping the application in sync
1. On error, they undo the changes that were done (and their registered components render again).

**Note:**
1. All calls resolve an array, which is a tuple of [model, response]. All reject with just the response.
1. All write calls must have a `.catch` attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.


# Differences between useResources and withResources

The hook and HOC largely operate interchangeably, but do note a couple critical differences:

1. The `withResources` HOC conveniently contains an [ErrorBoundary](https://reactjs.org/docs/error-boundaries.html) with every instance, but such functionality [does not yet exist in hooks](https://reactjs.org/docs/hooks-faq.html#do-hooks-cover-all-use-cases-for-classes). This is a definite advantage for the HOC right now, since, if we're already setting `hasErrored` clauses in our components to prepare for request errors, we can naturally gracefully degrade when an unexpected exception occurs. You'll need to manage this yourself with hooks until the equivalent functionality is released.

1. The hooks's `setResourceState` function utilizes React's [useState](https://reactjs.org/docs/hooks-reference.html#usestate) hook, which does **not auto-merge updates like `setState` does**. Be sure to manually merge all resource state!

    ```jsx
    setResourceState((existingState) => ({
      ...existingState,
      timeRange: newTimeRange
    }));
    ```

1. The hook does not accept a [`{status: true}`](#status) option like the HOC does because it returns all statuses by default.

1. With the executor function now inlined in your component, be extra careful to avoid this anti-pattern:

    ```js
    function MyComponent({start_time, ...props}) {
      var {todosCollection} = useResources(({TODOS}, _props) => ({[TODOS]: {data: {start_time}}}), props);
      
      // ...
    ```
    
    The subtle problem with the above is that the `start_time` executor function parameter is relying on a value in the function component closure instead of the `_props` parameter object; props passed to the executor function can be current or previous but are not the same as what is in the closure, which will always be current. This will lead to confusing bugs, so instead either read directly from the props parameter passed to the executor function:
    
    ```js
    function MyComponent(props) {
      var {todosCollection} = useResources(({TODOS}, {start_time}) => ({[TODOS]: {data: {start_time}}}), props);
      
      // ...
    ```
    
     or define your executor function outside of the component scope, as we've done throughout this tutorial (now you know why!):
     
     ```js
     const getResources = ({TODOS}, {start_time}) => ({[TODOS]: {data: {start_time}}});
     
     function MyComponent(props) {
       var {todosCollection} = useResources(getResources, props);
       
       // ...
     ```

## Caching Resources with ModelCache

`resourcerer` handles resource storage and caching, so that when multiple components request the same resource with the same parameters or the same body, they receive the same model in response. If multiple components request a resource still in-flight, only a single request is made, and each component awaits the return of the same resource. Fetched resources are stored in the `ModelCache`. Under most circumstances, you won’t need to interact with directly; but it’s still worth knowing a little bit about what it does.

The `ModelCache` is a simple module that contains a couple of Maps&mdash;one that is the actual cache `{cacheKey<string>: model<Model|Collection>}`, and one that is a component manifest, keeping track of all component instances that are using a given resource (unique by cache key). When a component unmounts, `resourcerer` will unregister the component instance from the component manifest; if a resource no longer has any component instances attached, it gets scheduled for cache removal. The timeout period for cache removal is two minutes by default (but can be changed, see [Configuring resourcerer](#configuring-resourcerer)), to allow navigating back and forth between pages without requiring a refetch of all resources. After the timeout, if no other new component instances have requested the resource, it’s removed from the `ModelCache`. Any further requests for that resource then go back through the network.

Again, it’s unlikely that you’ll use `ModelCache` directly while using `resourcerer`, but it’s helpful to know a bit about what’s going on behind-the-scenes.

## Declarative Cache Keys

As alluded to previously, `resourcerer` relies on the model classes themselves to tell it how it should be cached. This is accomplished via a static `cacheFields` array, where each entry can be either:

1. A string, where each string is the name of a property that the model receives whose value should take part in the cache key. The model can receive this property either from the [options](#options) hash, the [attributes](#attributes) hash, or the [data](#data) hash, in that order.

2. A function, whose return value is an object of keys and values that should both contribute to the cache key.

Let's take a look at the USER_TODOS resource from above, where we want to request some top number of todos for a user sorted by some value over some time range. The resource declaration might look like this:

```js
const getResources = (ResourceKeys, props) => {
  const now = Date.now();
      
  return {
    [ResourceKeys.USER_TODOS]: {
      data: {
        limit: props.limit,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      options: {userId: props.userId}
    }
  };
};
```

And our corresponding model definition might look like this:

```js
export class UserTodosCollection extends Collection {
  constructor(models, options={}) {
    this.userId = options.userId;
  }
  
  url() {
    return `/users/${this.userId}/todos`;
  }
  // ...
  
  static cacheFields = [
    'limit',
    'userId',
    'sort_field',
     ({end_millis, start_millis}) => ({range: end_millis - start_millis})
  ]
};
```

We can see that `limit` and `sort_field` as specified in `cacheFields` are taken straight from the `data` object that `resourcerer` transforms into url query parameters. `userId` is part of the `/users/{userId}/todos` path, so it can't be part of the `data` object, which is why it's stored as an instance property. But `resourcerer` will see its value within the `options` hash that is passed and use it for the cache key.  

The time range is a little tougher to cache, though. We're less interested the spcecific `end_time`/`start_time` values to the millisecond&mdash; it does us little good to cache an endpoint tied to `Date.now()` when it will never be the same for the next request. We're much more interested in the difference between `end_time` and `start_time`. This is a great use-case for a function entry in `cacheFields`, which takes the `data` object passed an argument. In the case above, the returned object will contribute a key called `range` and a value equal to the time range to the cache key.

The generated cache key would be something like `userTodos_limit=50_$range=86400000_sort_field=importance_userId=noah`. Again, note that:

- the `userId` value is taken from the `options` hash
- the `limit` and `sort_field` values are taken from the `data` hash
- the `range` value is taken from a function that takes `start_millis`/`end_millis` from the `data` hash into account.


## Prefetch on Hover

You can use `resourcerer`'s executor function to optimistically prefetch resources when a user hovers over an element. For example, if a user hovers over a link to their TODOS page, you may want to get a head start on fetching their TODOS resource so that perceived loading time goes down or gets eliminated entirely. We can do this with the top-level `prefetch` function:

```jsx
import {prefetch} from 'resourcerer';

// here's our executor function just as we pass to useResources or withResources
const getTodos = (props, ResourceKeys) => {
  const now = Date.now();
      
  return {
    [ResourceKeys.USER_TODOS]: {
      data: {
        limit: props.limit,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      options: {userId: props.userId}
    }
  };
};

// in your component, call the prefetch method with the executor and an object that matches
// what you expect the props to look like when the resources are requested without prefetch.
// attach the result to an `onMouseEnter` prop
<a href='/todos' onMouseEnter={prefetch(getTodos, expectedProps)}>TODOS</a>
```

Note, as mentioned in the comment above, that `expectedProps` should take the form of props expected when the resource is actually needed. For example, maybe we're viewing a list of users, and so there is no `props.userId` in the component that uses `prefetch`. But for the user in the list with id `'noahgrant'`, we would pass it an `expectedProps` that includes `{userId: 'noahgrant'}` because we know that when we click on the link and navigate to that url, `props.userId` should be equal to `'noahgrant'`.

## Refetching

`resourcerer` also returns a `refetch` function that you can use to re-request a resource _that has already been requested_ on-demand. A couple examples of where this could come in handy:

1. A request timed out and you want to give the user the option of retrying.
2. You have made a change to one resource that may render an auxiliary resource stale, and you want to bring the auxiliary resource up-to-date.

It takes a function that is passed `ResourceKeys` and should return a list of `ResourceKeys`. Each entry will get refetched.

```js
function MyComponent(props) {
  var {todosCollection, refetch} = useResources(({TODOS}, {start_time}) => ({[TODOS]: {data: {start_time}}}), props);
      
  // ...
  
  return <Button onClick={() => refetch(({TODOS}) => [TODOS])}>Refetch me</Button>;
```

**NOTE:**
* The list returned by the function should only include keys that are currently returned by the executor function. In the example above, returning `USER_TODOS` would not fetch anything because it is not part of the current executor function. To conditionally fetch another resource, add it to the executor function with [dependsOn](#serial-requests).
* The resource that will be refetched is the version returned by the executor function with the current props. To fetch a different version, use the standard props flow instead of refetching.

## Tracking Request Times

If you have a metrics aggregator and want to track API request times, you can do this by setting a `measure` static property on your model or collection. `measure` can either be a boolean or a function that returns a boolean. The function takes the resource config object as a parameter:

```js
import {Model} from 'resourcerer';

class MyMeasuredModel extends Model {
  // either a boolean, which will track every request of this model instance
  static measure = true

  // or a function that returns a boolean, which will track instance requests based on a condition
  static measure = ({attributes={}}) => attributes.id === 'noahgrant'
}
```

When the static `measure` property is/returns true, `resourcerer` will record the time it takes for that resource to return and pass the data to the [track configuration](#configuring-resourcerer) method that you can set up, sending it to your own app data aggregator. This allows you to see the effects of your endpoints from a user’s perspective.

# Configuring `resourcerer`

The same config file used to add to `ResourceKeys` and `ModelMap` also allows you to set custom configuration properties for your own application:

```js
import {ResourcesConfig} from 'resourcerer';

ResourcesConfig.set(configObj);
```

`ResourcesConfig.set` accepts an object with any of the following properties:

* `cacheGracePeriod` (number in ms): the length of time a resource will be kept in the cache after being scheduled for removal (see the [caching section](#caching-resources-with-modelcache) for more). **Default:** 120000 (2 minutes).

* `errorBoundaryChild` (JSX/React.Element): the element or component that should be rendered in the ErrorBoundary included in every `withResources` wrapping. By default, a caught error renders this child:

    ```jsx
    <div className='caught-error'>
      <p>An error occurred.</p>
    </div>
    ```

* `log` (function): method invoked when an error is caught by the ErrorBoundary. Takes the caught error as an argument. Use this hook to send caught errors to your error monitoring system. **Default:** noop.

* `prefilter` (function): this function takes in the options object passed to the request and should return any new options you want to add. this is a great place to add custom request headers (like auth headers) or do custom error response handling. For example:

    ```js
    prefilter: (options) => ({
      error: (response) => {
        if (response.status === 401) {
          // refresh auth token logic
        } else if (response.status === 429) {
          // do some rate-limiting retry logic
        }

        // catch callbacks still get called after this, so always default to rejecting
        return Promise.reject(response);
      },
      headers: {
        ...options.headers,
        Authorization: `Bearer ${localStorage.getItem('super-secret-auth-token')}`
      }
    })
    ```

    **Default:** the identity function.

* `stringify` (function): Use this to pass in a custom or more powerful way to stringify your GET parameters. The default is to use [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams), but that won't url-encode nested objects or arrays. Override this method if you need support for that, ie:

    ```js
    import {stringify} from 'qs';

    ResourcesConfig.set({
      stringify(data, options) {
        // data is the data object to be stringified into query parameters
        // options is the request options object
        return stringify(data);
      }
    });
    ```

* `queryParamsPropName` (string): the name of the prop representing url query parameters that `withResources` will look for and flatten for its children. If your application already flattens query parameters, you can ignore this property. Otherwise, when a url search string of, for example, `?end_time=1558100000000&start_time=1555508000000` is turned into an object prop of `{end_time: 1558100000000, start_time: 1555508000000}`, `withResources`-wrapped components will see `props.end_time` and `props.start_time`, and `useResources` will return `end_time` and `start_time` for ease of use in your executor function. **Default:** `'urlParams'`.

* `track` (function): method invoked when [`measure: true`](#measure) is passed in a resource's config. Use this hook to send the measured data to your application analytics tracker. **Default:** noop. The method is invoked with two arguments:

    * the event string, `'API Fetch'`
    * event data object with the following properties:
        * Resource (string): the name of the resource (taken from the entry in `ResourceKeys`)
        * data (object): data object supplied via the resource's config
        * options (object): options object supplied via the resource's config
        * duration (number): time in milliseconds between request and response



# FAQs

* Why?

    Yeah...isn't [GraphQL](https://graphql.org/) the thing to use now? Why bother with a library for REST APIs?
    
    GraphQL is awesome, but there are many reasons why you might not want to use it. Maybe you don't have the resources to ensure that all of your data can be accessed performantly; in that case, your single `/graphql` endpoint will only ever be as fast as your slowest data source. Maybe your existing REST API is working well and your eng org isn't going to prioritize any time to move away from it. Etc, etc, etc. `resourcerer` offers a way for your front-end team to quickly get up and running with declarative data fetching, request flows, and model caching.

* How is this different from React Query?

  React Query is an awesome popular library that shares some of the same features as resourcerer. But because `resourcerer` is _explicitly_ for REST APIs and React Query is backend agnostic, we get to abstract out even more. For example, in React Query, you'll need to imperatively fetch your resource in each component:

  ```js
  // React Query, assuming a made-up category dependency
  // component 1
  function MyComponent({category, ...props}) {
    // define your fetch key and imperatively fetch your resource
    const {data} = useQuery(['somekey', {category}], () => {
      return fetch('/todos', (res) => res.json())
    }
  }

  // component 2
  function MySecondComponent({category, ...props}) {
    // same thing. you'll probably want to abstract these out so that changing it one place changes it everywhere
    const {data} = useQuery(['somekey', {category}], () => {
      return fetch('/todos', (res) => res.json())
    }
  }
  ```

  With resourcerer, this abstraction is done once in a model--both defining its url as well as how its properties should affect its cache key:

  ```js
  // resourcerer, with the same category dependency. dependencies are resource-specific,
  // not component-specific, so they should be defined on the model instead of the component
  // todos-collection.js
  export default class TodosCollection extends Collection {
    static cacheFields = ['category']

    url() {
      return '/todos';
    }
  }


  // component1
  function MyComponent({category, ...props}) {
    var {todosCollection} = useResources(({TODOS}) => ({[TODOS]: {options: {category}}));
  }

  // component2--identical to the first
  function MyComponent({category, ...props}) {
    var {todosCollection} = useResources(({TODOS}) => ({[TODOS]: {options: {category}}));
  }
  ```

  The other big difference you might note is the data object in the hook's response. With React Query, you get exactly the JSON returned by the server. With resourcerer, you get [Model](/docs/model.md) or [Collection](/docs/collection.md) instances, which are enriched data representations from which you can also perform write operations that will propagate throughout all other subscribed components&mdash;regardless of their location in your application. Need to update a model? Call [`model.set()`](/docs/model.md#set)&mdash;any other component that uses that model (or its collection) will automatically update. Need to persist to the server? Call [`model.save()`](/docs/model.md#save) or [`collection.add()`](/docs/collection.md#add). Need to remove the model? [`model.destroy()`](/docs/model.md#destroy). Ez-pz.
  
  
  Also note that the `todosCollection` in both components 1 and 2 in the last example are the same objects.


* Does `resourcerer` support SSR?  
  
    There is no official documentation for its use in server-side rendering at this point. However, because passing models as props directly to a component [bypasses fetching](/docs/testing_components.md#testing-components-that-use-resourcerer), it is likely that `resourcerer` can work nicely with an SSR setup that:  
    
    1. passes instantiated models directly through the app before calling `renderToString`  
    2. provides those models within a top-level `<script>` element that adds them directly to the [ModelCache](#caching-resources-with-modelcache).

        
* Can the `withResources` HOC be used with both function components and class components?

    Yes! The docs don't show it, but this is totally valid:
    
    ```jsx
    const UserTodos = (props) => (
      <div className='MyClassWithTodosAndUsers'>
        {props.isLoading ? <Loader /> : null}
          
        {props.hasLoaded ? (
          <ul>
            {props.userTodosCollection.map((todoModel) => (
              <li key={todoModel.id}>
                {todoModel.get('name')}
              </li>
            )}
          </ul>
        ) : null}
          
        {props.hasErrored ? <ErrorMessage /> : null}
      </div>
    );
    
    export withResources((ResourceKeys, props) => {
      const now = Date.now();
      
      return {
        [ResourceKeys.USER_TODOS]: {
          data: {
            limit: 20,
            end_time: now,
            start_time: now - props.timeRange,
            sort_field: props.sortField
          },
          options: {userId: props.userId}
        }
      };
    })(UserTodos)
    ```
    
    There is one caveat, though&mdash;function components should not be wrapped in `React.memo` or they won't be updated when the resource updates.

* Can `resourcerer` do anything other than `GET` requests?

    `resourcerer` only handles resource _fetching_ (i.e. calling [Model.prototype.fetch](/docs/model.md#fetch)). Note that this is not the same as only making `GET` requests; pass in a `method: 'POST'` property in a resource's config to turn the `data` property into a POST body, for example, when making a search request.
    
    For write operations, use Models' [`save`](/docs/model.md#save) and [`destroy`](/docs/model.md#destroy) methods directly:
    
    ```js
    onClickSaveButton() {
      this.setState({isSaving: true});
  
      // any other mounted component in the application that uses this resource
      // will get re-rendered with the updated name as soon as this is called
      this.props.userTodoModel.save({name: 'Giving This Todo A New Name'})
          .then(() => notify('Todo save succeeded!'))
          .catch(() => notify('Todo save failed :/'))
          .then(() => this.setState({isSaving: false}));
    }
    ```

* What about other data sources like websockets?  

    `resourcerer` supports request/response-style semantics only. A similar package for declaratively linking message-pushing to React updates would be awesome&mdash;but it is not, at this point, part of this package.

* How can we test components that use `resourcerer`?  
  
    See the [doc on testing components](/docs/testing_components.md) for more on that.

* How big is the `resourcerer` package?  

    13kB gzipped. It has no dependencies.

* Semver?  

    Yes. Releases will adhere to [semver](https://semver.org/#semantic-versioning-200) rules.
