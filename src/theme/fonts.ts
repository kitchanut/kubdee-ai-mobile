import type { TextStyle } from 'react-native';

export type FontScript = 'latin' | 'thai';

type FontWeightKey = 'regular' | 'medium' | 'semiBold' | 'bold' | 'extraBold' | 'black';

export const kubdeeFontFamilies: Record<FontScript, Record<FontWeightKey, string>> = {
  latin: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extraBold: 'Inter_800ExtraBold',
    black: 'Inter_900Black',
  },
  thai: {
    regular: 'NotoSansThai_400Regular',
    medium: 'NotoSansThai_500Medium',
    semiBold: 'NotoSansThai_600SemiBold',
    bold: 'NotoSansThai_700Bold',
    extraBold: 'NotoSansThai_800ExtraBold',
    black: 'NotoSansThai_900Black',
  },
};

export function isThaiCharacter(character: string): boolean {
  return /[\u0E00-\u0E7F]/.test(character);
}

function normalizeFontWeight(fontWeight: TextStyle['fontWeight']): number {
  if (typeof fontWeight === 'number') {
    return fontWeight;
  }

  if (fontWeight === 'bold') {
    return 700;
  }

  if (typeof fontWeight === 'string') {
    const parsed = Number.parseInt(fontWeight, 10);
    return Number.isNaN(parsed) ? 400 : parsed;
  }

  return 400;
}

function getWeightKey(fontWeight: TextStyle['fontWeight']): FontWeightKey {
  const weight = normalizeFontWeight(fontWeight);

  if (weight >= 900) return 'black';
  if (weight >= 800) return 'extraBold';
  if (weight >= 700) return 'bold';
  if (weight >= 600) return 'semiBold';
  if (weight >= 500) return 'medium';
  return 'regular';
}

export function getKubdeeFontFamily(script: FontScript, fontWeight: TextStyle['fontWeight']): string {
  return kubdeeFontFamilies[script][getWeightKey(fontWeight)];
}
