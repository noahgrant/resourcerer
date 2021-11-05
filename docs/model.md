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
```js
get: any (attribute: string)
```

Returns the value at the given attribute key.

### has
```js
has: boolean (attribute: string)
```

Returns true if the model has a defined value at the given attribute key

### isNew
```js
isNew: boolean ()
```

By default, a model is considered 'new' if it does not have an id (or a value at the [`idAttribute`](#static-idattribute) proeprty. It is used to determine:

1. Whether to send a POST (new) or a PUT (not new) request when calling [`.save()`](#save)
2. Whether to send a request at all when calling [`.destroy()`](#destroy)

Use this to your advantage when you inevitably come across some orphan endpoints that are not super REST-y. Override your Model class to force all `.save` calls to POST by, for example:

```js
isNew() {
  // will always POST
  return true;
}
```

### parse
```js
parse: object (response: any)
```

This method takes in the raw server data response and should return the data in the form that should be set on the Model. It defaults to the identity function, which might suffice for many endpoints. Override this for your custom needs. For example, maybe your server overly-nests the resource in a `schema` property:

```js
parse(response) {
  return response.data.schema;
}
```

### set
```js
set: Model (attributes: object, options: object)
```

This is the main avenue by which a model's properties get values assigned. It's called internally by several public methods, including `save`, `unset`, and `clear`. Pass a `silent: true` option for this not to trigger a re-render for subscribed components.

### unset
```js
unset: Model (attribute: string, options: object)
```

Removes the attribute from the model's data. Pass a `silent: true` option for this not to trigger a re-render for subscribed components.

### clear
```js
clear: Model (options: object)
```

Removes all attributes from the model. Pass a `silent: true` option for this not to trigger a re-render for subscribed components.

### pick
```js
pick: object (...attributes: Array<string>)
```

Handy helper method to only return a subset of a model's attributes, as opposed to the whole thing like [`.toJSON()`](#tojson) does.

### save
```js
save: Promise<[Model, Response]> (attributes: object, options: object)
```

Use this to persist data mutations to the server. If [`.isNew()`](#isnew) is true, the request will be sent as a POST. Otherwise, it will be sent as a PUT with the whole resource, or a PATCH with only `attributes` sent over if the `patch: true` option is passed. When the request returns, the server data is passed through the [`.parse()`](#parse) method before being set on the model. Pass the `wait: true` option to wait to add the data until after the server responds. Subscribed components will update when the new entry is added as well as when the request returns. If the request errors, all changes will be reverted and components updated.

***All .save() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***

### destroy
```js
destroy: Promise<[Model, Response]> (options: object)
```

Use this to remove the send a DELETE request at this model's url (`/base/path/${model.id}`) to the server. The model is removed from its collection if it belongs to one. If [`.isNew()`](#isnew) is false (signifying that the model was never persisted in the first place), a request is not sent, but the model is still removed from its collection. Pass the `wait: true` option to wait to remove the model until after the server responds. Subscribed components will update when the model is removed. If the request errors, the model will get added back to its collection and components will get updated.

***All .destroy() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.*** 

### fetch
```js
fetch: Promise<[Model, Response]> (options: Object)
```

This is the method that `resourcerer` uses internally to get server data and set its parsed response as models on the collection. This should rarely need to be used in your application. Subscribed components will update when the request returns.

***All .fetch() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***
