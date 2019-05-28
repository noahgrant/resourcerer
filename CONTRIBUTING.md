# Contributing to `with-resources`

Please use the following guidelines when contributing to this repository:

* Use github issues to report bugs and feature requests. For help debugging, please use StackOverflow.

* Pull requests should be made to master. Before sending one for a feature or bug fix, be sure to add [tests](#tests). Don't bother with documentation; we'll add it before we release.

* Use the same coding style as the rest of the codebase; besides passing tests, all changes must also pass style checks.


## Conduct
See our [Code of Conduct](https://github.com/SiftScience/with-resources/CODE_OF_CONDUCT.md) page.  


## Clone the repo
To get started in development, clone the repository and install dependencies:
  
```sh
$ git clone git@github.com:SiftScience/with-resources.git
$ cd with-resources
$ npm i
```


## Tests
There is a webpack and babel build for testing purposes via karma, and can be triggered with:

`$ npm test`

This will build and transpile the files, and then run the tests. You can run the linter with:

`$ npm run lint`

To run both at once, you can run:

`$ npm run checks`
