# with-resources

![CircleCI](https://circleci.com/gh/SiftScience/with-resources/tree/master.svg?style=svg&circle-token=45a34426d0ed2c954ed07b8ce27248aa6f93cb06)

The `with-resources` package is written in ESNext and will rely on users' build systems to transpile into appropriate JavaScript.
**This package does employ [legacy, Stage-1 decorators](https://github.com/tc39/proposal-decorators/blob/master/previous/METAPROGRAMMING.md),
and you may need to update your [babel config](https://babeljs.io/docs/en/babel-plugin-proposal-decorators#legacy) appropriately in order to successfully transpile it.**

### Tests
There is a webpack and babel build for testing purposes via [karma](https://karma-runner.github.io), and can be triggered with:

`$ npm test`

This will build and transpile the files, and then run the tests. You can run the linter with:

`$ npm run lint`

To run both at once, you can run:

`$ npm run checks`
