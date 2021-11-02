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

A collection instance of the class created and registered in your [resourcerer config]() will be returned by every `useResources` call that uses its model key from the [ModelMap](). You can read simply from it
by using `Collection#toJSON` (the most common usage), but there are several other methods and properties in its interface you can customize in your collection definition or
that you might find useful in rendering your data-hydrated components.

## Properties

### comparator
### length
### static Model
### static cacheFields

## Methods

### add
### constructor
### create
### fetch
### get
### has
### modelId
### parse
### remove
### reset
### set
### sync
### toJSON

### Utility methods

#### at
#### filter
#### find
#### findWhere
#### map
#### pluck
#### slice
#### where
