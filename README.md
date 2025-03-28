<img src="https://user-images.githubusercontent.com/1355779/61337603-f9fffd80-a7ea-11e9-9cb3-fa82e044c86e.png" alt="Resourcerer Icon" height="200" width="200" />

# resourcerer

`resourcerer` is a library for declaratively fetching and caching your application's data. Its powerful [`useResources`](#useresources) React hook or [`withResources`](#withresources) higher-order React component (HOC) allows you to easily construct a component's data flow, including:

* serial requests
* prioritized rendering for critical data (enabling less critical or slower requests to not block interactivity)
* delayed requests
* prefetching
* ...and more

Additional features include:

* fully declarative (no more writing any imperative Fetch API calls)
* first-class loading and error state support
* smart client-side caching
* lazy fetching
* refetching
* forced cache invalidation
* updating a component when a resource updates
* zero dependencies
* < 6kB!

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
import {register} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';

// choose any string as its key, which becomes its ResourceKey
register({todos: TodosCollection});
```

```js
// in your top level js file
import 'js/core/resourcerer-config';
```

3. Use your preferred abstraction (`useResources` hook or `withResources` HOC) to request your models in any component:

    1. ### useResources
    
        ```jsx
        import {useResources} from 'resourcerer';

        // tell resourcerer which resource you want to fetch in your component
        const getResources = (props) => ({todos: {}});
        
        function MyComponent(props) {
          const {
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

        // tell resourcerer which resource you want to fetch in your component
        @withResources((props) => ({todos: {}}))
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
    1. [Other Props Returned from the Hook/Passed from the HOC (Loading States)](#other-props-returned-from-the-hookpassed-from-the-hoc-loading-states)
    1. [Requesting Prop-driven Data](#requesting-prop-driven-data)
    1. [Changing Props](#changing-props)
    1. [Common Resource Config Options](#common-resource-config-options)
        1. [params](#params)
        1. [options](#options)
        1. [noncritical](#noncritical)
        1. [force](#force)
        1. [Custom Resource Names](#custom-resource-names)
        1. [prefetches](#prefetches)
        1. [data](#data)
        1. [lazy](#lazy)
        1. [minDuration](#minduration) 
        1. [dependsOn](#dependson)
        1. [provides](#provides)
    1. [Data mutations](#data-mutations)
    1. [Serial Requests](#serial-requests)
    3. [Differences between useResources and withResources](#differences-between-useresources-and-withresources)
    4. [Using resourcerer with TypeScript](docs/typescript.md)
    4. [Caching Resources with ModelCache](#caching-resources-with-modelcache)
    5. [Declarative Cache Keys](#declarative-cache-keys)
    6. [Prefetch on Hover](#prefetch-on-hover)
    7. [Refetching](#refetching)
    8. [Cache Invalidation](#cache-invalidation)
    9. [Tracking Request Times](#tracking-request-times)
1. [Configuring resourcerer](#configuring-resourcerer)
1. [FAQs](#faqs)
1. [Migrating to v2.0](#migrating-to-v20)


# Installation

`$ npm i resourcerer` or `yarn add resourcerer`

`resourcerer` requires on React >= 16.8 but has no external dependencies.

Note: Resourcerer is written in TypeScript and is compiled to ESNext. It does no further transpiling&mdash;including `import`/`export`.
If you are using TypeScript yourself, this won't be a problem. If you're not, and you're not babelifying (or similar) your `node_modules` folder, you'll need to make an exception for this package, ie:

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
  
1. **ResourceKeys**. These are the keys of the object passed to the `register` function in your top-level `resourcerer-config.js` file (discussed above in the introduction). The object is of type `Record<ResourceKeys, new () => Model | new () => Collection>`. These keys are passed to the executor functions and are used to tell the hook or HOC which resources to request.

1. **Executor Function**. The executor function is a function that both the hook and HOC accept that declaratively describes which resources to request and with what config options. In these docs you'll often see it assigned to a variable called `getResources`. It accepts `props` as arguments and may look like, as we'll explore in an example later:

    ```js
    const getResources = (props) => ({user: {path: {userId: props.id}}});
    ```

    or

    ```js
    const getResources = (props) => {
      const now = Date.now();
      
      return {
        userTodos: {
          params: {
            limit: 20,
            end_time: now,
            start_time: now - props.timeRange,
            sort_field: props.sortField
          }
        }
      };
    };
    ```

    It returns an object whose keys represent the resources to fetch and whose values are **Resource Configuration Objects** that we'll discuss later (and is highlighted below).
    
1. **Resource Configuration Object**. In the object returned by our executor function, each entry has a key equal to one of the `ResourceKeys` and whose value we will refer to in this document as a Resource Configuration Object, or Resource Config for short. It holds the declarative instructions that `useResources` and `withResources` will use to request the resource.

# Tutorial

Okay, back to the initial example. Let's take a look at our `useResources` usage in the component:

```js
// `@withResources((props) => ({todos: {}}))`
const getResources = (props) => ({todos: {}});

export default function MyComponent(props) {
  const resources = useResources(getResources, props);
  
  // ...
}
```

You see that `useResources` takes an executor function that returns an object. The executor function
takes a single argument: the current props, which are component props when you use `withResources`, but can be anything when you use `useResources`. The executor function returns an object whose keys are `ResourceKeys` and whose values are Resource Config objects. Where do `ResourceKeys` come from? From the object passed to the `register` method in the config file we added earlier!

```js
// js/core/resourcerer-config.js
import {register} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';

// after adding this key, `todos` can be used in our executor functions to reference the Todos resource.
// The 'todos' string value will also be the default prefix for all todos-related return values.
// That's why we have `props.todosCollection`!
register({todos: TodosCollection});
```

(We can also pass custom prefixes for our prop names in a component, but [we'll get to that later](#custom-resource-names).)  

Back to the executor function. In the example above, you see it returns an object of `{todos: {}}`. In general, the object it should return is of type `{[key: ResourceKeys]: ResourceConfigObject}`, where `ResourceConfigObject` is a generic map of config options. It can contain as many keys as resources you would like the component to request. In our initial example, the Resource Config Object was empty. Further down, we'll go over the plethora of options and how to use them. For now, let's take a look at some of the resource-related props this simple configuration provides our component.


## Other Props Returned from the Hook/Passed from the HOC (Loading States)

Of course, in our initial example, the `todosCollection` won’t be populated with data immediately since, after all, the resource has to be fetched from the API.  Some of the most **significant** and most common React UI states we utilize are whether a component’s critical resources have loaded entirely, whether any are still loading, or whether any have errored out. This is how we can appropriately cover our bases&mdash;i.e., we can ensure the component shows a loader while the resource is still in route, or if something goes wrong, we can ensure the component will still fail gracefully and not break the layout. To address these concerns, the `useResources` hook/`withResources` HOC gives you several loading state helper props. From our last example:


- `todosLoadingState` (can be equal to any of the [LoadingStates constants](https://github.com/noahgrant/resourcerer/blob/06ed847a8d8d0daefd3ad1b7634d887767d338ac/lib/types.ts#L4). There will be one for each resource, and the property names will be equal to `${resourceKey}LoadingState`)
- `hasLoaded` {boolean} - all critical resources have successfully completed and are ready to be used by the component
- `isLoading` {boolean} - any of the critical resources are still in the process of being fetched
- `hasErrored` {boolean} - any of the critical resource requests did not complete successfully
  
`isLoading` , `hasLoaded` , and `hasErrored` are not based on individual loading states, but are rather a collective loading state for the aforementioned-critical component resources. In the previous example, the todos resource is the only critical resource, so `isLoading` / `hasLoaded` / `hasErrored` are solely based on `todosLoadingState`. But we can also add a non-critical `users` resource, responsible, say, for only display users' names alongside their TODOs&mdash;a small piece of the overall component and not worth delaying render over. Here’s how we do that:

```js
const getResources = (props) => ({
  todos: {},
  users: {noncritical: true}
});

function MyClassWithTodosAndAUsers(props) {
  const resources = useResources(getResources, props);
}
```

`MyClassWithTodosAndAUsers` will now receive the following loading-related props, assuming we've registered a `usersCollection` in our config file:

- `todosLoadingState`
- `usersLoadingState` 
- `isLoading`
- `hasLoaded` 
- `hasErrored`

In this case, `isLoading` , et al, are only representative of `todosLoadingState` and completely irrespective of `usersLoadingState` . This allow us an incredible amount of flexibility for rendering a component as quickly as possible.

Here’s how might use that to our advantage in `MyClassWithTodosAndAUsers` :

```jsx
import {Utils} from 'resourcerer';

function MyClassWithTodosAndAUsers(props) {
  const {
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
        // before that, todosCollection is still a Collection instance that can be
        // mapped over--it's just empty
        <ul>
          {todosCollection.map((todoModel) => (
            <li key={todoModel.id}>
              // pure function that accepts loading states as arguments
              {Utils.hasLoaded(usersLoadingState) ?
                getUserName(todoModel.get('userId')) :
                // if you're anti-loader, you could opt to render nothing and have the
                // user name simply appear in place after loading
                <Loader type="inline" />}
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

There’s one other loading prop offered from the hook/HOC: `hasInitiallyLoaded`. This can be useful for showing a different UI for components that have already fetched the resource. An example might be a component with filters: when a filter is changed after the initial resource is loaded (thus re-fetching the resource), we may want to show a loader with an overlay over the previous version of the component. See the [Advanced Topics docs](/docs/advanced_topics.md#loading-overlays) for more.


## Requesting Prop-driven Data

Let's say we wanted to request not the entire users collection, but just a specific user. Here's our config:

```js
// js/core/resourcerer-config.js
import {register} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';
import UserModel from 'js/models/user-model';

register({
  todos: TodosCollection,
  user: UserModel
});
```

And here's what our model might look like (NOTE: use a Model when you've got one resource instance, and a Collection when you've got a list of that resource):

```js
// js/models/user-model.js
import {Model} from 'resourcerer';

export default class UserModel extends Model {
  url({userId}) {
    // `userId` is passed in here because we have
    // `path: {userId: props.id}` in the resource config object
    return `/users/${userId}`;
  }
  
  static dependencies = ['userId'];
}
```

The `dependencies` static property is important here, as we'll see in a second; it is a list of properties that `resourcerer` will use to generate a cache key for the model. It will look for the `userId` property in the following places, in order:

1. the `path` object
1. the `data` object
1. the `params` object

All three of these come from via the [Resource Configuration Object](#nomenclature) that is returned from our executor function; it might look like this:

```jsx
const getResources = (props) => ({user: {path: {userId: props.id}}}) 

// hook
function MyComponent(props) {
  const resources = useResources(getResources, props);
  
  // ...
}

// HOC
@withResources(getResources)
class MyComponentWithAUser extends React.Component {}
```
 
Assuming we have a `props.id` equal to `'noahgrant'`, this setup will put `MyComponentWithAUser` in a loading state until `/users/noahgrant` has returned.
  
### *...and here's the best part:*
  
Let's say that `props.id` changes to a different user. `MyComponentWithAUser` will get put _back_ into a loading state while the new endpoint is fetched, _without us having to do anything!_ This works because our model has dictated that its models should be cached by a `userId` field, which is passed to it in the [`path` property](#path).

## Changing Props
In general, there are two ways to change `props.id` as in the previous example:

1. Change the url, which is the top-most state-carrying entity of any application. The url can be changed either by path parameter or query paramter, i.e. `example.com/users/noahgrant` -> `example.com/users/bobdonut`, or `example.com/users?id=noahgrant` -> `example.com/users?id=bobdonut`. In this case, each prop change is _indexable_, which is sometimes desirable, sometimes not.

1. Change internal application state. For these cases, `useResources`/`withResources` make available another handy prop: `setResourceState`. `setResourceState` is a function that has the same method signature as the `useState` we all know and love. It sets internal hook/HOC state, which is then returned/passed down, respectively, overriding any initial prop, ie `setResourceState((state) => ({...state, id: 'bobdonut'}))`. This is _not_ indexable.

    Note that `setResourceState` is very useful for the `withResources` HOC because it allows you to 'lift' state above the fetching component that otherwise would not be possible. For `useResources`, it is a nice-to-have in some cases, but because you can always define your own `useState` above the `useResources` invocation, you may find that you use it less often.



## Common Resource Config Options

### params

The `params` option is passed directly to the [sync method](/docs/model.md#sync) and sent either as stringified query params (GET requests) or as a body (POST/PUT). Its properties are also referenced when generating a cache key if they are listed in a model's static `dependencies` property (See the [cache key section](#declarative-cache-keys) for more). Let's imagine that we have a lot of users and a lot of todos per user. So many that we only want to fetch the todos over a time range selected from a dropdown, sorted by a field also selected by a dropdown. These are query parameters we'd want to pass in our `params` property:

```js
  @withResources((props) => {
    const now = Date.now();
      
    return {
      userTodos: {
        params: {
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

Now, as the prop fields change, the params sent with the request changes as well (provided we set our `dependencies` property accordingly):

`https://example.com/users/noahgrant/todos?limit=20&end_time=1494611831024&start_time=1492019831024&sort_field=importance`


### path

[As referenced previously](#requesting-prop-driven-data), all properties on an `path` object will be passed into a model's/collection's `url` function. This makes it an ideal place to add _path parameters_ (contrast this with the [`params` object](#params), which is the place to add query (GET) or body (POST/PUT/PATCH) parameters). It will also be used in cache key generation if it has any fields specified in the model's static `dependencies` property (See the [cache key section](#declarative-cache-keys) for more). Continuing with our User Todos example, let's add an `path` property:

```js
const getResources = (props) => {
  const now = Date.now();
      
  return {
    userTodos: {
      params: {
        limit: 20,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      path: {userId: props.userId}
    }
  };
};
```

Here, this UserTodosCollection instance will get a `userId` property passed to its `url` function. We'll also want to add the `'userId'` string to the collection's [static `dependencies` array](#requesting-prop-driven-data), because each cached collection should be specific to the user:

```js
// js/models/user_todos_collection.js
export class UserTodosCollection extends Collection {
  url({userId}) {
    // userId gets passed in for us to help construct our url
    return `/users/${userId}/todos`;
  }
  
  static dependencies = ['userId'];
};
```  

  
### noncritical

As alluded to in the [Other Props](#other-props-returned-from-the-hookpassed-from-the-hoc-loading-states) section, not all resources used by the component are needed for rendering. By adding a `noncritical: true` option, we:

- De-prioritize fetching the resource until after all critical resources have been fetched
- Remove the resource from consideration within the component-wide loading states (`hasLoaded`, `isLoading`, `hasErrored`), giving us the ability to render without waiting on those resources
- Can set our own UI logic around displaying noncritical data based on their individual loading states, ie `usersLoadingState`, which can be passed to the pure helper methods, `Utils.hasLoaded`, `Utils.hasErrored`, and `Utils.isLoading` from `resourcerer`.
  
  

### force

Sometimes you want the latest of a resource, bypassing whatever model has already been cached in your application. To accomplish this, simply pass a `force: true` in a resource's config. The force-fetched response will replace any prior model in the cache.

```js
  const getResources = (props) => ({latestStats: {force: true}});

  function MyComponentWithLatestStats(props) {
    const {latestStatsModel} = useResources(getResources, props);
  }
```

The resource will only get force-requested when the component mounts; the `force` flag will get ignored on subsequent updates. If you need to refetch after mounting to get the latest resource, use [refetch](#refetching).

This behavior is similar to the behavior you get with [cache invalidation](#cache-invalidation).


### Custom Resource Names

Passing a `resourceKey: <ResourceKeys>` option allows you to pass a custom name as the `withResources` key, which will become the base name for component-related props passed down to the component. For example, this configuration:

```js
const getResources = (props) => ({myRadTodos: {resourceKey: todos});

export default function MyComponentWithTodos {
  const {
    myRadTodosCollection,
    myRadTodosLoadingState,
    myRadTodosStatus,
    ...rest
  } = useResources(getResources, props);
}
```

would still fetch the todos resource, but the properties returned/props passed to the `MyComponentWithTodos` instance will be `myRadTodosCollection`, `myRadTodosLoadingState`, and `myRadTodosStatus`, etc, as shown. This also allows us to fetch the same resource type multiple times for a single component.

NOTE: when using resourcerer with [Typescript](docs/typescript.md) (recommended), it will complain about custom resource names, but it _will_ work. For now, you'll need to `// @ts-ignore`, but please submit a PR :).

### prefetches

This option is an array of props objects that represent what is _different_ from the props in the original resource. For each array entry, a new resource configuration object will be calculated by merging the current props with the new props, and the resulting request is made. In contrast to the original resource, however, _no props representing the prefetched requests are returned or passed down to any children (ie, there are no loading state props, no model props, etc)_. They are simply returned and kept in memory so that whenever they are requested, they are already available.

A great example of this is for pagination. Let's take our previous example and add a `from` property to go with our `limit` that is based on the value of a `page` prop ([tracked either by url parameter or by `setResourceState`](#changing-props)). We want to request the first page but also prefetch the following page because we think the user is likely to click on it:

```js
const getResources = (props) => {
  const now = Date.now();
  const REQUESTS_PER_PAGE = 20;
      
  return {
    userTodos: {
      params: {
        from: props.page * REQUESTS_PER_PAGE,
        limit: REQUESTS_PER_PAGE,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      path: {userId: props.userId},
      // this entry is how we expect the props to change. in this case, we want props.page to be
      // incremented. the resulting prefetched request will have a `from` value of 20, whereas the
      // original request will have a `from` value of 0. The `userTodosCollection` returned (hook) or
      // passed down as props (HOC) will be the latter.
      prefetches: [{page: props.page + 1}]
    }
  };
};
```

When the user clicks on a 'next' arrow that updates page state, the collection will already be in the cache, and it will get passed as the new `userTodosCollection`. Accordingly, the third page will then get prefetched (`props.page` equal to 2 and `from` equal to 40). Don't forget to add `from` to the [`dependencies`](#declarative-cache-keys) list!

If you're looking to optimistically prefetch resources when a user hovers, say, over a link, see the [Prefetch on Hover](#prefetch-on-hover) section.

### data

Pass in a data hash to initialize a Model instance with data before initially fetching. This is passed directly to the [model](/docs/model.md#constructor) `constructor` method, and is typically much less useful than providing the properties directly to the [`params`](#params) property. One place it might be useful is to seed a model with an id you already have:

```js
getResources = () => ({customer: {data: {id: props.customerId}}});

function MyCustomerComponent(props) {
  const {customerModel} = useResources(getResources, props);

  // now you can reference the id directly on the model
  console.log(customerModel.get('id')); // or the id shorthand, customerModel.id
}
```

You can also use `data` to take advantage of [re-caching](/docs/advanced_topics.md#recaching-newly-saved-models).  

Like `params` and `path`, the `data` object will also be used in cache key generation if it has any fields specified in the model's static `dependencies` property (See the [cache key section](#declarative-cache-keys) for more).

### lazy

Lazy fetching is one of resourcerer's most powerful features, allowing you to get a reference to a model without actually fetching it. If the model is ultimately fetched elsewhere on the page, the component that lazily fetched it will still listen for updates.

A great example of when this would be useful is for search results. Search results are read-only, but if you modify the entity of a result somewhere else in the page, you'd like to see it reflected in your search results. Yet you don't want to fetch the entity details for every search result and spam your API. Enter lazy loading:

```jsx
// todo_search.jsx
getResources = () => ({todosSearch: {params: someSearchParams}});

function TodoSearch(props) {
  const {todoSearchModel} = useResources(getResources, props);

  return (
    <Table>
      <thead>
        <TableHeader>Name</TableHeader>
        <TableHeader>Last Updated</TableHeader>
      </thead>
      <tbody>
        {todoSearchModel.get('results').map((todo) => <TodoSearchItem {...todo} />)}
      </tbody>
    </Table>
  );
}

// todo_search_item.jsx
// the todoModel is never actually fetched here, it's only listened on, allowing any changes made elsewhere in the page to be reflected here.
getResources = () => ({todo: {id: props.id, lazy: true}});

function TodoSearchItem(props) {
  const {todoModel} = useResources(getResources, props);

  return (
    <tr>
      <td>{todoModel.get('name') || props.name}</td>
      <td>{todoModel.get('updated_at') || props.updated_at}</td> 
    </tr>
  );
```

If the todo model has been fetched already, we'll read straight from that. And if it gets updated, this component, via resourcerer, is listening for updates and will re-render to keep our entire UI in sync. Otherwise, we'll just fall back to our read-only search results. WIN!

### minDuration

Sometimes requests can be _too_ fast for certain UIs. In these cases, spinners and other loading states can appear more like a jarring flicker than a helpful status indicator. For these, you can pass a `minDuration` equal to the minimum number of milliseconds that a request should take. This is great for [save and destroy](#data-mutations) requests. It will work for fetch requests via `useResources`, as well, but beware: if multiple components use the same resource and there are different (or missing) values for `minDuration`, this will cause a race condition.

### dependsOn

See the section on [serial requests](#serial-requests).

### provides

See the section on [serial requests](#serial-requests).

# Data Mutations

So far we've only discussed fetching data. But `resourcerer` also makes it very easy to make write requests via the [Model](/docs/model.md) and [Collection](/docs/collection.md) instances that are returned. These classes are enriched data structures that hold our API server data as well as several utilities that help manage the server data in our application. There are three main write operations via these classes:

1. [Model#save](/docs/model.md#save)

    Use this to create a new resource object (POST) or update an existing one (PUT). Uses the return value of the [`isNew()`](/docs/model.md#isNew) method to determine which method to use. If updating, pass a `{patch: true}` option to use PATCH instead of PUT, which will also send over only the changed attributes instead of the entire resource.

    ```js
    function MyComponent(props) {
      const {myModel} = useResources(getResources, props),
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
      const {hasLoaded, todosCollection} = useResources(getResources, props),
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
1. All calls resolve an array, which is a tuple of `[model, response]`. All reject with just the response.
1. All write calls must have a `.catch` attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.
  
## Serial Requests

In most situations, all resource requests should be parallelized; but that’s not always possible. Every so often, there may be a situation where one request depends on the result of another. For these cases, we have the `dependsOn` resource config option and the `provides` resource config option. These are probably best explained by example, so here is a simplified instance from the [Sift](https://sift.com) Console, where we load a queue item that has info about a user, but we can't get further user information until we know what user id belongs to this queue item.

```js
@withResources((props) => ({
  user: {
    path: {userId: props.userId},
    dependsOn: !!props.userId
  },
  queueItem: {
    data: {id: props.itemId},
    provides: (queueItemModel) => ({userId: queueItemModel.get('userId')})
  }
}))
export default class QueueItemPage extends React.Component {}


In this simplified example, only `props.itemId` is initially present at the url `items/<itemId>`, and since the UserModel depends on `props.userId` being present, that model won’t initially get fetched. Only the QueueItemModel gets fetched at first; it has the `provides` option, which is function that takes an instance of the returned model or collection and returns a map of `{[key: string]: any}`. Each key is a new prop name, and each value the new prop's value.

So, in this case, the returned `queueItemModel` instance is passed as an argument, and we return a string that will be assigned to `props.userId` (or, more accurately, will be set as state via `setResourceState` as described in the previous section). At tthis point, `props.userId` exists, and the UserModel will be fetched. And we have serially requested our resources!

One thing to note here is that while the `queueItem` resource is being fetched, the user resource is in a `PENDING` state, which is a special state that does not contribute to overall component `isLoading`/`hasErrored` states (though it will keep the component from being `hasLoaded`). At this point, the `QueueItemPage` in the example above is in a `LOADING` state (`isLoading === true`) because `QUEUE_ITEM` is loading. When it returns with the user id, the `user` resource is put into a `LOADING` state, and the component then remains `isLoading === true` until it returns, after which the component has successfully loaded. If the `queueItem` resource happened to error for some reason, the `user` resource would never get out of its `PENDING` state, and the component would then take on the `ERROR` state (`hasErrored === true`) of `queueItem`. For more on `PENDING`, see [Thoughts on the PENDING State](/docs/advanced_topics.md#thoughts-on-the-pending-resource) in the [Advanced Topics document](/docs/advanced_topics.md).  

Finally, note that the `provides` function can return any number of fields we want to set as new props for other resources:

```js
const getResources = (props) => ({
  user: {
    options: {state: props.activeState, userId: props.userId},
    // userModel depends on multiple props from queueItemModel
    dependsOn: !!props.userId && props.activeState === "active"
  },
  queueItem: {
    data: {id: props.itemId},
    provides: (queueItemModel) => ({userId: queueItemModel.get('userId'), activeState: queueItemModel.get('state')})
  }
});
  
export default function QueueItemPage(props) {
  // activeState and userId are internal state within `useResources` and returned
  const {
    activeState,
    userId,
    userModel,
    queueItemModel
  } = useResources(getResources, props);
}
```

# Differences between useResources and withResources

The hook and HOC largely operate interchangeably, but do note a couple critical differences:

1. The `withResources` HOC conveniently contains an [ErrorBoundary](https://reactjs.org/docs/error-boundaries.html) with every instance, but such functionality [does not yet exist in hooks](https://reactjs.org/docs/hooks-faq.html#do-hooks-cover-all-use-cases-for-classes). This is a definite advantage for the HOC right now, since, if we're already setting `hasErrored` clauses in our components to prepare for request errors, we can naturally gracefully degrade when an unexpected exception occurs. You'll need to manage this yourself with hooks until the equivalent functionality is released.

1. The executor function for a hook can be inlined in your component, which puts component props in its closure scope. So be extra careful to avoid this anti-pattern:

    ```js
    function MyComponent({start_time, ...props}) {
      const {todosCollection} = useResources((_props) => ({todos: {params: {start_time}}}), props);
      
      // ...
    ```
    
    The subtle problem with the above is that the `start_time` executor function parameter is relying on a value in the function component closure instead of the `_props` parameter object; props passed to the executor function can be current or previous but are not the same as what is in the closure, which will always be current. This will lead to confusing bugs, so instead either read directly from the props parameter passed to the executor function:
    
    ```js
    function MyComponent(props) {
      const {todosCollection} = useResources(({start_time}) => ({todos: {params: {start_time}}}), props);
      
      // ...
    ```
    
     or, even clearer, define your executor function outside of the component scope, as we've done throughout this tutorial (now you know why!):
     
     ```js
     const getResources = ({start_time}) => ({todos: {params: {start_time}}});
     
     function MyComponent(props) {
       const {todosCollection} = useResources(getResources, props);
       
       // ...
     ```

## Caching Resources with ModelCache

`resourcerer` handles resource storage and caching, so that when multiple components request the same resource with the same parameters or the same body, they receive the same model in response. If multiple components request a resource still in-flight, only a single request is made, and each component awaits the return of the same resource. Fetched resources are stored in the `ModelCache`. Under most circumstances, you won’t need to interact with directly; but it’s still worth knowing a little bit about what it does.

The `ModelCache` is a simple module that contains a couple of Maps&mdash;one that is the actual cache `{[cacheKey: string]: Model | Collection}`, and one that is a component manifest, keeping track of all component instances that are using a given resource (unique by cache key). When a component unmounts, `resourcerer` will unregister the component instance from the component manifest; if a resource no longer has any component instances attached, it gets scheduled for cache removal. The timeout period for cache removal is two minutes by default (but can be changed, see [Configuring resourcerer](#configuring-resourcerer), or [overridden on a model-class basis](/docs/model.md#static-cachetimeout)), to allow navigating back and forth between pages without requiring a refetch of all resources. After the timeout, if no other new component instances have requested the resource, it’s removed from the `ModelCache`. Any further requests for that resource then go back through the network.

Again, it’s unlikely that you’ll use `ModelCache` directly while using `resourcerer`, but it’s helpful to know a bit about what’s going on behind-the-scenes.

## Declarative Cache Keys

As alluded to previously, `resourcerer` relies on the model classes themselves to tell it how it should be cached. This is accomplished via a static `dependencies` array, where each entry can be either:

1. A string, where each string is the name of a property that the model receives whose value should take part in the cache key. The model can receive this property either from the [path](#path) hash, the [data](#data) hash, or the [params](#params) hash, in that order.

2. A function, whose return value is an object of keys and values that should both contribute to the cache key.

Let's take a look at the `userTodos` resource from above, where we want to request some top number of todos for a user sorted by some value over some time range. The resource declaration might look like this:

```js
const getResources = (props) => {
  const now = Date.now();
      
  return {
    userTodos: {
      params: {
        limit: props.limit,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      path: {userId: props.userId}
    }
  };
};
```

And our corresponding model definition might look like this:

```js
export class UserTodosCollection extends Collection {
  url({userId}) {
    return `/users/${userId}/todos`;
  }
  // ...
  
  static dependencies = [
    'limit',
    'userId',
    'sort_field',
     ({end_millis, start_millis}) => ({range: end_millis - start_millis})
  ];
};
```

We can see that `limit` and `sort_field` as specified in `dependencies` are taken straight from the `params` object that `resourcerer` transforms into url query parameters. `userId` is part of the `/users/{userId}/todos` path, so it can't be part of the `params` object, which is why it gets passed in the `path` object instead.

The time range is a little tougher to cache, though. We're less interested the spcecific `end_time`/`start_time` values to the millisecond&mdash;it does us little good to cache an endpoint tied to `Date.now()` when it will never be the same for the next request. We're much more interested in the difference between `end_time` and `start_time`. This is a great use-case for a function entry in `dependencies`, which takes the `params` object passed an argument. In the case above, the returned object will contribute a key called `range` and a value equal to the time range to the cache key.

The generated cache key would be something like `userTodos~limit=50_$range=86400000_sort_field=importance_userId=noah`. Again, note that:

- the `userId` value is taken from the `path` hash
- the `limit` and `sort_field` values are taken from the `params` hash
- the `range` value is taken from a function that takes `start_millis`/`end_millis` from the `params` hash into account.


## Prefetch on Hover

You can use `resourcerer`'s executor function to optimistically prefetch resources when a user hovers over an element. For example, if a user hovers over a link to their TODOS page, you may want to get a head start on fetching their `todos` resource so that perceived loading time goes down or gets eliminated entirely. We can do this with the top-level `prefetch` function:

```jsx
import {prefetch} from 'resourcerer';

// here's our executor function just as we pass to useResources or withResources
const getTodos = (props) => {
  const now = Date.now();
      
  return {
    userTodos: {
      params: {
        limit: props.limit,
        end_time: now,
        start_time: now - props.timeRange,
        sort_field: props.sortField
      },
      path: {userId: props.userId}
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

The function takes a single or a list of `ResourceKeys`. Each entry will get refetched.

```js
function MyComponent(props) {
  const {todosCollection, refetch} = useResources(({start_time}) => ({todos: {params: {start_time}}}), props);
      
  // ...
  
  return <Button onClick={() => refetch("todos")}>Refetch me</Button>;
```

**NOTE:**
* The list returned by the function should only include keys that are currently returned by the executor function. In the example above, returning `userTodos` would not fetch anything because it is not part of the current executor function. To conditionally fetch another resource, add it to the executor function with [dependsOn](#serial-requests).
* The resource that will be refetched is the version returned by the executor function with the current props. To fetch a different version, use the standard props flow instead of refetching.

## Cache Invalidation

In some cases you may want to imperatively remove a resource from the cache. For example, you may make a change to a related resource that renders a resource invalid. For those cases, `useResources` returns an `invalidate` function that takes a single or a list of `ResourceKeys`:

```js
function MyComponent(props) {
  const {todosCollection, invalidate} = useResources(({start_time}) => ({todos: {params: {start_time}}}), props);
      
  // ...
  
  return <Button onClick={() => invalidate(["todos"])}>Invalidate me</Button>;
```

* Unlike [`refetching`](#refetching), the ResourceKeys passed to `invalidate` do not need to be from those returned by the executor function. They can any resource key. This function is also available as a static import from the `resourcerer` package.

Rather than invalidating the cache for select keys, you can also invalidate the entire cache with the exception of some keys by passing the `{except: true}` option:

```js
// this will remove all items from the cache except those from the "todos" resource
invalidate(["todos"], {except: true});
```

## Tracking Request Times

If you have a metrics aggregator and want to track API request times, you can do this by setting a `measure` static property on your model or collection. `measure` can either be a boolean or a function that returns a boolean. The function takes the resource config object as a parameter:

```js
import {Model} from 'resourcerer';

class MyMeasuredModel extends Model {
  // either a boolean, which will track every request of this model instance
  static measure = true;

  // or a function that returns a boolean, which will track instance requests based on a condition
  static measure = ({data={}}) => data.id === 'noahgrant';
}
```

When the static `measure` property is/returns true, `resourcerer` will record the time it takes for that resource to return and pass the data to the [track configuration](#configuring-resourcerer) method that you can set up, sending it to your own app data aggregator. This allows you to see the effects of your endpoints from a user’s perspective.

# Configuring `resourcerer`

The same config file used to `register` your models also allows you to set custom configuration properties for your own application:

```js
import {ResourcesConfig} from 'resourcerer';

ResourcesConfig.set(configObj);
```

`ResourcesConfig.set` accepts an object with any of the following properties:

* `cacheGracePeriod` (number in ms): the length of time a resource will be kept in the cache after being scheduled for removal (see the [caching section](#caching-resources-with-modelcache) for more). **Default:** 120000 (2 minutes). Note that each model class can provide its own timeout override.

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
      stringify(params, options) {
        // params is the params object to be stringified into query parameters
        // options is the request options object
        return stringify(params);
      }
    });
    ```


* `track` (function): method invoked when [a `measure` property is added to a Model or Collection](#tracking-request-times). Use this hook to send the measured data to your application analytics tracker. **Default:** noop. The method is invoked with two arguments:

    * the event string, `'API Fetch'`
    * event data object with the following properties:
        * Resource (string): the name of the resource (taken from the entry in `ResourceKeys`)
        * params (object): params object supplied via the resource's config
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
    static dependencies = ['category'];

    url() {
      return '/todos';
    }
  }


  // component1
  function MyComponent({category, ...props}) {
    const {todosCollection} = useResources(() => ({todos: {path: {category}}));
  }

  // component2--identical to the first
  function MyComponent({category, ...props}) {
    const {todosCollection} = useResources(() => ({todos: {path: {category}}));
  }
  ```

  The other big difference you might note is the data object in the hook's response. With React Query, you get exactly the JSON returned by the server. With resourcerer, you get [Model](/docs/model.md) or [Collection](/docs/collection.md) instances, which are enriched data representations from which you can also perform write operations that will propagate throughout all other subscribed components&mdash;regardless of their location in your application. Need to update a model? Call [`model.set()`](/docs/model.md#set)&mdash;any other component that uses that model (or its collection) will automatically update. Need to persist to the server? Call [`model.save()`](/docs/model.md#save) or [`collection.add()`](/docs/collection.md#add). Need to remove the model? [`model.destroy()`](/docs/model.md#destroy). Ez-pz.
  
  
  Also note that the `todosCollection` in both components 1 and 2 in the last example are the same objects.


* Does `resourcerer` support SSR?  
  
    There is no official documentation for its use in server-side rendering at this point. However, because passing models as props directly to a component [bypasses fetching](/docs/testing_components.md#testing-components-that-use-resourcerer), it is likely that `resourcerer` can work nicely with an SSR setup that:  
    
    1. passes instantiated models directly through the app before calling `renderToString`  
    2. provides those models within a top-level `<script>` element that adds them directly to the [ModelCache](#caching-resources-with-modelcache).


* Can `resourcerer` do anything other than `GET` requests?

    `resourcerer` only handles resource _fetching_ (i.e. calling [Model.prototype.fetch](/docs/model.md#fetch)). Note that this is not the same as only making `GET` requests; pass in a `method: 'POST'` property in a resource's config to turn the `params` property into a POST body, for example, when making a search request.
    
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

    Under 10kB gzipped. It has no dependencies.

* Semver?  

    Yes. Releases will adhere to [semver](https://semver.org/#semantic-versioning-200) rules.

# Migrating to v2.0

See the [Migrating to v2.0](/docs/migrating_to_2.0.md) doc.
