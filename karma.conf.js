module.exports = (config) => {
  config.set({
    browsers: ['ChromeCustom'],
    customLaunchers: {
      ChromeCustom: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox']
      }
    },
    client: {captureConsole: false},
    files: ['test/setup.js'],
    frameworks: ['jasmine'],
    plugins: [
      'karma-chrome-launcher',
      'karma-jasmine',
      'karma-jasmine-html-reporter',
      'karma-webpack'
    ],
    port: 9876,
    preprocessors: {
      'lib/*.js*': ['webpack'],
      'test/*.js*': ['webpack']
    },
    reporters: ['progress', 'kjhtml'],
    singleRun: true,
    webpack: {
      mode: 'development',
      module: {
        rules: [{
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {loader: 'babel-loader?cacheDirectory=true'}
        }]
      }
    }
  });
};
