const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// inlineRem 16 keeps Tailwind's standard 4px-per-unit scale (h-8 = 32,
// gap-2 = 8). NativeWind's default is 14, which silently shrinks every
// rem-based utility by 12.5% vs the original StyleSheet design.
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
