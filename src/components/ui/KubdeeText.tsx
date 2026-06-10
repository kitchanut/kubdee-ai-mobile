import { cssInterop } from 'nativewind';
import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { StyleSheet, Text as NativeText } from 'react-native';
import type { TextProps, TextStyle } from 'react-native';

import { getKubdeeFontFamily, isThaiCharacter } from '@/theme/fonts';
import type { FontScript } from '@/theme/fonts';

interface TextRun {
  script: FontScript;
  text: string;
}

function splitByScript(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let currentScript: FontScript | null = null;
  let currentText = '';

  for (const character of text) {
    const nextScript: FontScript = isThaiCharacter(character) ? 'thai' : 'latin';

    if (!currentScript) {
      currentScript = nextScript;
      currentText = character;
      continue;
    }

    if (nextScript === currentScript || /\s/.test(character)) {
      currentText += character;
      continue;
    }

    runs.push({ script: currentScript, text: currentText });
    currentScript = nextScript;
    currentText = character;
  }

  if (currentScript && currentText) {
    runs.push({ script: currentScript, text: currentText });
  }

  return runs;
}

function renderMixedChild(child: ReactNode, key: string, fontWeight: TextStyle['fontWeight']): ReactNode {
  if (typeof child === 'string' || typeof child === 'number') {
    return splitByScript(String(child)).map((run, index) => (
      <NativeText
        key={`${key}-${index}`}
        style={{
          fontFamily: getKubdeeFontFamily(run.script, fontWeight),
        }}
      >
        {run.text}
      </NativeText>
    ));
  }

  if (Array.isArray(child)) {
    return child.map((item, index) => (
      <Fragment key={`${key}-${index}`}>{renderMixedChild(item, `${key}-${index}`, fontWeight)}</Fragment>
    ));
  }

  return child;
}

export default function KubdeeText({ children, style, ...props }: TextProps): React.JSX.Element {
  const flattenedStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontWeight = flattenedStyle?.fontWeight;
  const { fontFamily: _fontFamily, fontWeight: _fontWeight, ...textStyle } = flattenedStyle ?? {};

  return (
    <NativeText {...props} style={[textStyle, { fontFamily: getKubdeeFontFamily('latin', fontWeight) }]}>
      {renderMixedChild(children, 'text', fontWeight)}
    </NativeText>
  );
}

// Resolve className into the style prop so the Thai/Latin font-weight
// detection above keeps working with NativeWind utilities like
// font-semibold or text-kd-body.
cssInterop(KubdeeText, { className: 'style' });
