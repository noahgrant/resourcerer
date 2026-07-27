# Contributing to `resourcerer`

Please use the following guidelines when contributing to this repository:

* Use GitHub issues to report bugs and feature requests. For help debugging, please use StackOverflow.

* Pull requests should be made to `main`. Before sending one for a feature or bug fix, be sure to add [tests](#tests). Please update documentation when your change affects the public API or documented behavior.

* Use the same coding style as the rest of the codebase; besides passing tests, all changes must also pass style checks.


## Conduct
See our [Code of Conduct](https://github.com/noahgrant/resourcerer/CODE_OF_CONDUCT.md) page.


## Clone the repo
To get started in development, clone the repository and install dependencies:

```sh
$ git clone git@github.com:noahgrant/resourcerer.git
$ cd resourcerer
$ npm i
```


## Tests
Tests run with [Vitest](https://vitest.dev/). Trigger them with:

`$ npm test`

You can run the TypeScript typechecker with:

`$ npm run typecheck`

You can run the linter with:

`$ npm run lint`

To run typecheck, tests, and lint together:

`$ npm run checks`

For a watch mode during development:

`$ npm run test:watch`
