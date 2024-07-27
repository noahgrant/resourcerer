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
import {useResources} from 'resourcerer';

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


3. You get the best built-in type hints when you inline the `getResources` function:

    ```tsx
    function MyComponent() {
      const {
        isLoading,
        hasErrored,
        hasLoaded,
        // ERROR: property tdoosCollection does not exist on...
        tdoosCollection
      // ERROR Property ogrdI does not exist on type...
      } = useResources(({orgId}) => ({todos: {params: {orgId}}}), {ogrdI: "oops"});
    ```

   But inlining executor functions leaves you susceptible to [the subtle bug where you are always reading from current props](https://github.com/noahgrant/resourcerer/tree/typescript?tab=readme-ov-file#differences-between-useresources-and-withresources). Executor functions can also get pretty involved, so it's nice to extract it. You still get good type hints, but you'll need to type out your props:

    ```tsx
    // type out these props
    const getResources = (props: {orgId: string}) => ({todos: {params: {orgId}}});
    
    function MyComponent() {
      const {
        isLoading,
        hasErrored,
        hasLoaded,
        // ERROR: property tdoosCollection does not exist on...
        tdoosCollection
      // ERROR no overload matches this call...
      // since ogrdI is being passed when we expect orgId
      } = useResources(getResources, {ogrdI: "oops"});
    ```

    Using this method, the only drawback is that you don't get type hints for the ResourceKeys like `todos`. If you want to add those, you'll have to import the `ExecutorFunction` type and pass the list of ResourceKeys:

     ```tsx
    import {type ExecutorFunction, useResources} from 'resourcerer';

    // "todos" and "todoItem" will come up as type hints, both as the type parameters and the Resource Config Object keys
    const getResources: ExecutorFunction<"todos" | "todoItem", {orgId: string}> = (props) => ({
       todos: {params: {orgId}},
       todoItem: {}
    });
    
    function MyComponent() {
      const {
        isLoading,
        hasErrored,
        hasLoaded,
        // ERROR: property tdoosCollection does not exist on...
        tdoosCollection
      // ERROR no overload matches this call...
      // since ogrdI is being passed when we expect orgId
      } = useResources(getResources, {ogrdI: "oops"});
    ```

     Up to you how you want your types!
