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
  
  
# Usage

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
  
Let's say that `props.id` changes to a different user. `MyComponentWithAUser` will get put _back_ into a loading state while the new endpoint is fetched, _without us having to do anything!_ This works because our model has dictated that its models should be cached by a `userId` field, which is passed to it in the `options` property.

## Changing Props
In general, there are two ways to change `props.id` as in the previous example:

1. Change the url, which is the top-most state-carrying entity of any application. The url can be changed either by path parameter or query paramter, i.e. `example.com/users/noahgrant` -> `example.com/users/fredsadaghiani`, or `example.com/users?id=noahgrant` -> `example.com/users?id=fredsadaghiani`. In this case, each prop change is _indexable_, which is sometimes desirable, sometimes not.

1. Change internal application state. For these cases, `withResources` makes available another handy prop: `this.props.setResourceState`. `setResourceState` is a function that has the same method signature as the `setState` we all know and love. It sets the state of the wrapping component in the HOC, which is then passed down as props, overriding any initial prop, ie `this.props.setResourceState({id: 'fredsadaghiani'})`. This is _not_ indexable.


## Serial Requests

## Other Common Resource Config Options

## Declarative Cache Keys

## Caching Resources with ModelCache

## Testing Components that Use `withResources`

## Thoughts on the `pending` State


# Configuring `withResources`



# FAQs

* Does `with-resources` support SSR?

* Does it support concurrent React?

* What about other data sources, like websockets or indexedDB?
