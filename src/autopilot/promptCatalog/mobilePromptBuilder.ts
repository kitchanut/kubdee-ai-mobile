import { buildPrompt, type BuildSettings } from '@/autopilot/promptCatalog/build';
import type { PromptCatalog } from '@/autopilot/promptCatalog/types';
import type {
  AutoPilotProduct,
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerPromptBundle,
} from '@/autopilot/types';

function compactText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function resolveDialogue(product: AutoPilotProduct, settings: AutoPilotProduct['settings']['video']): string {
  if (settings.dialogueMode === 'none') {
    return 'ไม่มีบทพูด ให้เป็นวิดีโอเงียบหรือมีเสียงบรรยากาศเท่านั้น';
  }

  if (settings.dialogueMode === 'custom') {
    const dialogueList = settings.dialogueList.map(compactText).filter(Boolean);
    if (dialogueList.length > 0) {
      return dialogueList.join(' | ');
    }

    return compactText(settings.dialogue);
  }

  return compactText(product.caption) || 'พูดแนะนำจุดเด่นสินค้าแบบกระชับ เป็นภาษาไทย ฟังเป็นธรรมชาติ';
}

function createImageBuildSettings(product: AutoPilotProduct, settings: AutoPilotSettings): BuildSettings {
  const imageSettings = product.settings.image;
  return {
    ...imageSettings,
    customStyleCustom: imageSettings.customStyle === '__custom__' ? imageSettings.presetStyleCustom : undefined,
    duration: String(settings.flowVideoDuration),
    flowVideoDuration: String(settings.flowVideoDuration),
  };
}

function createVideoBuildSettings(product: AutoPilotProduct, settings: AutoPilotSettings): BuildSettings {
  const videoSettings = product.settings.video;
  const sceneCount = Number.parseInt(videoSettings.sceneCount || '1', 10);

  return {
    ...videoSettings,
    duration: String(settings.flowVideoDuration),
    flowVideoDuration: String(settings.flowVideoDuration),
    outputCount: sceneCount > 1 ? '1' : videoSettings.outputCount,
    dialogue: resolveDialogue(product, videoSettings),
  };
}

export function buildGoogleFlowPromptBundle({
  catalog,
  enabledSteps,
  product,
  settings,
}: {
  catalog: PromptCatalog;
  enabledSteps: AutoPilotStepType[];
  product: AutoPilotProduct;
  settings: AutoPilotSettings;
}): GoogleFlowRunnerPromptBundle {
  const baseProduct = {
    name: product.name,
    description: product.description,
    productUrl: product.productUrl,
    imageUrl: product.preview ?? '',
    caption: product.caption,
    hashtags: product.hashtags,
    cta: product.cta,
  };

  const bundle: GoogleFlowRunnerPromptBundle = {};
  if (enabledSteps.includes('image')) {
    const prompt = buildPrompt(
      'image',
      createImageBuildSettings(product, settings),
      {
        ...baseProduct,
        hasReference: Boolean(product.preview),
      },
      catalog
    ).trim();
    if (prompt) {
      bundle.image = prompt;
    }
  }

  if (enabledSteps.includes('video')) {
    const prompt = buildPrompt(
      'video',
      createVideoBuildSettings(product, settings),
      {
        ...baseProduct,
        hasReference: Boolean(product.preview) || enabledSteps.includes('image'),
      },
      catalog
    ).trim();
    if (prompt) {
      bundle.video = prompt;
    }
  }

  return bundle;
}
