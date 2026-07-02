import type { Category, PromptCatalog } from '@/autopilot/promptCatalog/types';
import { categoryOptions } from '@/autopilot/promptCatalog/types';

export interface BuildProduct {
  name?: string;
  description?: string;
  productUrl?: string;
  imagePath?: string;
  imageUrl?: string;
  caption?: string;
  hashtags?: string;
  cta?: string;
  hasReference?: boolean;
}

export type BuildSettings = Record<string, string | string[] | number | boolean | null | undefined>;

const CUSTOM_TOKENS = new Set(['custom', '__custom__']);
const EMPTY_TOKENS = new Set(['', 'auto']);
const FALLBACK_OPTION_PROMPTS: Record<string, string> = {
  ภาพถ่ายจากมือถือ:
    'ภาพถ่ายด้วยมือถือ iPhone รายละเอียดชัดสมจริง โฟกัสคมชัด สีและแสงเป็นธรรมชาติ มุมมองคนใช้งานจริงแบบ casual snapshot ไม่จัดไฟสตูดิโอ ไม่แต่งภาพหนัก ให้ความรู้สึกเหมือนรีวิวสินค้าในชีวิตประจำวัน',
  'ภาพถ่ายด้วยมือถือ iPhone รายละเอียดชัดสมจริง':
    'ภาพถ่ายด้วยมือถือ iPhone รายละเอียดชัดสมจริง โฟกัสคมชัด สีและแสงเป็นธรรมชาติ มุมมองคนใช้งานจริงแบบ casual snapshot ไม่จัดไฟสตูดิโอ ไม่แต่งภาพหนัก ให้ความรู้สึกเหมือนรีวิวสินค้าในชีวิตประจำวัน',
};

function resolveCategory(category: Category, settings: BuildSettings): string {
  const value = settingValue(settings[category.settingsKey]);
  if (EMPTY_TOKENS.has(value)) {
    return '';
  }

  if (CUSTOM_TOKENS.has(value)) {
    return settingValue(settings[`${category.settingsKey}Custom`]);
  }

  const option = categoryOptions(category).find((item) => item.value === value);
  return option ? option.prompt || option.value : FALLBACK_OPTION_PROMPTS[value] || value;
}

function settingValue(value: string | string[] | number | boolean | null | undefined): string {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved == null ? '' : String(resolved);
}

export function buildPrompt(
  step: 'image' | 'video',
  settings: BuildSettings,
  product: BuildProduct,
  catalog: PromptCatalog
): string {
  const promptMode = settingValue(settings.promptMode) || 'auto';
  const chainKey = `${step}_${promptMode === 'custom' ? 'custom' : 'auto'}`;
  const chain = catalog.assembly.find((item) => item.key === chainKey);
  if (!chain) {
    return '';
  }

  const context: Record<string, string> = {
    product_name: product.name || 'สินค้า',
    product_description: product.description || '',
    product_url: product.productUrl || '',
    product_image_url: product.imagePath || product.imageUrl || '',
    caption: product.caption || '',
    hashtags: product.hashtags || '',
    cta: product.cta || '',
    aspect_ratio: settingValue(settings.aspectRatio) || '9:16',
    output_count: settingValue(settings.outputCount) || '1',
    scene_count: settingValue(settings.sceneCount) || '1',
    duration: settingValue(settings.flowVideoDuration) || settingValue(settings.duration) || '8',
    system_prompt: settingValue(settings.systemPrompt),
    custom_prompt: settingValue(settings.customPrompt),
    forbidden_words: settingValue(settings.forbiddenWords),
    reference_note: product.hasReference ? 'ใช้รูปอ้างอิงเป็นภาพหลัก' : '',
    dialogue: settingValue(settings.dialogue),
  };

  const styleMode = settingValue(settings.styleMode) || 'preset';
  const activeStyleId =
    step === 'image'
      ? styleMode === 'viral'
        ? 'image_viral_style'
        : styleMode === 'custom'
          ? 'image_custom_style'
          : 'image_preset_style'
      : 'video_style';

  for (const category of catalog.categories) {
    if (category.scope !== step || category.enabled === false) {
      continue;
    }

    if (category.placeholder === 'style' && category.id !== activeStyleId) {
      continue;
    }

    const resolved = resolveCategory(category, settings);
    if (resolved || !(category.placeholder in context)) {
      context[category.placeholder] = resolved;
    }
  }

  for (const template of catalog.templates) {
    context[template.key] = template.text;
  }

  const substitute = (text: string): string =>
    text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => context[key] ?? '');
  const resolveDeep = (text: string): string => substitute(substitute(text));
  const lookup = (key: string): string => context[key] ?? settingValue(settings[key]);

  const evaluateWhen = (when?: string): boolean => {
    if (!when) {
      return true;
    }

    const condition = when.trim();
    if (condition === 'hasReference') {
      return !!product.hasReference;
    }

    let match = condition.match(/^([a-zA-Z0-9_]+)\s*(==|!=)\s*'([^']*)'$/);
    if (match) {
      const [, key, operator, value] = match;
      const currentValue = lookup(key);
      return operator === '==' ? currentValue === value : currentValue !== value;
    }

    match = condition.match(/^([a-zA-Z0-9_]+)\s*(==|!=)\s*([a-zA-Z0-9_]+)$/);
    if (match) {
      const [, key, operator, value] = match;
      const currentValue = settingValue(settings[key]) || context[key] || '';
      return operator === '==' ? currentValue === value : currentValue !== value;
    }

    return !!lookup(condition);
  };

  const output: string[] = [];
  for (const line of chain.lines) {
    if (!evaluateWhen(line.when)) {
      continue;
    }

    const text = resolveDeep(line.template).trim();
    if (text) {
      output.push(text);
    }
  }

  return output.join(catalog.joinSeparator || '; ');
}
