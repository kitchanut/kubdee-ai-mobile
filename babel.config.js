module.exports = function (api) {
  api.cache(true);

  const nativeWindConfig = require('nativewind/babel')();

  return {
    // NativeWind's babel plugin wraps every JSX element with its css
    // interop, which silently drops function-form style props on
    // Pressable. With it enabled, Pressable MUST use className +
    // active:/disabled: variants — never style={({ pressed }) => ...}.
    presets: ['babel-preset-expo'],
    plugins: nativeWindConfig.plugins,
  };
};
