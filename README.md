# with-resources

### Tests
The `with-resources` package is written in ESNext and will rely on users' build systems to transpile into appropriate JavaScript. There
is a webpack and babel build for testing purposes via [karma](https://karma-runner.github.io), and can be triggered with:

`$ npm test`

This will build and transpile the files, run the tests, and then finally run the linter.
