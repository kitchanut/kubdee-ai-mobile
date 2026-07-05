import type { ColorValue } from 'react-native';

export interface KubdeeTheme {
  isDark: boolean;
  screen: string;
  panel: string;
  panelMuted: string;
  card: string;
  cardMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  input: string;
  tabBar: string;
  active: string;
  shadow: string;
  blue: string;
  orange: string;
  orangeSoft: string;
  emerald: string;
  emeraldSoft: string;
  cyan: string;
  cyanSoft: string;
  amber: string;
  amberSoft: string;
  red: string;
  redSoft: string;
  white: string;
}

export const darkTheme: KubdeeTheme = {
  isDark: true,
  screen: '#0f1720',
  panel: '#1f2937',
  panelMuted: '#111827',
  card: '#273244',
  cardMuted: '#374151',
  border: '#374151',
  borderStrong: '#4b5563',
  text: '#f9fafb',
  textMuted: '#d1d5db',
  textSubtle: '#9ca3af',
  input: '#111827',
  tabBar: '#111827',
  active: '#374151',
  shadow: '#000000',
  blue: '#60a5fa',
  orange: '#fb923c',
  orangeSoft: 'rgba(251, 146, 60, 0.15)',
  emerald: '#34d399',
  emeraldSoft: 'rgba(52, 211, 153, 0.14)',
  cyan: '#22d3ee',
  cyanSoft: 'rgba(34, 211, 238, 0.14)',
  amber: '#fbbf24',
  amberSoft: 'rgba(251, 191, 36, 0.14)',
  red: '#f87171',
  redSoft: 'rgba(248, 113, 113, 0.14)',
  white: '#ffffff',
};

export const lightTheme: KubdeeTheme = {
  isDark: false,
  screen: '#f3f4f6',
  panel: '#ffffff',
  panelMuted: '#f3f4f6',
  card: '#ffffff',
  cardMuted: '#f9fafb',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  text: '#111827',
  textMuted: '#374151',
  textSubtle: '#6b7280',
  input: '#ffffff',
  tabBar: '#f3f4f6',
  active: '#ffffff',
  shadow: '#111827',
  blue: '#2563eb',
  orange: '#ea580c',
  orangeSoft: '#fff7ed',
  emerald: '#059669',
  emeraldSoft: '#ecfdf5',
  cyan: '#0891b2',
  cyanSoft: '#ecfeff',
  amber: '#d97706',
  amberSoft: '#fffbeb',
  red: '#dc2626',
  redSoft: '#fef2f2',
  white: '#ffffff',
};

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  xxl: 14,
};

export const spacing = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 16,
};

export const typography = {
  tiny: 9,
  micro: 10,
  caption: 11,
  body: 12,
  subtitle: 13,
  label: 14,
  title: 18,
};

export const alpha = (color: ColorValue, opacity: number): string =>
  typeof color === 'string' && color.startsWith('#')
    ? `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`
    : String(color);
