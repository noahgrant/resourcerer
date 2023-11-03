# Using resourcerer with TypeScript

_Note: TypeScript support is in beta. Please file any bugs._

Resourcerer is ⚡⚡⚡ with TypeScript, but requires one extra step in your config file:

```ts
// js/core/resourcerer-config.ts
import {ModelMap} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';
import UserTodosCollection from 'js/models/users-todos-collection';

/**
 * Because the ModelMap is populated in user-land, we have to annotate its types here, as well.
 * Add your model types to this interface declaration, which will be merged with the interface
 * in the library.
 *
 * I wish we didn't have to do this duplication, and maybe there's a way to do it without, but
 * I am not good enough at TypeScript to figure it out myself. If you can, please submit a PR!
 */
declare module 'resourcerer' {
  export interface ModelMap {
    todos: new () => TodosCollection,
    userTodos: new () => UserTodosCollection,
    // ...etc
  }
}

/ now add your models to the model map as normal
ModelMap.add({
  todos: TodosCollection,
  userTodos: UserTodosCollection,
  // ...etc
});
```

Note that you no longer need to add a resource key like `USER_TODOS` in the ModelMap, which would normally get
auto-magically turned into the camelCase `userTodos`. Since TypeScript will enforce correctness, you can just
use the string literal `userTodos` instead.

When defining your models, you can add schemas as generic types:

```ts
// js/models/todos-collection.ts
import {Collection} from 'resourcerer';

interface Todo {
  id: string;
  name: string;
}

export default TodosCollection extends Collection<Todo> {
  url() {
    return '/todos';
  }
}
```

and now you can use it in your components!

```tsx
import {type ExecutorFunction, useResources} from 'resourcerer';

// you don't need to worry about resourceKeys anymore, you can just use the
// string literal! TypeScript will enforce correctness
const getResources: ExecutorFunction = (resourceKeys, props) => ({todos: {}});

function MyComponent(props) {
  const {
    isLoading,
    hasErrored,
    hasLoaded,
    // type: TodosCollection
    todosCollection
  } = useResources(getResources, props);

  return (
    <div className='MyComponent'>
      {isLoading ? <Loader /> : null}

      {hasErrored ? <ErrorMessage /> : null}

      {hasLoaded ? (
        <ul>
          {/** id and name are registered as string types, hurray! */}
          {todosCollection.toJSON().map(({id, name}) => (
            <li key={id}>{name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```
