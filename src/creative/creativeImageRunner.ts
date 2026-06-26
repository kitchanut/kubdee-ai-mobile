import {
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
} from '@/autopilot/defaults';
import type { GoogleFlowRunnerPayload, GoogleFlowRunnerProduct } from '@/autopilot/types';

export type CreativeImageKind = 'characters' | 'scenes';

export function buildCreativeImagePrompt(
  kind: CreativeImageKind,
  name: string,
  description: string | null
): string {
  if (kind === 'characters') {
    return [
      `สร้างรูปตัวละครสำหรับใช้เป็น reference ในวิดีโอสินค้า ชื่อตัวละคร "${name}"`,
      description
        ? `รายละเอียดตัวละคร: ${description}`
        : 'ตัวละครควรดูเป็นคนไทยร่วมสมัย น่าเชื่อถือ เป็นธรรมชาติ เหมาะกับคอนเทนต์รีวิวสินค้า',
      'ภาพต้องเป็น portrait reference ชัดเจน เห็นใบหน้าเต็ม ไม่ถูกบัง แสงธรรมชาติ รายละเอียดเสื้อผ้าและบุคลิกชัด',
      'ห้ามใส่ข้อความ โลโก้ ลายน้ำ subtitle หรือกรอบภาพ',
      'สไตล์ภาพสมจริง คุณภาพสูง ใช้ต่อยอดเป็น reference ใน Google Flow ได้',
    ].join('\n');
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
