<img src="https://user-images.githubusercontent.com/1355779/61337603-f9fffd80-a7ea-11e9-9cb3-fa82e044c86e.png" alt="Resourcerer Icon" height="200" width="200" />

# resourcerer

![CircleCI](https://circleci.com/gh/SiftScience/resourcerer/tree/master.svg?style=svg&circle-token=45a34426d0ed2c954ed07b8ce27248aa6f93cb06)

`resourcerer` is a library for declaratively fetching and caching your application's data. Its powerful higher-order React component (HOC) `withResources` (or its [`useResources` hook](#useresources-beta)) allows you to easily construct a component's data flow, including:

* serial requests
* prioritized rendering for critical data (enabling less critical or slower requests to not block interactivity)
* delayed requests
* prefetching
* ...and more

Additional features include:

* first-class loading and error state support
* smart client-side caching
* updating a component when a resource updates
* ...and more

It employs a View-less, jQuery-less fork of Backbone called [Schmackbone](https://github.com/noahgrant/schmackbone) for Model/Collection semantics (as well as its [Events module](https://backbonejs.org/#Events)). Getting started is easy:

1. Define a model in your application:

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
import {ModelMap} from 'resourcerer/config';
import TodosCollection from 'js/models/todos-collection';

// choose any string as its key
ModelMap.add({TODOS: TodosCollection});

// in your top level js file
import 'js/core/resourcerer-config;
```

3. Use `withResources` to request your models in any component:

```jsx
import React from 'react';
import {withResources} from 'resourcerer';

@withResources((props, {TODOS}) => ({[TODOS]: {}}))
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
1. [Tutorial](#tutorial)
    1. [Intro](#tutorial)
    1. [Other Props Passed from the HOC (Loading States)](#other-props-passed-from-the-hoc-loading-states)
    1. [Requesting Prop-driven Data](#requesting-prop-driven-data)
    1. [Changing Props](#changing-props)
    1. [Serial Requests](#serial-requests)
    1. [Other Common Resource Config Options](#other-common-resource-config-options)
        1. [data](#data)
        1. [noncritical](#noncritical)
        1. [listen](#listen)
        1. [measure](#measure)
        1. [status](#status)
        1. [forceFetch](#forcefetch)
        1. [Custom Resource Names](#custom-resource-names)
        1. [options](#options)
        1. [attributes](#attributes)
        1. [prefetches](#prefetches)
    1. [useResources (beta)](#useresources-beta)
    1. [Caching Resources with ModelCache](#caching-resources-with-modelcache)
    1. [Declarative Cache Keys](#declarative-cache-keys)
    1. [Prefetch on Hover](#prefetch-on-hover)
    1. [withLoadingOverlay](#withloadingoverlay)
        1. [usage with useResources](#usage-with-the-useresources-hook)
1. [Configuring resourcerer](#configuring-resourcerer)
1. [FAQs](#faqs)


# Installation

`$ npm i resourcerer`

`resourcerer` depends on React >= 16 and Schmackbone (which itself depends on [Underscore](https://github.com/jashkenas/underscore) and [qs](https://github.com/ljharb/qs)).

The `resourcerer` package is compiled into ESNext, with only its [legacy, Stage-1 decorators](https://github.com/tc39/proposal-decorators/blob/master/previous/METAPROGRAMMING.md),
object spread, and ES2015 module syntax transpiled. If you need to target older browsers, you can incorporate this package into your own build system to transpile further.

Also worth noting is that this package does not do any bundling into a single file, instead letting the user use whatever bundler they like.
Modules have, however, been transpiled into CommonJS `require` syntax.
  
# Tutorial

Okay, back to the initial example. Let's take a look at our `withResources` usage in the component:

```js
// Note: in these docs, you will see a combination of `ResourceKeys` in the executor function as well as
// its more common destructured version, ie `@withResources((props, {TODOS}) => ({[TODOS]: {}}))`
@withResources((props, ResourceKeys) => ({[ResourceKeys.TODOS]: {}}))
class MyComponent extends React.Component {}
```

You see that `withResources` takes an executor function that returns an object. The executor function
takes two arguments: the current props, and an object of `ResourceKeys`. Where does `ResourceKeys` come
from? From the ModelMap in the config file we added to earlier!

```js
// js/core/resourcerer-config.js
import {ModelMap} from 'resourcerer/config';
import TodosCollection from 'js/models/todos-collection';

// after adding this key, resourcerer will add an identical key to the `ResourceKeys` object with a
// camelCased version as its value. `ResourceKeys.TODOS` can then be used in our executor functions to reference
// the Todos resource. The camelCased 'todos' string value will be the default prefix added to all todos-related
// props passed from the HOC to the wrapped component. That's why we have `this.props.todosCollection`!
ModelMap.add({TODOS: TodosCollection});
```

(We can also pass custom prefixes for our prop names in a component, but [we'll get to that later](#custom-resource-names).)  

Back to the executor function. In the example above, you see it returns an object of `{[ResourceKeys.TODOS]: {}}`. In general, the object it should return is of type `{string<ResourceKey>: object<Options>}`, where `Options` is a generic map of config options, and can contain as many keys as resources you would like the component to request. In our initial example, the options object was empty. Further down, we'll go over the plethora of options and how to use them. For now let's take a look at some of the resource-related props this simple configuration provides our component.


## Other Props Passed from the HOC (Loading States)

Of course, in our initial example, the todos collection won’t get passed down immediately since, after all, the resource has to be fetched from API3.  Some of the most **critical** and most common React UI states we utilize are whether a component’s critical resources have loaded entirely, whether any are still loading, or whether any have errored out. This is how we can appropriately cover our bases&mdash;i.e., we can ensure the component shows a loader while the resource is still in route, or if something goes wrong, we can ensure the component will still fail gracefully and not break the layout. To address these concerns, the `withResources` HOC gives you several loading state helper props. From our last example:


- `this.props.todosLoadingState` (can be equal to any of the [LoadingStates constants](https://github.com/SiftScience/resourcerer/blob/master/lib/constants.js), and there will be one for each resource)
- `this.props.hasLoaded` {boolean} - all critical resources have successfully completed and are ready to be used by the component
- `this.props.isLoading` {boolean} - any of the critical resources are still in the process of being fetched
- `this.props.hasErrored` {boolean} - any of the critical resource requests did not complete successfully
  
`isLoading` , `hasLoaded` , and `hasErrored` are not based on individual loading states, but are rather a collective loading state for the aforementioned-critical component resources. In the previous example, the todos resource is the only critical resource, so `isLoading` / `hasLoaded` / `hasErrored` are solely based on `todosLoadingState`. But we can also add a non-critical `users` resource, responsible, say, for only display users' names alongside their TODOs&mdash;a small piece of the overall component and not worth delaying render over. Here’s how we do that:

```js
@withResources((props, {TODOS, USER}) => ({
  [TODOS]: {},
  [USERS]: {noncritical: true}
}))
class MyClassWithTodosAndAUsers extends React.Component {}
```

`MyClassWithDecisionsAndAnalysts` will now receive the following loading-related props, assuming we've assigned the `USERS` key a string value of `'users'` in our config file:

- `this.props.todosLoadingState`
- `this.props.usersLoadingState` 
- `this.props.isLoading`
- `this.props.hasLoaded` 
- `this.props.hasErrored`

In this case, `isLoading` , et al, are only representative of `todosLoadingState` and completely irrespective of `usersLoadingState` . This allow us an incredible amount of flexibility for rendering a component as quickly as possible.

Here’s how might use that to our advantage in `MyClassWithTodosAndAUsers` :

```jsx
// pure functions that accept loading states as arguments
import {hasLoaded} from 'resourcerer/utils';

// ...
    render() {
      var getUserName = (userId) => {
            // usersCollection guaranteed to exist here
            var user = this.props.usersCollection.find(({id}) => id === userId);
            
            return (
              <span className='user-name'>
                {user && user.id || 'N/A'}
              </span>
            );
          };
          
      return (
        <div className='MyClassWithTodosAndUsers'>
          {this.props.isLoading ? <Loader /> : null}
          
          {this.props.hasLoaded ? (
            // at this point we are guaranteed all critical resources exist
            <ul>
              {this.props.todosCollection.map((todoModel) => (
                <li key={todoModel.id}>
                  {hasLoaded(this.props.usersLoadingState) ?
                    getUserName(todoModel.get('userId')) :
                    // if you're anti-loader, you could opt to render nothing and have the
                    // user name simply appear in place after loading
                    <Loader size={Loader.Sizes.SMALL} />}
                  {todoModel.get('name')}
                </li>
              )}
            </ul>
          ) : null}
          
          {this.props.hasErrored ? <ErrorMessage /> : null}
        </div>
      );
    }
```

Here's a real-life example from the Sift Console, where we load a customer's workflows without waiting for the workflow stats resource, which takes much longer. Instead, we gracefully show small loaders where the stats will eventually display, all-the-while keeping our console interactive:

![Noncritical Resource Loading](https://user-images.githubusercontent.com/1355779/57596645-99a9c280-7500-11e9-916d-f60cfd00ee10.png)

And here's what it looks like when the stats endpoint returns:

![Noncritical Resource Returned](https://user-images.githubusercontent.com/1355779/57596646-9a425900-7500-11e9-8121-5ced72c0fcba.png)

There’s one other loading prop passed down from `withResources`: `this.props.hasInitiallyLoaded`. This can be useful for showing a different UI for components that have already fetched the resource. An example might be a component with filters: as the initial resource is fetched, we may want to show a generic loader, but upon changing a filter (and re-fetching the resource), we may want to show a loader with an overlay over the previous version of the component.


## Requesting Prop-driven Data

Let's say we wanted to request not the entire users collection, but just a specific user. Here's our config:

```js
// js/core/resourcerer-config.js
import {ModelMap} from 'resourcerer/config';
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

Our executor function might look like this:

```jsx
@withResources((props, {USER}) => ({
  [USER]: {options: {userId: props.id}}
}))
class MyComponentWithAUser extends React.Component {}
```
 
Assuming we have a `props.id` equal to `'noahgrant'`, this setup will put `MyComponentWithAUser` in a loading state until `/users/noahgrant` has returned.
  
### *...and here's the best part:*
  
Let's say that `props.id` changes to a different user. `MyComponentWithAUser` will get put _back_ into a loading state while the new endpoint is fetched, _without us having to do anything!_ This works because our model has dictated that its models should be cached by a `userId` field, which is passed to it in the [`options` property](#options).

## Changing Props
In general, there are two ways to change `props.id` as in the previous example:

1. Change the url, which is the top-most state-carrying entity of any application. The url can be changed either by path parameter or query paramter, i.e. `example.com/users/noahgrant` -> `example.com/users/fredsadaghiani`, or `example.com/users?id=noahgrant` -> `example.com/users?id=fredsadaghiani`. In this case, each prop change is _indexable_, which is sometimes desirable, sometimes not.

1. Change internal application state. For these cases, `withResources` makes available another handy prop: `this.props.setResourceState`. `setResourceState` is a function that has the same method signature as the `setState` we all know and love. It sets the state of the wrapping component in the HOC, which is then passed down as props, overriding any initial prop, ie `this.props.setResourceState({id: 'fredsadaghiani'})`. This is _not_ indexable.


## Serial Requests

In most situations, all resource requests should be parallelized; but that’s not always possible. Every so often, there may be a situation where one request depends on the result of another. For these cases, we have the `dependsOn` resource option and the `provides` resource option. These are probably best explained by example, so here is a simplified instance from the Sift Console, where we load a queue item that has info about a user, but we can't get further user information until we know what user id belongs to this queue item.

```js
  @withResources((props, {QUEUE_ITEM, USER}) => ({
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

One thing to note here is that while the `QUEUE_ITEM` resource is being fetched, the user resource is in a `PENDING` state, which is a special state that does not contribute to overall component `isLoading`/`hasErrored` states (though it will keep the component from being `hasLoaded`). At this point, the `QueueItemPage` in the example above is in a `LOADING` state (`isLoading === true`) because `QUEUE_ITEM` is loading. When it returns with the user id, the `USER` resource is put into a `LOADING` state, and the component then remains `isLoading === true` until it returns, after which the component has successfully loaded. If the `QUEUE_ITEM` resource happened to error, for some reason, the `USER` resource would never get out of its `PENDING` state, and the component would then take on the `ERROR` state (`hasErrored === true`) of `QUEUE_ITEM`. For more on `PENDING`, see [Thoughts on the PENDING State](/ADVANCED_TOPICS.md#thoughts-on-the-pending-resource) in the [Advanced Topics document](/ADVANCED_TOPICS.md).  

Finally, if a model is to provide more than a single prop, use an underscore instead of the prop name in the `provides` object. Instead of the transform function returning the prop value, it should then return an object of prop keys and values, which will get spread to the component:

```js
  @withResources((props, {QUEUE_ITEM, USER}) => ({
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
  }))
  export default class QueueItemPage extends React.Component {}
    
  function getUserDataFromItem(queueItemModel) {
    // transform function now returns an object of prop names/values instead of a simple prop value
    return {userId: queueItemModel.get('userId'), activeState: queueItemModel.get('state')};
  }
```

## Other Common Resource Config Options

### data

The `data` option is passed directly to the Schmackbone model’s data property and sent either as stringified query params (GET requests) or as a body (POST/PUT). Its properties are also referenced when generating a cache key if they are listed in a model's static `cacheFields` property (See the [cache key section](#declarative-cache-keys) for more). Let's imagine that we have a lot of users and a lot of todos per user. So many that we only want to fetch the todos over a time range selected from a dropdown, sorted by a field also selected by a dropdown. These are query parameters we'd want to pass in our `data` property:

```js
  @withResources((props, ResourceKeys) => {
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

  
### noncritical

As alluded to in the [Other Props](#other-props-passed-from-the-hoc-loading-states) section, not all resources used by the component are needed for rendering. By adding a `noncritical: true` option, we:

- De-prioritize fetching the resource until after all critical resources have been fetched
- Remove the resource from consideration within the component-wide loading states (`props.hasLoaded`, `props.isLoading`, `props.hasErrored`), giving us the ability to render without waiting on those resources
- Can set our own UI logic around displaying noncritical data based on their individual loading states, ie `props.usersLoadingState`, which can be passed to the pure helper methods, `hasLoaded`, `hasErrored`, and `isLoading` from `resourcerer/utils`.
  
  
### listen

Our models are fetched via Schmackbone, and the results are kept in `Schmackbone.Model`/`Schmackbone.Collection` representations as opposed to React state. When we want to update the component after a `sync`, `change`, or `destroy` Schmackbone event, we can simply pass the `listen: true` option, which will `forceUpdate` the component, effectively making our data-state UI-state while keeping one single source-of-truth for our model abstractions.

```js
  @withResources((props, ResourceKeys) => ({[ResourceKeys.TODOS]: {listen: true}}))
  class MyComponentWithTodos extends React.Component {}
```

**Note:**

1. Listening is often unnecessary—if a loading state is changed during request and removed when the request completes (as is the case with `withResources`), then the React component will update in the natural React cycle and can read from the latest resource without needing to trigger the `forceUpdate`.

1. Listening on a collection will also trigger updates when one of the collection's models changes. That's an implentation detail of Backbone. So if we listen on the todos collection above, but make an update in our component with `this.props.todosCollection.at(0).save({name: 'Renamed Todo'})`, our component will still auto-update!


### measure

Passing a `measure: true` config option will record the time it takes for a particular resource to return and pass the data to the [track]() [configuration](#configuring-withresources) method that you can set up, sending it to your own app data aggregator. This allows you to see the effects of your endpoints from a user’s perspective.

```js
  @withResources((props, ResourceKeys) => ({[ResourceKeys.TODOS]: {listen: true, measure: true}}))
  class MyComponentWithTodos extends React.Component {}
```

### status

Passing a `status: true` config option will pass props down to the component reflecting the resource’s status code. For example, if you pass the option to a `TODOS` resource that 404s, the wrapped component will have a prop called `todosStatus` that will be equal to `404`.

```js
  @withResources((props, ResourceKeys) => ({
    [ResourceKeys.TODOS]: {listen: true, measure: true, status: true}
  }))
  class MyComponentWithTodos extends React.Component {}
```

### forceFetch

Sometimes you want the latest of a resource, bypassing whatever model has already been cached in your application. To accomplish this, simply pass a `forceFetch: true` in a resource's config. The force-fetched response will replace any prior model in the cache, but may itself get replaced by a subsequent `forceFetch: true` request for the resource.

```js
  @withResources((props, ResourceKeys) => ({[ResourceKeys.LATEST_STATS]: {forceFetch: true}}))
  class MyComponentWithLatestStats extends React.Component {}
```

### Custom Resource Names

Passing a `modelKey: <ResourceKeys>` option allows you to pass a custom name as the `withResources` key, which will become the base name for component-related props passed down to the component. For example, this configuration:

```js
  @withResources((props, ResourceKeys) => ({myRadTodos: {modelKey: ResourceKeys.TODOS}))
  class MyComponentWithTodos extends React.Component {}
```

would still fetch the todos resource, but the props passed to the `MyComponentWithTodos` instance will be `myRadTodosCollection`, `myRadTodosLoadingState`, and `myRadTodosStatus`, etc. This also allows us to fetch the same resource type multiple times for a single component.


### options 

[As referenced previously](#requesting-prop-driven-data), an `options` hash on a resource config will be passed directly as the second parameter to a model's `constructor` method. It will also be used in cache key generation if it has any fields specified in the model's static `cacheFields` property (See the [cache key section](#declarative-cache-keys) for more). Continuing with our User Todos example, let's add an `options` property:

```js
  @withResources((props, ResourceKeys) => {
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
  })
  class UserTodos extends React.Component {}
```

Here, the UserTodos collection will be instantiated with an options hash including the `userId` property, which it uses to construct its url. We'll also want to add the `'userId'` string to the collection's static `cacheFields` array, because each cached collection should be specific to the user.

### attributes

Pass in an attributes hash to initialize a Model instance with a body before initially fetching. This is passed directly to the model's [`constructor` method](https://backbonejs.org/#Model-constructor) along with the `options` property.

### prefetches

This option is an array of props objects that represent what is _different_ from the props in the original resource. For each array entry, a new resource config will be calculated by passing in a combination of the current props with the new props, and the resulting request is made. In contrast to the original resource, however, no props representing the prefetched requests are passed down to any children (ie, there are no loading state props, no model props, etc). They are simply returned and kept in memory so that whenever they are requested, they are already available.

A great example of this is for pagination. Let's take our previous example and add a `from` property to go with our `limit` that is based on the value of a `page` prop ([tracked either by url parameter or by `setResourceState`](#changing-props)). We want to request the first page but also prefetch the following page because we think the user is likely to click on it:

```js
  @withResources((props, ResourceKeys) => {
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
        // original request will have a `from` value of 0.
        prefetches: [{page: props.page + 1}]
      }
    };
  })
  class UserTodos extends React.Component {}
```

When the user clicks on a 'next' arrow that updates page state, the collection will already be in the cache, and it will get passed as the new `this.props.userTodosCollection`. Accordingly, the third page will then get prefetched (`props.page` equal to 2 and `from` equal to 40). Two important things to note here:

1. Don't forget to add `from` to the [`cacheFields`](#declarative-cache-keys) list!
1. The prefetched model does not get components registered to it; therefore, it is immediately scheduled for removal after the specified [cacheGracePeriod](#configuring). If the user clicks the next arrow, it then becomes the 'active' model and the `UserTodos` component will get registered to it, clearing the removal timer (see the next section).

If you're looking to optimistically prefetch resources when a user hovers, say, over a link, see the [Prefetch on Hover](#prefetch-on-hover) section.

## `useResources` (beta)

So far, all `resourcerer` concepts have been discussed in the context of its `withResources` HOC. But they can also be used with its `useResources` hook inside functional components. All props that you'd expect to be passed down as props from the HOC are returned from the hook:

```jsx
import {useResources} from 'resourcerer';

const getResources = (props, {TODOS}) => ({[TODOS]: {}});

export default function MyComponent(props) {
  var {
    isLoading,
    hasLoaded,
    todosCollection,
    todosLoadingState,
    setResourceState
    // etc...
  } = useResources(getResources, props);

  return (
    <div className='MyComponent'>
      {isLoading ? <Loader /> : null}
          
      {hasLoaded ? (
        <ul>
          {todosCollection.map((todoModel) => (
            <li key={todoModel.id}>{todoModel.get('name')}</li>
          )}
        </ul>
       ) : null}
    </div>
  );
}
```

Note a couple critical differences:

1. The `withResources` HOC conveniently contains an [ErrorBoundary](https://reactjs.org/docs/error-boundaries.html) with every instance, but such functionality [does not yet exist in hooks](https://reactjs.org/docs/hooks-faq.html#do-hooks-cover-all-use-cases-for-classes).

1. The `setResourceState` prop utilizes React's [useState](https://reactjs.org/docs/hooks-reference.html#usestate) hook, which does not auto-merge updates like `setState` does. Be sure to manually merge all resource state!

    ```jsx
    props.setResourceState((existingState) => ({
      ...existingState,
      timeRange: newTimeRange
    }));
    ```

1. The hook does not accept a [`{listen: true}`](#listen) option like the HOC does because it listens to changes on all resources by default. A similar update will be made in the future to `withResources`.

1. Likewise, the hook does not accept a [`{status: true}`](#status) option like the HOC does because it returns all statuses by default.

1. With the executor function now inlined in your component, be extra careful to avoid this anti-pattern:

    ```
    function MyComponent({start_time, ...props}) {
      var {todosCollection} = useResources((_props, {TODOS}) => ({[TODOS]: {data: {start_time}}}), props);
      
      // ...
    ```
    
    The subtle problem with the above is that the `start_time` executor function parameter is relying on a value in the function component closure instead of the generic props object; `props` passed to the executor function can be current or previous but are not the same as what is in the closure, which will always be current. This will lead to confusing bugs, so instead either read directly from the props parameter passed to the executor function:
    
    ```
    function MyComponent(props) {
      var {todosCollection} = useResources(({start_time}, {TODOS}) => ({[TODOS]: {data: {start_time}}}), props);
      
      // ...
    ```
    
     or define your executor function outside of the component scope:
     
     
     ```
     const getResources = ({start_time}, {TODOS}) => ({[TODOS]: {data: {start_time}}});
     
     function MyComponent(props) {
       var {todosCollection} = useResources(getResources, props);
       
       // ...
     ```

## Caching Resources with ModelCache

`resourcerer` handles resource storage and caching, so that when multiple components request the same resource with the same parameters or the same body, they receive the same model in response. If multiple components request a resource still in-flight, only a single request is made, and each component awaits the return of the same resource. Fetched resources are stored by `withResources` in the `ModelCache`. Under most circumstances, you won’t need to interact with directly; but it’s still worth knowing a little bit about what it does.

The `ModelCache` is a simple module that contains a couple of Maps&mdash;one that is the actual cache `{cacheKey<string>: model<Backbone.Model|Backbone.Collection>}`, and one that is a component manifest, keeping track of all component instances that are using a given resource (unique by cache key). When a component unmounts, `resourcerer` will unregister the component instance from the component manifest; if a resource no longer has any component instances attached, it gets scheduled for cache removal. The timeout period for cache removal is two minutes by default, to allow navigating back and forth between pages without requiring a refetch of all resources. After the timeout, if no other new component instances have requested the resource, it’s removed from the `ModelCache`. Any further requests for that resource then go through the network.

Again, it’s unlikely that you’ll use `ModelCache` directly while using `resourcerer`, but it’s helpful to know a bit about what’s going on behind-the-scenes.

## Declarative Cache Keys

As alluded to previously, `resourcerer` relies on the model classes themselves to tell it how it should be cached. This is accomplished via a static `cacheFields` array, where each entry can be either:

1. A string, where each string is the name of a property that the model receives whose value should take part in the cache key. The model can receive this property either from the [options](#options) hash, the [attributes](#attributes) hash, or the [data](#data) hash, in that order.

2. A function, whose return value is an object of keys and values that should both contribute to the cache key.

Let's take a look at the USER_TODOS resource from above, where we want to request some top number of todos for a user sorted by some value over some time range. The resource declaration might look like this:

```js
  @withResources((props, ResourceKeys) => {
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
  })
  class UserTodos extends React.Component {}
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

We can see that `limit` and `sort_field` as specified in `cacheFields` are taken straight from the `data` object that Schmackbone transforms into url query parameters. `userId` is part of the `/users/{userId}/todos` path, so it can't be part of the `data` object, which is why it's stored as an instance property. But `resourcerer` will see its value within the `options` hash that is passed and use it for the cache key.  

The time range is a little tougher to cache, though. We're less interested the spcecific `end_time`/`start_time` values to the millisecond&mdash; it does us little good to cache an endpoint tied to `Date.now()` when it will never be the same for the next request. We're much more interested in the difference between `end_time` and `start_time`. This is a great use-case for a function entry in `cacheFields`, which takes the `data` object passed an argument. In the case above, the returned object will contribute a key called `range` and a value equal to the time range to the cache key.

The generated cache key would be something like `userTodos_limit=50_$range=86400000_sort_field=importance_userId=noah`. Again, note that:

- the `userId` value is taken from the `options` hash
- the `limit` and `sort_field` values are taken from the `data` hash
- the `range` value is taken from a function that takes `start_millis`/`end_millis` from the `data` hash into account.


## Prefetch on Hover

You can use `resourcerer`'s executor function to optimistically prefetch resources when a user hovers over an element. For example, if a user hovers over a link to their TODOS page, you may want to get a head start on fetching their TODOS resource so that perceived loading time goes down or gets eliminated entirely. We can do this with the top-level `prefetch` function:

```jsx
import {prefetch} from 'resourcerer';

// here's our executor function just as we pass to withResources
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

## withLoadingOverlay

`resourcerer` also comes with a helper HOC to apply an overlay with a loader over current content while new data is fetched. It looks like this (shown over one of Sift's Insights Charts):

![loading_overlay](https://user-images.githubusercontent.com/1355779/69263885-10440e80-0b7b-11ea-811d-29aa404b91d2.gif)

Use it like:

```jsx
  import {withLoadingOverlay} from 'resourcerer/utils';
  import {withResources} from 'resourcerer';

  @withResources((props, ResourceKeys) => ({})
  @withLoadingOverlay() // can also pass in {noLoader: true} to have an overlay without a spinner
  class UserTodos extends React.Component {}
```

Now anytime `<UserTodos />` enters a loading state, its previous content will stay in place with a nice overlay on top until the next data returns and the component rerenders!

Note that there is no default spinner, and you must provide it in the [configuration](#configuring-resourcerer) as:

```js
ResourcesConfig.set({Loader: YourLoaderComponent});
```

The Loader instance will get an `overlay: true` prop if it is rendered by `withLoadingOverlay`, which you can use to make any custom styling changes.

### Usage with the `useResources` hook

When using `useResources`, the `withLoadingOverlay` HOC won't work without breaking up your components; however, since models are held as state, a loading overlay helper component is unnecessary to keep older models rendered while requesting new ones. We can simply use `hasInitiallyLoaded`:

```jsx
import {useResources} from 'resourcerer';

const getResources = (props, {TODOS}) => ({[TODOS]: {}});

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

# Configuring `resourcerer`

The same config file used to add to `ResourceKeys` and `ModelMap` also allows you to set custom configuration properties for your own application:

```js
import {ResourcesConfig} from 'resourcerer/config';

ResourcesConfig.set(configObj);
```

`ResourcesConfig.set` accepts an object with any of the following properties:

* `cacheGracePeriod` (number in ms): the length of time a resource will be kept in the cache after being scheduled for removal (see the [caching section](#caching-resources-with-modelcache) for more). Default 120000 (2 minutes).

* `errorBoundaryChild` (JSX/React.Element): the element or component that should be rendered in the ErrorBoundary included in every `withResources` wrapping. By default, a caught error renders this child:

```jsx
<div className='caught-error'>
  <p>An error occurred.</p>
</div>
```

* `Loader` (React.Component): the spinner component that should be rendered when using [withLoadingOverlay](#withloadingoverlay). Default `null`.

* `log` (function): method invoked when an error is caught by the ErrorBoundary. Takes the caught error as an argument. Use this hook to send caught errors to your error monitoring system. Default noop.

* `queryParamsPropName` (string): the name of the prop representing url query parameters that `withResources` will look for and flatten for its children. If your application already flattens query parameters, you can ignore this property. Otherwise, when a url search string of, for example, `?end_time=1558100000000&start_time=1555508000000` is turned into an object prop of `{end_time: 1558100000000, start_time: 1555508000000}`, `withResources`-wrapped components will see `props.end_time` and `props.start_time`, for ease of use in your executor function. Default `'urlParams'`.

* `track` (function): method invoked when [`measure: true`](#measure) is passed in a resource's config. Use this hook to send the measured data to your application analytics tracker. Default noop. The method is invoked with two arguments:

    * the event string, `'API Fetch'`
    * event data object with the following properties:
        * Resource (string): the name of the resource (taken from the entry in `ResourceKeys`)
        * data (object): data object supplied via the resource's config
        * options (object): options object supplied via the resource's config
        * duration (number): time in milliseconds between request and response



# FAQs

* Why?

    Yeah...isn't [GraphQL](https://graphql.org/) the thing to use now? Why bother with a library for REST APIs&mdash;especially one that is based on a _Backbone_ fork. It feels so...._2012_.
    
    GraphQL is awesome, but there are many reasons why you might not want to use it. Maybe you don't have the resources to ensure that all of your data can be accessed performantly; in that case, your single `/graphql` endpoint will only ever be as fast as your slowest data source. Maybe your existing REST API is working well and your eng org isn't going to prioritize any time to move away from it. Etc, etc, etc. `resourcerer` offers a way for your front-end team to quickly get up and running with declarative data fetching, request flows, and model caching.

* Does `resourcerer` support SSR?  
  
    There is no official documentation for its use in server-side rendering at this point. However, because passing models as props directly to a component [bypasses fetching](/TESTING_COMPONENTS.md#testing-components-that-use-withresources), it is likely that `resourcerer` can work nicely with an SSR setup that:  
    
    1. passes instantiated models directly through the app before calling `renderToString`  
    2. provides those models within a top-level `<script>` element that adds them directly to the [ModelCache](#caching-resources-with-modelcache).
        
* ...can this be used as a React Hook?
    
    Yes! See the [useResources](#useresources-beta) section for how to use it and for critical differences between the HOC. Note that `useResources` is currently in beta.

* Does it support async rendering?  
  
    The `withResources` HOC still employs one instance of `UNSAFE_componentWillReceiveProps` to set loading states prior to fetching a new resource. There are a couple of benefits to doing it this way instead of in `componentDidUpdate`:  
    1. It avoids an extra render caused by setting state after an update has happened.
    2. It allows us to read our models directly from the ModelCache and not set them as any sort of de-normalized state.

    The downside is that it prevents `withResources`, for now, from safely using some of React's newer APIs, such as asynchronous rendering with Suspense. Full disclosure: I am sad that `componentWillReceiveProps` has been deprecated, and I would much prefer to keep it and have the React team trust developers not to put side effects in it. But I still think it has an important place in preventing extra renders. [getDerivedStateFromProps](https://reactjs.org/docs/react-component.html#static-getderivedstatefromprops) does not allow you to compare previous to next without doing some state hackery.

    The `useResources` React hook, on the other hand, will support async rendering. It also, however requires that extra render that the HOC avoids, and that its models are set as state.

        
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
    
    export withResources((props, ResourceKeys) => {
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
    
    There is one caveat, though&mdash;function components should not be wrapped in `React.memo` if you intend to listen on a resource via the `listen: true` option.

* Can `resourcerer` do anything other than `GET` requests?

    `resourcerer` only handles resource _fetching_ (i.e. calling [Schmackbone.Model.prototype.fetch](https://backbonejs.org/#Model-fetch)). Note that this is not the same as only making `GET` requests; pass in a `method: 'POST'` property in a resource's config to turn the `data` property into a POST body, for example, when making a search request.
    
    For write operations, use Schmackbone Models' [`save`](https://backbonejs.org/#Model-savehttps://backbonejs.org/#Model-save) and [`destroy`](https://backbonejs.org/#Model-destroy) methods directly:
    
    ```js
    onClickSaveButton() {
      this.setState({isSaving: true});
  
      // any other mounted component in the application listening to this model or its collection
      // will get re-rendered with the updated name as soon as this is called
      this.props.userTodoModel.save({name: 'Giving This Todo A New Name})
          .then(
            () => notify('Todo save succeeded!'),
            () => notify('Todo save failed :/')
          ).then(() => this.setState({isSaving: false})
    }
    ```

* What about other data sources like websockets?  

    `resourcerer` supports request/response-style semantics only. A similar package for declaratively linking message-pushing to React updates would be awesome&mdash;but it is not, at this point, part of this package.

* How can we test components that use `resourcerer`?  
  
    See the [doc on testing components](/TESTING_COMPONENTS.md) for more on that.

* How big is the `resourcerer` package?  

    5kB gzipped (excluding its Schmackbone, Underscore, and qs dependencies, which are an additional 17kB gzipped).

* Semver?  

    Yes. Releases will adhere to [semver](https://semver.org/#semantic-versioning-200) rules.
