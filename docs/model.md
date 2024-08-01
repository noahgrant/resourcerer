# Model

A model is a client-side abstraction for a latest-saved server state of an object (a collection, by contrast, represents a list of models). A model _must_ have one thing:
a `url`. This can come in several forms:

* a string literal

```ts
class MyModel extends Model<ModelType> {
  url = '/endpoint'
}
```

* a function

```ts
class MyModel extends Model<ModelType> {
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

A model instance of the class created and registered in your [resourcerer config](https://github.com/noahgrant/resourcerer#nomenclature) will be returned by every `useResources` call that uses its model key. You can read simply from it
by using [Model#toJSON](#tojson) (the most common usage), but there are several other methods and properties in its interface you can customize in your collection definition or
that you might find useful in rendering your data-hydrated components.

## Properties

### `static` dependencies
`Array<string | function>`

This property tells resourcerer how to determine whether to make a new request or to take a model out of the cache. It is an array of strings or functions from which its cache key is calculated. See the [cacheKey](https://github.com/noahgrant/resourcerer#caching-resources-with-modelcache) section for more info.

### `static` cacheTimeout
`number`

The number of milliseconds to keep all models of this class in the cache after all client components stop referencing it. Note that this is on a model _class_ basis and not an _instance_ basis because the latter can introduce race conditions into your application.

### `static` idAttribute
`string`. Default: `'id'`.  

Override this to be the property name of the Model's unique identifier if it something other than `'id'`. Each model instance will get an `id` instance property that will be equal to that value. i.e. if the Model class has `static idAttribute = 'email'` and the Model is instantiated with `{email: 'noah@gmail.com'}`, then `model.id === 'noah@gmail.com'`.

### `static` defaults
`Record<string, any>` | () => Record<string, any>`

An object or function that returns object with attribute keys and their default values. If set, then when the model is instantiated, any missing data get set to these values.

### `static` measure
`boolean | (obj: ResourceConfigObject) => boolean)`

A boolean or function that accepts a [resource configuration object](https://github.com/noahgrant/resourcerer#nomenclature) and returns a boolean, telling resourcerer to track this model's request time and report it via the `track` method setup in [configuration](https://github.com/noahgrant/resourcerer#configuring-resourcerer).



## Methods

### constructor

```js
constructor: (initialData: object, options: object) => void
```

The Model's constructor gets passed any initial data, as well as the [options](https://github.com/noahgrant/resourcerer#options) from the executor function. Override this to add some custom logic or instance variables for the model&mdash;just be sure to pass the arguments to its `.super()` call, as well:

```ts
class MyModel extends Model<ModelType> {
  constructor(initialData, options={}) {
    super(initialData, options);
    
    // custom logic
  }
  
  url({category}) {
    return `/todos/${category}/${this.id}`;
  }
}
```

Note that `this.id` is automatically set to whichever value is passed in at the [`idAttribute`](#static-idattribute) key (default: 'id'). Pass the `parse: true` option to have the data get run through the Model's `parse` method before getting set. Other [options](https://github.com/noahgrant/resourcerer#options) fields from the executor function are passed to the `url` as shown in the example above.


### toJSON
```js
toJSON: Object ()
```

Returns the model's data in a new object.

### get
```js
get: (attribute: keyof ModelType) => ModelType[keyof ModelType]
```

Returns the value at the given attribute key.

### has
```js
has: (attribute: string) => boolean
```

Returns true if the model has a defined value at the given attribute key

### isNew
```js
isNew: () => boolean
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
parse: (response: any) => ModelType
```

This method takes in the raw server data response and should return the data in the form that should be set on the Model. It defaults to the identity function, which might suffice for many endpoints. Override this for your custom needs. For example, maybe your server overly-nests the resource in a `schema` property:

```js
parse(response) {
  return response.data.schema;
}
```

### set
```js
set: (data: object, options: object) => this
```

This is the main avenue by which a model's properties get values assigned. It's called internally by several public methods, including `save`, `unset`, and `clear`. Pass a `silent: true` option for this not to trigger a re-render for subscribed components.

### unset
```js
unset: (attribute: string, options?: {silent: boolean}) => this
```

Removes the attribute from the model's data. Pass a `silent: true` option for this not to trigger a re-render for subscribed components.

### clear
```js
clear: (options?: {silent: boolean}) => this
```

Removes all data from the model. Pass a `silent: true` option for this not to trigger a re-render for subscribed components.

### pick
```js
pick: <K extends keyof ModelType>(...data: K[]) => Record<K, ModelType[K]>
```

Handy helper method to only return a subset of a model's data, as opposed to the whole thing like [`.toJSON()`](#tojson) does.

### save
```js
save: (attrs: Partial<ModelType>, options?: {wait?: boolean; patch?: boolean}) => Promise<[Model, Response]>
```

Use this to persist data mutations to the server. If [`.isNew()`](#isnew) is true, the request will be sent as a POST. Otherwise, it will be sent as a PUT with the whole resource, or a PATCH with only `data` sent over if the `patch: true` option is passed. When the request returns, the server data is passed through the [`.parse()`](#parse) method before being set on the model. Pass the `wait: true` option to wait to add the data until after the server responds. Subscribed components will update when the new entry is added as well as when the request returns. If the request errors, all changes will be reverted and components updated.

***All .save() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***

### destroy
```js
destroy: (options?: {wait: true; silent: true}) => Promise<[Model, Response]> 
```

Use this to remove the send a DELETE request at this model's url to the server. The model is removed from its collection if it belongs to one. If [`.isNew()`](#isnew) is false (signifying that the model was never persisted in the first place), a request is not sent, but the model is still removed from its collection. Pass the `wait: true` option to wait to remove the model until after the server responds. Subscribed components will update when the model is removed. If the request errors, the model will get added back to its collection and components will get updated.

***All .destroy() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.*** 

### fetch
```js
fetch: (options: Object) => Promise<[Model, Response]> 
```

This is the method that `resourcerer` uses internally to get server data and set its parsed response as models on the collection. This should rarely need to be used in your application. Subscribed components will update when the request returns.

***All .fetch() calls must have a .catch attached, even if the rejection is swallowed. Omitting one risks an uncaught Promise rejection exception if the request fails.***
