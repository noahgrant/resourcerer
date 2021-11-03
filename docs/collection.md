# Collection

A collection is a client-side abstraction for the latest-saved server state of a list of objects (a model, by contrast, represents a single persisted object in that resource). A collection _must_ have one thing:
a `url`. This instance property can be a string literal or a function.

```js
class MyTodos extends Collection {
  url = '/todos'
}

class MyTodos extends Collection {
  constructor(models, options={}) {
    this.subtype = options.subtype;
  }

  url() {
    return `/todos/${this.subtype}`;
  }
}
```

A collection instance of the class created and registered in your [resourcerer config](https://github.com/noahgrant/resourcerer#configuring-resourcerer) will be returned by every `useResources` call that uses its model key from the [ModelMap](https://github.com/noahgrant/resourcerer#tutorial). You can read simply from it
by using `Collection#toJSON` (the most common usage), but there are several other methods and properties in its interface you can customize in your collection definition or
that you might find useful in rendering your data-hydrated components.

## Properties

### `static` comparator

Add this on your Collection definition to tell it how it should sort its models. It can take three forms:

1. A string. In this case, it represents the model property to sort by.
2. A function with a single argument. In this case, it takes a model's attributes as an argument and returns the value by which it should sort.
3. A function with two arguments. This is used to sort the collection's models via the native [Array.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort) method.  

### length

This is an instance property that represents the number of models in the collection.  

### `static` Model

Set this property if you want a collection's models to be an instance of a class other than the default Model

### `static` cacheFields

This property tells resourcerer how to determine whether to make a new request or to take a collection out of the cache. It is an array of strings or functions from which its cache key is calculated. See the [cacheKey](https://github.com/noahgrant/resourcerer#caching-resources-with-modelcache) section for more info.


## Methods

### constructor

```js
constructor: void (models: Array<Object|Model>, options: object)
```

The Collection's constructor gets passed any initial models, as well as the options from the executor function. Override this to set some instance variables for the collection, which is really useful for url path parameters. Just be sure to pass the arguments to its `.super()` call, as well:

```js
class MyCollection extends Collection {
  constructor(models, options={}) {
    super(models, options);
    
    this.category = options.category;
  }
  
  url() {
    return `/todos/${this.category}`;
  }
}
```

Passing in a `model` option or a `comparator` option to an instance's constructor will override the statically defined properties on its constructor.


### add
```js
add: Collection (models: (Object|Model)|Array<Object|Model>, options: Object)
```

Add a new entry or list of entries into the collection. Each entry can be an object of attributes or a Model instance. Will trigger an update in all subscribed components unless the `trigger: true` option is passed. You can also pass a `parse: true` option to run the model through its [parse]() method before setting its properties. If an entry already exists on the collection, the new properties will get merged into its existing model.

### create
```js
create: Promise<[Model, Response]> (models: (Object|Model)|Array<Object|Model>, options: Object)
```

Adds a new entry to the collection and persists it to the server. This is literally the equivalent to calling `collection.add()` and then `model.save()`. The returned Promise is the same as is returned from [Model#save](). If the request errors, the model is auto-removed from the collection. Pass the `wait: true` option to wait to add the new model until after the save request returns. Subscribed components will update when the new entry is added as well as when the request returns.

***All .create() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***

### fetch
```js
fetch: Promise<[Collection, Response]> (options: Object)
```

This is the method that `resourcerer` uses internally to get server data and set its parsed response as models on the collection. This should rarely need to be used in your application. Subscribed components will update when the request returns.


### get
```js
get: Model? (identifier: string|number)
```

Collections index their Model instances by either the Model's [`idAttribute`]() or by the return value of its [`modelId`](#modelid) method. The `.get()` method takes an id value and returns the quick-lookup model instance if one exists.  

***All .fetch() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***

### has  
```js
has: boolean (identifier: string|number|Model|object)
```

Returns whether or not a model exists in a collection. You can pass the model instance itself, a model's attributes, or a model's id.

### modelId
```js
modelId: number|string (attrs: Object)
```

Use this as a shortcut when you don't want to define a custom Model class just because the collection doesn't contain the default id field (which is `'id'`). By default this is equal to the `idAttribute` set on the collection's Model class. But if you don't want to add that, you can use this method, ie:

```js
// the collection will index its models based on the `name` property instead of the default `id` property
modelId(attrs) {
  return attrs.name;
}
``` 

### parse
```js
parse: Array<Object> (response: any)
```

This method takes in the raw server data response and should return the data in the form that should be set on the Collection. It defaults to the identity function, which might suffice for many endpoints. Override this for your custom needs. For example, for some search results with some metadata (in an API that returns a JSON object), we want to set the results as the collection:

```js
parse(response) {
  this.totalResults = response.totalResults;
  this.pageNumber = response.pageNumber;
  this.resultsPerPage = response.resultsPerPage;
  
  return response.results;
}
```

### remove
```js
remove: Collection (models: (Object|Model)|Array<Object|Model>, options: Object)
```

Use this to remove a model or models from the collection, which should not often be needed. You can pass in anything or a list of anything that can be accepted via [.get()](#get). Pass in `silent: true` for subscribed components _not_ to get rerendered.

### reset
```js
reset: Collection (models: Array<Object|Model>, options: Object)
```

Removes all models and their references from a collection and replaces them with the models passed in. Pass in `silent: true` for subscribed components _not_ to get rerendered, and `parse: true` to have data attributes get parsed before being set on their respective models.

### set
```js
set: Collection (models: (Object|Model)|Array<Object|Model>, options: Object)
```

This is the method that many other write methods (`add`, `remove`, `save`, `reset`, etc) use under the hood, and it should _rarely if ever_ need to be used directly in your application. Sets new attributes as models and merges existing attributes with their models, and sorts as necessary. Pass in `silent: true` for subscribed components _not_ to get rerendered, and `parse: true` to have data attributes get parsed before being set on their respective models.  

### sync
This is just a proxy for the [sync](/lib/sync.js) module. Its behavior shouldn't be overridden, but it may be useful to wrap it for custom behavior, ie:

```js
Collection.sync = Model.sync = function(model, options) {
  // custom logic...
  
  // defer again to the sync module
  return sync(this, options);
}
```

### toJSON
```js
toJSON: Array<Object> ()
```

Returns each model's data attributes in a new array.

### Utility methods

#### at
#### filter
#### find
#### findWhere
#### map
#### pluck
#### slice
#### where
