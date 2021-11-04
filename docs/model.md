# Model

A model is a client-side abstraction for a latest-saved server state of an object (a collection, by contrast, represents a list of models). A model _must_ have one thing:
a `url`. This can come in several forms:

* a string literal

```js
class MyModel extends Model {
  url = '/endpoint'
}
```

* a function

```js
class MyModel extends Model {
  url() {
    return '/endpoint';
  }
}
```

* from the model's collection. in this case, no `url` property on the model is needed, and the model's id will be URL-encoded and appended to the collection's url.

* a `urlRoot` property. use this when a model is not part of a collection but when passed an id, you'd still like the id to be URL-encoded and appended to the root.

```js
class MyModel extends Model {
  // with an id of '12345', requests will be made to /endpoint/12345.
  urlRoot() {
    return '/endpoint';
  }
}
```

A model instance of the class created and registered in your [resourcerer config]() will be returned by every `useResources` call that uses its model key. You can read simply from it
by using `Model#toJSON` (the most common usage), but there are several other methods and properties in its interface you can customize in your collection definition or
that you might find useful in rendering your data-hydrated components.

## Properties

### `static` cacheFields
`Array<string|function>`

This property tells resourcerer how to determine whether to make a new request or to take a model out of the cache. It is an array of strings or functions from which its cache key is calculated. See the [cacheKey](https://github.com/noahgrant/resourcerer#caching-resources-with-modelcache) section for more info.

### `static` idAttribute
`string`. Default: `'id'`.  

Override this to be the property name of the Model's unique identifier if it something other than `'id'`. Each model instance will get an `id` instance property that will be equal to that value. i.e. if the Model class has `static idAttribute = 'email'` and the Model is instantiated with `{email: 'noah@gmail.com'}`, then `model.id === 'noah@gmail.com'`.

### `static` defaults
`object|function`

An object or function that returns object with attribute keys and their default values. If set, then when the model is instantiated, any missing attributes get set to these values.



## Methods

### constructor

```js
constructor: void (attributes: Object, options: object)
```

The Model's constructor gets passed any initial attributes, as well as the options from the executor function. Override this to set some instance variables for the model, which is really useful for url path parameters. Just be sure to pass the arguments to its `.super()` call, as well:

```js
class MyModel extends Model {
  constructor(attributes, options={}) {
    super(attributes, options);
    
    this.category = options.category;
  }
  
  url() {
    return `/todos/${this.category}/${this.id}`;
  }
}
```

Note that `this.id` is automatically set to whichever value is passed in at the `idAttribute` key (default: 'id'). Pass the `parse: true` option to have the attributes get run through the Model's `parse` method before getting set.


### toJSON
```js
toJSON: Object ()
```

Returns the model's data attributes in a new object.

### get
### has
### set
### unset
### clear
### fetch
### save
### destroy
### parse
### pick
### isNew
