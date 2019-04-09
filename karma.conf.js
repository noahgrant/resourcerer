module.exports = (config) => {
  config.set({
    basePath: './',
    browsers: ['ChromeCustom'],
    customLaunchers: {
      ChromeCustom: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox']
      }
    },
    client: {captureConsole: false},
    files: [
      'lib/*.js',
      'test/*.js'
    ],
    frameworks: ['jasmine'],
    plugins: [
      'karma-chrome-launcher',
      'karma-jasmine',
      'karma-jasmine-html-reporter',
      'karma-babel-preprocessor',
      'karma-webpack'
    ],
    port: 5324,
    preprocessors: {
      'lib/*.js': ['babel', 'webpack'],
      'test/*.js': ['babel', 'webpack']
    },
    babelPreprocessor: {
      options: {
        presets: ['@babel/react'],
        plugins: [
          ['@babel/proposal-decorators', {legacy: true}]
        ],
        ignore: ['node_modules/**']
      }
    },
    reporters: ['progress', 'kjhtml'],
    singleRun: true,
    webpack: {
      entry: './lib/index.js',
      mode: 'production',
      module: {
        rules: [{
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: 'babel-loader?cacheDirectory=true'
        }, {
          test: /backbone.js$/,
          use: 'imports-loader?define=>false'
        }]
      }
    }
  });
};
