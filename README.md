# with-resources

![CircleCI](https://circleci.com/gh/SiftScience/with-resources/tree/master.svg?style=svg&circle-token=45a34426d0ed2c954ed07b8ce27248aa6f93cb06)

`with-resources` is a very powerful higher-order React component (HOC) for declaratively fetching and caching your application's data. It allows you to easily construct a component's data flow, including:

* serial requests
* prioritized rendering for critical data (enabling less critical or slower requests to not block interactivity)
* delayed requests
* ...and more

Additional features include:

* first-class loading and error state support
* smart client-side caching
* updating a component when a resource updates
* ...and more

It employs a View-less, jQuery-less fork of Backbone called [Schmackbone](https://github.com/noahgrant/schmackbone) for Model/Collection semantics (as well as its [Events module](https://backbonejs.org/#Events)). Getting started is easy:

1. Define a Schmackbone model in your application:

```js
// js/models/todos-collection.js
import Schmackbone from 'schmackbone';

export default Schmackbone.Collection.extend({url: () => '/todos'});
```

2. Create a config file in your application, add a key for your model, and link it to your model constructor:

```js
// js/core/with-resources-config.js
import {addModels, addResourceKeys} from 'with-resources/config';
import TodosCollection from 'js/models/todos-collection';

addResourceKeys({TODOS: 'todos'});
addModels((ResourceKeys) => ({[ResourceKeys.TODOS]: TodosCollection});
```

3. Use `withResources` to request your models in any component:

```jsx
import React from 'react';
import withResources from 'with-resources';

@withResources((props, ResourceKeys) => ({[ResourceKeys.TODOS]: {}}))
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


# Installation

`$ npm i with-resources`

`with-resources` depends on React >= 16 and Schmackbone (which itself depends on [Underscore](https://github.com/jashkenas/underscore) and [qs](https://github.com/ljharb/qs)).

The `with-resources` package is written in ESNext and will rely on users' build systems to transpile into appropriate JavaScript.
**This package does employ [legacy, Stage-1 decorators](https://github.com/tc39/proposal-decorators/blob/master/previous/METAPROGRAMMING.md),
and you may need to update your [babel config](https://babeljs.io/docs/en/babel-plugin-proposal-decorators#legacy) appropriately in order to successfully transpile it.**

Similarly, you may also need to add this to your webpack config to get Schmackbone to play nicely with `import` statements:

```js
// webpack.config.js
module: {
  rules: [{
    // ...
  }, {
    test: /schmackbone.js$/,
    use: 'imports-loader?define=>false'
  }]
}
```
  
  
# Tutorial

Okay, back to the initial example. Let's take a look at our `withResources` usage in the component:

```js
@withResources((props, ResourceKeys) => ({[ResourceKeys.TODOS]: {}}))
class MyComponent extends React.Component {}
```

You see that `withResources` takes an executor function that returns an object. The executor function
takes two arguments: the current props, and an object of `ResourceKeys`. Where does `ResourceKeys` come
from? From the config file we added to earlier!

```js
// js/core/with-resources-config.js
import {addModels, addResourceKeys} from 'with-resources/config';
import TodosCollection from 'js/models/todos-collection';

// after adding this key, `ResourceKeys.TODOS` will be used in our executor functions to reference
// the Todos resource. The 'todos' string value will be the default prefix added to all todos-related
// props passed from the HOC to the wrapped component. That's why we have `this.props.todosCollection`!
// if the key we added was instead, {TODOS: 'foo'}, the collection would get passed down as 
// `this.props.fooCollection`.
addResourceKeys({TODOS: 'todos'});

// use the previously-added keys to reference the model constructor. this is how withResources knows
// what model type to map the key to. since this takes a function with ResourceKeys as an argument, make
// sure to use addResourceKeys first!
addModels((ResourceKeys) => ({[ResourceKeys.TODOS]: TodosCollection});
```

Back to the executor function. In the example above, you see it returns an object of `{[ResourceKeys.TODOS]: {}}`. In general, the object it should return is of type `{string<ResourceKey>: object<Options>}`, where `Options` is a generic map of config options, and can contain as many keys as resources you would like the component to request. In our initial example, the options object was empty. Further down, we'll go over the plethora of options and how to use them. For now let's take a look at some of the resource-related props this simple configuration provides our component.


## Other Props Passed from the HOC (Loading States)

Of course, in our initial example, the todos collection won’t get passed down immediately since, after all, the resource has to be fetched from API3.  Some of the most **critical** and most common React UI states we utilize are whether a component’s critical resources have loaded entirely, whether any are still loading, or whether any have errored out. This is how we can appropriately cover our bases&mdash;i.e., we can ensure the component shows a loader while the resource is still in route, or if something goes wrong, we can ensure the component will still fail gracefully and not break the layout. To address these concerns, `withResources` gives you several loading state helper props. From our last example:


- `this.props.todosLoadingState` (can be equal to any of the [LoadingStates constants](https://github.com/SiftScience/with-resources/blob/master/lib/constants.js), and there will be one for each resource)
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
import {_hasLoaded} from 'with-resources/utils';

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
                  {_hasLoaded(this.props.usersLoadingState) ?
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
// js/core/with-resources-config.js
import {addModels, addResourceKeys} from 'with-resources/config';
import TodosCollection from 'js/models/todos-collection';
import UserModel from 'js/models/user-model';

addResourceKeys({TODOS: 'todos', USER: 'user'});
addModels((ResourceKeys) => ({
  [ResourceKeys.TODOS]: TodosCollection,
  [ResourceKeys.USER]: UserModel
});
```

And here's what our model might look like:

```js
// js/models/user-model.js
export default Schmackbone.Model.extend({
  initialize(attributes, options={}) {
    this.userId = options.userId;
  },
  
  url() {
    return `/users/${this.userId}`;
  }
}, {cacheFields: ['userId']});
```

The `cacheFields` static property is important here, as we'll see in a second; it is a list of model properties that `withResources` will use to generate a cache key for the model. It will look for the `userId` property in the following places, in order:

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
- Can set our own UI logic around displaying noncritical data based on their individual loading states, ie `props.usersLoadingState`, which can be passed to the pure helper methods, `_hasLoaded`, `_hasErrored`, and `_isLoading` from `with-resources/utils`.
  
  
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

[As referenced previously](#requesting-prop-driven-data), an `options` hash on a resource config will be passed directly as the second parameter to a model's `initialize` method. It will also be used in cache key generation if it has any fields specified in the model's static `cacheFields` property (See the [cache key section](#declarative-cache-keys) for more). Continuing with our User Todos example, let's add an `options` property:

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

Pass in an attributes hash to initialize a Schmackbone.Model instance with a body before initially fetching. This is passed directly to the model's [`initialize` method](https://backbonejs.org/#Model-constructor) along with the `options` property.

## Caching Resources with ModelCache

`withResources` handles resource storage and caching, so that when multiple components request the same resource with the same parameters or the same body, they receive the same model in response. If multiple components request a resource still in-flight, only a single request is made, and each component awaits the return of the same resource. Fetched resources are stored by `withResources` in the `ModelCache`. Under most circumstances, you won’t need to interact with directly; but it’s still worth knowing a little bit about what it does.

The `ModelCache` is a simple module that contains a couple of Maps&mdash;one that is the actual cache `{cacheKey<string>: model<Backbone.Model|Backbone.Collection>}`, and one that is a component manifest, keeping track of all component instances that are using a given resource (unique by cache key). When a component unmounts, `withResources` will unregister the component instance from the component manifest; if a resource no longer has any component instances attached, it gets scheduled for cache removal. The timeout period for cache removal is two minutes by default, to allow navigating back and forth between pages without requiring a refetch of all resources. After the timeout, if no other new component instances have requested the resource, it’s removed from the `ModelCache`. Any further requests for that resource then go through the network.

Again, it’s unlikely that you’ll use `ModelCache` directly while using `withResources`, but it’s helpful to know a bit about what’s going on behind-the-scenes.

## Declarative Cache Keys

As alluded to previously, `withResources` relies on the model classes themselves to tell it how it should be cached. This is accomplished via a static `cacheFields` array, where each entry can be either:

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
export const UserTodosCollection = Schmackbone.Collection.extend({
  initialize(models, options={}) {
    this.userId = options.userId;
  },
  
  url() {
    return `/users/${this.userId}/todos`;
  }
  // ...
}, {
  cacheFields: [
    'limit',
    'userId',
    'sort_field',
     ({end_millis, start_millis}) => ({range: end_millis - start_millis})
  ]
});
```

We can see that `limit` and `sort_field` as specified in `cacheFields` are taken straight from the `data` object that Schmackbone transforms into url query parameters. `userId` is part of the `/users/{userId}/todos` path, so it can't be part of the `data` object, which is why it's stored as an instance property. But `withResources` will see its value within the `options` hash that is passed and use it for the cache key.  

The time range is a little tougher to cache, though. We're less interested the spcecific `end_time`/`start_time` values to the millisecond&mdash; it does us little good to cache an endpoint tied to `Date.now()` when it will never be the same for the next request. We're much more interested in the difference between `end_time` and `start_time`. This is a great use-case for a function entry in `cacheFields`, which takes the `data` object passed an argument. In the case above, the returned object will contribute a key called `range` and a value equal to the time range to the cache key.

The generated cache key would be something like `userTodos_limit=50_$range=86400000_sort_field=importance_userId=noah`. Again, note that:

- the `userId` value is taken from the `options` hash
- the `limit` and `sort_field` values are taken from the `data` hash
- the `range` value is taken from a function that takes `start_millis`/`end_millis` from the `data` hash into account.


## Testing Components that Use `withResources`

# Configuring `withResources`



# FAQs

* Does `with-resources` support SSR?

* Does it support concurrent React?

* What about other data sources like websockets?

* How big is the `with-resources` package?
