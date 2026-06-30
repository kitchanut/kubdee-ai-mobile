import {
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
} from '@/autopilot/defaults';
import type { GoogleFlowRunnerPayload, GoogleFlowRunnerProduct } from '@/autopilot/types';

export type CreativeImageKind = 'characters' | 'scenes';
export type CharacterReferenceLayout = 'single' | 'grid3x3';

type CreativeImagePromptOptions = {
  characterReferenceLayout?: CharacterReferenceLayout;
};

function buildSingleCharacterReferencePrompt(name: string, description: string | null): string {
  return [
    `สร้างรูปตัวละครสำหรับใช้เป็น reference ในวิดีโอสินค้า ชื่อตัวละคร "${name}"`,
    description
      ? `รายละเอียดตัวละคร: ${description}`
      : 'ตัวละครควรดูเป็นคนไทยร่วมสมัย น่าเชื่อถือ เป็นธรรมชาติ เหมาะกับคอนเทนต์รีวิวสินค้า',
    'ภาพต้องเป็น portrait reference ชัดเจน เห็นใบหน้าเต็ม ไม่ถูกบัง แสงธรรมชาติ รายละเอียดเสื้อผ้าและบุคลิกชัด',
    'ให้เป็นตัวละครคนเดียวในภาพเดียว ไม่ทำเป็นตาราง ไม่ทำ collage ไม่แบ่งช่อง',
    'ห้ามใส่ข้อความ โลโก้ ลายน้ำ subtitle หรือกรอบภาพ',
    'สไตล์ภาพสมจริง คุณภาพสูง ใช้ต่อยอดเป็น reference ใน Google Flow ได้',
  ].join('\n');
}

function buildCharacterGridSheetPrompt(name: string, description: string | null): string {
  return [
    `Create a 3x3 photorealistic character reference grid sheet (Master Sheet) for character "${name}".`,
    description
      ? `Character identity and details to preserve in every square: ${description}`
      : 'Character identity: contemporary Thai reviewer, realistic Thai-Asian facial features, natural skin texture, credible and approachable personality.',
    'All 9 squares must feature the exact same character with the same facial identity, same hair, same body proportions, same skin tone, and consistent clothing. This is a consistency master sheet for future product videos.',
    'Use a clean neutral cream studio background in every square. No product, no text, no logo, no watermark, no subtitles, no black bars.',
    'Photorealistic commercial reference quality, sharp focus, realistic skin pores, realistic fabric texture, high detail, vertical 9:16 master sheet.',
    '[Top row, L-R]: 1) Close-up face, direct front view, subtle warm approachable smile. 2) Extreme close-up face, looking up dramatically with a surprised wow expression. 3) Close-up face, left profile view, laughing naturally.',
    '[Middle row, L-R]: 4) Close-up face, looking down with focused thoughtful expression as if assessing a product. 5) Half body portrait, direct front view, confident friendly smile, clearly showing body build and clothing. 6) Close-up face, right 45-degree angle, kind smile and eye contact.',
    '[Bottom row, L-R]: 7) Full body shot, direct front view, casual standing pose, showing body proportions. 8) Close-up face, direct front view, playful wink with confident smile. 9) Half body shot, back view looking over the shoulder, showing hair and back clothing details.',
    'The grid is only for character consistency reference. Make every square look like the same real person, not different models.',
  ].join('\n');
}

export function buildCreativeImagePrompt(
  kind: CreativeImageKind,
  name: string,
  description: string | null,
  options: CreativeImagePromptOptions = {}
): string {
  if (kind === 'characters') {
    return options.characterReferenceLayout === 'grid3x3'
      ? buildCharacterGridSheetPrompt(name, description)
      : buildSingleCharacterReferencePrompt(name, description);
  }

  return [
    `สร้างรูปฉากสำหรับใช้เป็น reference ในวิดีโอสินค้า ชื่อฉาก "${name}"`,
    description
      ? `รายละเอียดฉาก: ${description}`
      : 'ฉากควรเหมาะกับการถ่ายรีวิวสินค้าและคอนเทนต์ขายของบนมือถือ',
    'ภาพต้องเป็น environment reference ชัดเจน มีพื้นที่วางสินค้า แสงสวย องค์ประกอบสะอาด ใช้ต่อยอดทำวิดีโอได้',
    'ไม่ต้องมีตัวละครหลักถ้าไม่ได้ระบุ ห้ามใส่ข้อความ โลโก้ ลายน้ำ subtitle หรือกรอบภาพ',
    'สไตล์ภาพสมจริง คุณภาพสูง มุมกล้องเหมาะกับวิดีโอแนวตั้ง',
  ].join('\n');
}

export function createCreativeImageRunnerPayload({
  description,
  imageUri,
  itemId,
  kind,
  name,
  profileLocalId,
}: {
  description: string | null;
  imageUri: string | null;
  itemId: string;
  kind: CreativeImageKind;
  name: string;
  profileLocalId: string;
}): GoogleFlowRunnerPayload {
  const prompt = buildCreativeImagePrompt(kind, name, description);
  const runId = `creative-${kind}-${Date.now()}`;
  const product: GoogleFlowRunnerProduct = {
    id: itemId,
    catalogId: itemId,
    preview: imageUri,
    name,
    description: description ?? '',
    productId: itemId,
    productUrl: '',
    caption: '',
    hashtags: '',
    cta: '',
    platform: `creative-${kind}`,
    settings: {
      image: {
        ...DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
        aspectRatio: '9:16',
        outputCount: '1',
        promptMode: 'custom',
        customPrompt: prompt,
        systemPrompt: '',
      },
      video: { ...DEFAULT_AUTO_PILOT_VIDEO_SETTINGS },
    },
    prompts: { image: prompt },
    creativeAssetKind: kind,
    creativeItemId: itemId,
    creativeItemName: name,
    creativeItemDescription: description,
    creativeItemTags: kind === 'characters' ? 'character,google-flow' : 'scene,google-flow',
  };

  return {
    sourceApp: 'mobile',
    runner: 'on-device-google-flow-webview',
    version: 1,
    profileLocalId,
    runId,
    enabledSteps: ['image'],
    settings: {
      ...DEFAULT_AUTO_PILOT_SETTINGS,
      totalRounds: 1,
      flowImageModel: DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.imageModel,
    },
    products: [product],
    promptCatalogVersion: null,
    promptCatalogSource: 'seed',
    createdAt: Date.now(),
  };
}
