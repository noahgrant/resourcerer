# Migrating to v2.0

The core methodology and functionality of `resourcerer` has not changed in version 2.0, but many of the APIs have. Here is a list of the changes:

1. `ModelMap#add` has been removed. Import `register` from `resourcerer` instead.

1. There are no longer any `ResourceKeys` that are separate from the keys set on the `ModelMap`. They are one and the same:

     ```js
     // previous
     ResourceKeys.add({
       TODOS: "todos",
     });

     ModelMap.add({ [ResourceKeys.TODOS]: TodosCollection });

     // now
     register({
       // `todos` is the resource key you will use in useResources Executor Functions
       todos: TodosCollection,
     });
     ```

  Typescript will ensure that your resource keys are consistent when using `useResources`. If you're not using Typescript, you'll have to manage this yourself.

  Many other 2.0 changes stem from this change.

1. [ExecutorFunctions](/#nomenclature) only take a single argument, the `props` argument. Previously, the first argument was the `ResourceKeys` object.

1. `static cacheFields` in Models and Collections have been removed. Use `static dependencies` instead.

1. `static modelIdAttribute` on a Collection, which changed the data attribute demarcating uniqueness in the Collection's models without having to create a new model, has been renamed to just `static idAttribute`, the same as on the Model itself.

1. In the [Resource Configuration Object](/#nomenclature), the `options` property has been renamed to `path`, since it is effectively only used to provide values to url path parameters.

1. The utility methods `haveAllLoaded`, `areAnyLoading`, and `haveAnyErrored` have been placed under a top-level `Utils` object and are now named `Utils.hasLoaded`, `Utils.isLoading`, and `Utils.hasErrored`, resepectively, to provide consistency with other loading state names. Their signatures have not changed.

1. The [refetch](/#refetching) method returned from `useResources` no longer accepts a function as an argument. Pass an array of resource keys directly instead:

    ```js
    // previously
    refetch(({todos}) => [todos]);

    // now
    refetch([todos]);
    ```

1. [dependsOn](/#serial-requests) is no longer an array of strings that checks existence of prop fields. To be more versatile, it is a boolean, and will fetch the resource whenever its conditions evaluate to true:

    ```js
    // previously
    dependsOn: ["userId"]

    // now
    dependsOn: !!props.userId
    ```

1. [provides](/#serial-requests) is now just a function that returns an object, which can add as multiple values to component state simultaneously:

    ```js
    // previously
    provides: {userId: (queueItemModel) => queueItemModel.get('userId')}

    // now
    provides: (queueItemModel) => ({userId: queueItemModel.get('userId')})
    ```

  As such, the special spread character has been removed.

1. `providesModels`, which turned arbitraray data into a listenable model, has been removed.

1. The configuration option `queryParamsPropName`, which auto-flattened url parameters nested within a prop, has been removed.
