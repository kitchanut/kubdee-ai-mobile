import { useColorScheme } from 'nativewind';

import type { KubdeeTheme } from '@/theme/tokens';
import { darkTheme, lightTheme } from '@/theme/tokens';

/**
 * Compat hook for values className cannot express (lucide icon color
 * props, SVG gradient stops, shadowColor, StatusBar style). Follows
 * the NativeWind color scheme, so it stays in sync with dark: variants.
 */
export function useKubdeeTheme(): KubdeeTheme {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'light' ? lightTheme : darkTheme;
}
