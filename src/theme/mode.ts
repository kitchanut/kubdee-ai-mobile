import type { ColorSchemeName } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = 'light' | 'dark';

export const THEME_MODE_SEQUENCE: ThemeMode[] = ['system', 'light', 'dark'];

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveThemeMode(mode: ThemeMode, colorScheme: ColorSchemeName): ResolvedThemeMode {
  if (mode !== 'system') {
    return mode;
  }

  return colorScheme === 'light' ? 'light' : 'dark';
}

export function getThemeModeLabel(mode: ThemeMode, resolvedMode: ResolvedThemeMode): string {
  if (mode === 'system') {
    return `ระบบ (${resolvedMode === 'dark' ? 'มืด' : 'สว่าง'})`;
  }

  return mode === 'dark' ? 'มืด' : 'สว่าง';
}
