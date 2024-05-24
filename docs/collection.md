# Collection

A collection is a client-side abstraction for the latest-saved server state of a list of objects (a model, by contrast, represents a single persisted object in that resource). A collection _must_ have one thing:
a `url`. This instance property can be a string literal or a function.

```js
class MyTodos extends Collection {
  url = '/todos'
}

class MyTodos extends Collection {
  url({subtype}) {
    return `/todos/${subtype}`;
  }
}
```

A collection instance of the class created and registered in your [resourcerer config](https://github.com/noahgrant/resourcerer#nomenclature) will be returned by every `useResources` call that uses its model key from the [ModelMap](https://github.com/noahgrant/resourcerer#tutorial). You can read simply from it
by using [`Collection#toJSON`](#tojson) (the most common usage), but there are several other methods and properties in its interface you can customize in your collection definition or
that you might find useful in rendering your data-hydrated components.

## Properties

### `static` comparator

Add this on your Collection definition to tell it how it should sort its models. It can take three forms:

1. A string. In this case, it represents the model property to sort by.
2. A function with a single argument. In this case, it takes a model's data as an argument and returns the value by which it should sort.
3. A function with two arguments. This is used to sort the collection's models via the native [Array.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort) method.  

### length

This is an instance property that represents the number of models in the collection.  

### `static` Model

Set this property if you want a collection's models to be an instance of a class other than the default Model

### `static` dependencies

This property tells resourcerer how to determine whether to make a new request or to take a collection out of the cache. It is an array of strings or functions from which its cache key is calculated. See the [cacheKey](https://github.com/noahgrant/resourcerer#caching-resources-with-modelcache) section for more info.

### `static` cacheTimeout
`number`

The number of milliseconds to keep all collections of this class in the cache after all client components stop referencing it. Note that this is on a collection _class_ basis and not an _instance_ basis because the latter can introduce race conditions into your application.

### `static` measure
`boolean|function`

A boolean or function that accepts a [resource configuration object](https://github.com/noahgrant/resourcerer#nomenclature) and returns a boolean, telling resourcerer to track this collection's request time and report it via the `track` method setup in [configuration](https://github.com/noahgrant/resourcerer#configuring-resourcerer).

### `static` modelIdAttribute

Use this as a shortcut when you don't want to define a custom Model class just because the collection doesn't contain the default id field (which is `'id'`), ie:

```js
// the collection will index its models based on the `name` property instead of the default `id` property
static modelIdAttribute = 'name'
``` 



## Methods

### constructor

```js
constructor: void (models: Array<Object|Model>, options: object)
```

The Collection's constructor gets passed any initial models, as well as the [options](https://github.com/noahgrant/resourcerer#options) from the executor function. Override this to add some custom logic or instance variables for the collection&mdash;just be sure to pass the arguments to its `.super()` call, as well:

```js
class MyCollection extends Collection {
  constructor(models, options={}) {
    super(models, options);
    
    // initializing some variable to be used later
    this.categoriesList = [];
  }
  
  url({category}) {
    return `/todos/${category}`;
  }
}
```

Passing in a `Model` option or a `comparator` option to an instance's constructor will override the statically defined properties on its constructor. Other `options` fields (the ones passed from the executor function [options](https://github.com/noahgrant/resourcerer#options) property) are passed to the `url` as shown in the example above.


### add
```js
add: Collection (models: (Object|Model)|Array<Object|Model>, options: Object)
```

Add a new entry or list of entries into the collection. Each entry can be an object of data or a Model instance. Will trigger an update in all subscribed components unless the `trigger: true` option is passed. You can also pass a `parse: true` option to run the model through its [parse](/docs/model.md#parse) method before setting its properties. If an entry already exists on the collection, the new properties will get merged into its existing model.

### create
```js
create: Promise<[Model, Response]> (model: (Object|Model), options: Object)
```

Adds a new entry to the collection and persists it to the server. This is literally the equivalent to calling `collection.add()` and then `model.save()`. Because it also instantiates the new model, be sure to pass any path params you need in your url as the options argument (the same [options](https://github.com/noahgrant/resourcerer#options) in the resource config object). The returned Promise is the same as is returned from [Model#save](/docs/model.md#save). If the request errors, the model is auto-removed from the collection. Pass the `wait: true` option to wait to add the new model until after the save request returns. Subscribed components will update when the new entry is added as well as when the request returns.

***All .create() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***

### fetch
```js
fetch: Promise<[Collection, Response]> (options: Object)
```

This is the method that `resourcerer` uses internally to get server data and set its parsed response as models on the collection. This should rarely need to be used in your application. Subscribed components will update when the request returns.

***All .fetch() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***


### get
```js
get: Model? (identifier: string|number)
```

Collections index their Model instances by either the Model's [`idAttribute`](/docs/model.md#static-idattribute) or, equivalently as a shortcut, by the collection's own static [`modelIdAttribute`](#static-modelidattribute) property. The `.get()` method takes an id value and returns the quick-lookup model instance if one exists.  

### has  
```js
has: boolean (identifier: string|number|Model|object)
```

Returns whether or not a model exists in a collection. You can pass the model instance itself, a model's data, or a model's id.

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

Removes all models and their references from a collection and replaces them with the models passed in. Pass in `silent: true` for subscribed components _not_ to get rerendered, and `parse: true` to have data get parsed before being set on their respective models.

### set
```js
set: Collection (models: (Object|Model)|Array<Object|Model>, options: Object)
```

This is the method that many other write methods (`add`, `remove`, `save`, `reset`, etc) use under the hood, and it should _rarely if ever_ need to be used directly in your application. Sets new data as models and merges existing data with their models, and sorts as necessary. Pass in `silent: true` for subscribed components _not_ to get rerendered, and `parse: true` to have data get parsed before being set on their respective models.  

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

Returns each model's data objects in a new array.

## Utility instance methods

### at
```js
at: Model (index: number)
```

Returns the model at a given index in the collection. Index can be negative to count backwards from the end.

### filter
```js
filter: Array<Model> (predicate: function)
```

Same signature as Array.prototype.filter across a collection's models.  

### find
```js
find: Model? (predicate: function)
```

Same signature as Array.prototype.find across a collection's models.  

### findWhere
```js
findWhere: Model? (attrs: object)
```

Returns the model matching the attributes passed in, or undefined if no match is found. Like `.find` but a shorthand that uses matching attribute values instead of a predicate function.

### map
```js
map: Array<any> (predicate: function)
```

Same signature as Array.prototype.map across a collection's models.

### pluck
```js
pluck: Array<any> (attribute: string)
```

Returns a list of the specified attribute value for all models.

### slice
```js
slice: Array<Model> (startIndex:number[, endIndex: number])
```

Same signature as Array.prototype.slice across a collection's models.

### where
```js
where: Array<Model> (attrs: object)
```

Returns a list of models matching the data values passed in. Like `.filter` but a shorthand that uses matching data values instead of a predicate function.
