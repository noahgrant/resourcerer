# Using resourcerer with TypeScript

1. Resourcerer is ⚡⚡⚡ with TypeScript, but requires one extra step in your config file:

```ts
// js/core/resourcerer-config.ts
import {register} from 'resourcerer';
import TodosCollection from 'js/models/todos-collection';
import UserTodosCollection from 'js/models/users-todos-collection';

/**
 * Because we `register` the ModelMap is populated in user-land, we have to annotate its types
 * here, as well. Add your model types to this interface declaration, which will be merged with
 * the interface in the library.
 */
declare module 'resourcerer' {
  export interface ModelMap {
    todos: new () => TodosCollection,
    userTodos: new () => UserTodosCollection,
    // ...etc
  }
}

// now register your models as normal
register({
  todos: TodosCollection,
  userTodos: UserTodosCollection,
  // ...etc
});
```


2. When defining your models, you can add schemas as generic types:

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

const getResources = (props) => ({todos: {}});

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
