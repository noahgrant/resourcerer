module.exports = {
  mode: 'production',
  entry: './lib/with-resources.jsx',
  externals: ['react', 'schmackbone', 'underscore', 'qs'],
  module: {
    rules: [{
      test: /\.jsx?$/,
      exclude: /node_modules/,
      use: {
        loader: 'babel-loader?cacheDirectory=true',
        options: {
          presets: [['@babel/env', {targets: {chrome: '67'}, modules: 'cjs'}], '@babel/react'],
          plugins: [['@babel/proposal-decorators', {legacy: true}]],
          ignore: ['node_modules/**']
        }
      }
    }, {
      test: /schmackbone.js$/,
      use: 'imports-loader?define=>false'
    }]
  }
};
