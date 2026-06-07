module.exports = function (api) {
  api.cache(true);

  const nativeWindConfig = require('nativewind/babel')();

  return {
    presets: ['babel-preset-expo'],
    plugins: nativeWindConfig.plugins,
  };
};
