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

### static cacheFields
### static idAttribute
### static defaults

## Methods

### toJSON
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
