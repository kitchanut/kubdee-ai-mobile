import type { AutoPilotStepType, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { BACKEND_URL } from '@/auth/constants';
import { getStoredAuthTokens } from '@/auth/storage';
import { getAiBrainSettings, pickAiBrainModel } from '@/autopilot/aiBrainSettingsStore';
import type { FlowResultPoll, PreparedMultiScenePromptResult } from './runnerBasics';
import { AUTO_MULTI_SCENE_TRIM_END_SECONDS, VOICEOVER_END_BUFFER_SECONDS, stepLabel } from './runnerPlanning';

export const FACE_VISIBILITY_IMAGE_INSTRUCTION =
  'ถ้าเห็นใบหน้าคนต้องเห็นชัดเจนเต็มหน้าและไม่ถูกอะไรบัง ถ้าฉากนี้ไม่ควรเห็นหน้าก็ไม่ต้อง reveal หน้าเลย ห้ามใช้มุมที่เห็นหน้าครึ่ง ๆ กลาง ๆ หรือมีวัตถุบังหน้า';
export const SAME_ANGLE_PRESENTER_IMAGE_INSTRUCTION =
  'สำหรับวิดีโอหลายฉากแบบมุมเดียว ให้จัดตัวละครหันหน้ามองกล้องโดยตรง สีหน้าเป็นธรรมชาติ ท่าทางพร้อมพูดหรือพรีเซนต์สินค้า มือถือหรือใช้งานสินค้าในตำแหน่งที่เห็นชัด เหมาะสำหรับนำรูปเดียวไปสร้างวิดีโอหลายฉากที่บทพูดเปลี่ยนไปเรื่อย ๆ';
export const NO_TEXT_OVERLAY_IMAGE_INSTRUCTION =
  'ให้ถือว่าการตั้งค่าข้อความบนรูปของฉากนี้เป็น "ไม่มีตัวหนังสือในรูป": ห้ามมีข้อความหรือตัวอักษรใดๆ ในภาพ ห้ามมี subtitle, headline, slogan, label, ราคา, โปรโมชัน, ตัวเลข, hashtag, caption, URL, watermark, โลโก้ที่ AI สร้างเอง หรือข้อความบนแพ็กเกจที่ AI แต่งเพิ่มเอง ถ้า prompt หลักหรือค่าก่อนหน้าอนุญาตให้ใส่ข้อความ ให้ยึดคำสั่งไม่มีตัวหนังสือนี้เป็นหลัก';

export function getAutoMultiSceneImageVariationInstruction(sceneNumber: number, totalScenes: number): string {
  const clampedTotal = Math.min(5, Math.max(2, totalScenes));
  const clampedScene = Math.min(Math.max(sceneNumber, 1), clampedTotal);
  const shotPlans: Record<number, string[]> = {
    2: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ให้เป็น product hero หรือ close-up/detail shot เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
    ],
    3: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ต้องเปลี่ยนเป็น action/use-case shot เช่น มุมเฉียง 45 องศา มุมข้ามไหล่ มุมโต๊ะ หรือมุมกำลังหยิบ/ใช้งานสินค้า ไม่ใช้ crop และตำแหน่งกล้องเดิม',
      'ฉากที่ 3 ให้เป็น product hero หรือ close-up/detail shot เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
    ],
    4: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ต้องเปลี่ยนเป็นมุมกล้องใหม่อย่างชัดเจน เช่น มุมเฉียง 45 องศา หรือมุมกำลังหยิบ/ใช้งานสินค้า ไม่ใช้ crop และตำแหน่งกล้องเดิม',
      'ฉากที่ 3 ให้เป็น close-up หรือ product focus เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
      'ฉากที่ 4 ให้เป็น hero/detail shot ของสินค้า เช่น มุมต่ำ มุม macro มุมวางสินค้าในฉาก หรือมุม beauty shot ที่ต่างจากทุกฉากก่อนหน้า',
    ],
    5: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ต้องเปลี่ยนเป็นมุมกล้องใหม่อย่างชัดเจน เช่น มุมเฉียง 45 องศา หรือมุมกำลังหยิบ/ใช้งานสินค้า ไม่ใช้ crop และตำแหน่งกล้องเดิม',
      'ฉากที่ 3 ให้เป็น close-up หรือ product focus เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
      'ฉากที่ 4 ให้เป็น action/use-case shot เช่น มุมข้ามไหล่ มุมโต๊ะ มุมด้านข้าง หรือมุมที่แสดงสถานการณ์ใช้งานจริง โดยสินค้าเป็นจุดสนใจหลัก',
      'ฉากที่ 5 ให้เป็น hero/detail shot ของสินค้า เช่น มุมต่ำ มุม macro มุมวางสินค้าในฉาก หรือมุม beauty shot ที่ต่างจากทุกฉากก่อนหน้า',
    ],
  };
  const shot = (shotPlans[clampedTotal] ?? shotPlans[3])[clampedScene - 1] ?? '';
  return `วิดีโอชุดนี้มีทั้งหมด ${clampedTotal} ฉาก ${shot} ต้องมี shot variety ระหว่างฉาก: เปลี่ยนระยะภาพ มุมกล้อง ตำแหน่งสินค้า หรือจุดโฟกัสให้แตกต่างจากรูปก่อนหน้าอย่างเห็นได้ชัด ห้ามคัดลอก composition เดิมซ้ำ ถ้าเป็นมุม zoom หรือ focus สินค้า ไม่ต้องบังคับให้กล้องถอยออกมาเห็นตัวละครเต็มตัว ถ้าในภาพมีใบหน้าคน ต้องเห็นใบหน้าชัดเจน เปิดโล่ง ไม่ถูกสินค้า มือ ผม หมวก หน้ากาก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บดบัง และไม่เบลอหรือบิดเบี้ยว ถ้าฉากตั้งใจเป็น product-only, hands-only, close-up รายละเอียดสินค้า หรือมุมที่ไม่เห็นหน้า ก็ห้ามถอยกล้องหรือเปลี่ยน framing เพื่อ reveal หน้า ให้ไม่เห็นหน้าไปเลย`;
}

export function dialogueForScene(product: GoogleFlowRunnerProduct, sceneNumber: number): string {
  const video = product.settings.video;
  if (video.dialogueMode === 'none') {
    return 'ไม่มีบทพูด ให้เป็นวิดีโอเงียบหรือมีเสียงบรรยากาศเท่านั้น';
  }
  if (video.dialogueMode === 'custom') {
    const lines = (video.dialogueList ?? []).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines[(sceneNumber - 1) % lines.length];
    }
    if (video.dialogue.trim()) {
      return video.dialogue.trim();
    }
  }
  return 'สร้างบทโฆษณาภาษาไทยประมาณ 6.5 วินาที หรือ 1-2 ประโยคที่พูดต่อเนื่องกัน กระตุ้นให้อยากซื้อและลดช่วงเงียบท้ายคลิป';
}

export function multiSceneImagePrompt(
  product: GoogleFlowRunnerProduct,
  sceneNumber: number,
  totalScenes: number,
  sameAngle: boolean,
  basePrompt?: string
): string {
  const forceNoTextOverlay = sceneNumber >= 2;
  const sceneInstruction = [
    `สร้างภาพฉากที่ ${sceneNumber}/${totalScenes} สำหรับวิดีโอหลายฉากของสินค้า "${product.name || 'สินค้า'}"`,
    getAutoMultiSceneImageVariationInstruction(sceneNumber, totalScenes),
    sameAngle ? SAME_ANGLE_PRESENTER_IMAGE_INSTRUCTION : 'คงตัวละครเดิม ใบหน้าเดิม สินค้าเดิม แพ็กเกจเดิม และแบรนด์เดิม แต่เปลี่ยนมุมกล้อง ระยะภาพ การกระทำ หรือบริบทให้ต่างจากฉากก่อนหน้าอย่างชัดเจน',
    FACE_VISIBILITY_IMAGE_INSTRUCTION,
    forceNoTextOverlay
      ? NO_TEXT_OVERLAY_IMAGE_INSTRUCTION
      : 'ห้ามใส่ subtitle ข้อความบนภาพ ราคา โปรโมชัน ตัวเลขราคา hashtag caption URL หรือ watermark เองถ้าไม่ได้ตั้งค่าไว้',
  ]
    .filter(Boolean)
    .join(' ');

  return [basePrompt?.trim(), sceneInstruction].filter(Boolean).join('\n\n');
}

export function multiSceneVideoPrompt(product: GoogleFlowRunnerProduct, basePrompt: string, sceneNumber: number, totalScenes: number, voiceover: boolean): string {
  const dialogue = dialogueForScene(product, sceneNumber);
  return [
    basePrompt,
    `สร้างวิดีโอฉากที่ ${sceneNumber}/${totalScenes} จากรูป reference นี้ โดยรักษาสินค้า ตัวละคร และแบรนด์ให้เหมือนภาพอ้างอิง`,
    getAutoMultiSceneImageVariationInstruction(sceneNumber, totalScenes),
    voiceover
      ? 'โหมดเสียงพากษ์: วิดีโอนี้ต้องเป็นภาพล้วน ไม่มีคนพูด ไม่มี lip sync ไม่มี subtitle ไม่มีข้อความบนจอ และไม่มีเสียงพูด เพราะเสียงพากษ์จะถูกประกอบภายหลัง'
      : `บทพูดภาษาไทยสำหรับฉากนี้: ${dialogue}`,
    'วิดีโอต้องเต็มจอ ไม่มีขอบดำ ไม่มี subtitle และเหมาะกับคลิปขายสินค้าสั้นบนมือถือ',
  ]
    .filter(Boolean)
    .join('\n');
}

export function dataUrlToAiImage(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return { mimeType: match[1] || 'image/jpeg', base64: match[2] || '' };
}

export function cleanAiJsonText(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/g, '')
    .trim();
}

export function cleanAiPromptText(text: string): string {
  return cleanAiJsonText(text)
    .replace(/^```(?:text|prompt)?\s*/i, '')
    .replace(/\s*```$/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function extractBalancedJson(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']');
      continue;
    }

    if (char === '}' || char === ']') {
      if (stack.pop() !== char) {
        return null;
      }
      if (stack.length === 0) {
        return text.slice(0, index + 1);
      }
    }
  }

  return null;
}

export function parseAiJsonText(text: string): unknown {
  const cleaned = cleanAiJsonText(text);
  const candidates = [cleaned];

  for (const match of String(text || '').matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim());
    }
  }

  for (let index = 0; index < cleaned.length; index += 1) {
    if (cleaned[index] !== '{' && cleaned[index] !== '[') {
      continue;
    }
    const balanced = extractBalancedJson(cleaned.slice(index));
    if (balanced) {
      candidates.push(balanced);
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // AI often wraps JSON in prose, markdown fences, or returns another JSON shape.
    }
  }

  throw new Error('Parse AI response ไม่ได้');
}

export function parseSceneDialoguesFromText(text: string, sceneCount: number): { sceneNumber: number; dialogue: string }[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scenes: { sceneNumber: number; dialogue: string }[] = [];

  for (const line of lines) {
    const match = line.match(/^(?:[-*]\s*)?(?:ฉาก|scene)\s*(\d+)\s*[:：.)-]\s*(.+)$/i);
    if (!match) {
      continue;
    }
    const sceneNumber = Math.min(sceneCount, Math.max(1, Number(match[1]) || scenes.length + 1));
    const dialogue = normalizeDialogueText(match[2].replace(/^["']|["']$/g, '').trim());
    if (dialogue) {
      scenes.push({ sceneNumber, dialogue });
    }
  }

  return scenes
    .sort((left, right) => left.sceneNumber - right.sceneNumber)
    .slice(0, sceneCount);
}

export function normalizeDialogueText(text: string): string {
  return text
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeVoiceoverScript(text: string): string {
  const allowedTags = new Set([
    'very fast',
    'excited',
    'curious',
    'serious',
    'amazed',
    'whispers',
    'shouting',
    'laughs',
    'sighs',
  ]);
  return text
    .replace(/\[([^\]]+)\]/g, (_match, rawTag: string) => {
      const tag = String(rawTag || '').trim().toLowerCase();
      return allowedTags.has(tag) ? `[${tag}]` : ' ';
    })
    .replace(/[!"#$%&'()*+,./:;<=>?@\\^_`{|}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isAudioGenerationFailure(error?: string): boolean {
  return /\baudio\s+generation\s+failed\b/i.test(error || '');
}

export function buildFlowFailedError(step: AutoPilotStepType, result: FlowResultPoll): string {
  const messages = (result.failedMessages ?? [])
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (messages.length > 0) {
    return `Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}: ${messages.join(' | ')}`;
  }
  return `Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}`;
}

export function formatPromptPreview(prompt: string): string {
  const preview = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n');
  return preview.length > 220 ? `${preview.slice(0, 220)}...` : preview;
}

export const SCRIPT_STYLE_PRESETS: Record<string, string> = {
  '': 'รีวิวเป็นกันเอง พูดอย่างเป็นธรรมชาติ',
  normal: 'ปกติ รีวิวเป็นกันเอง เหมือนเพื่อนบอกต่อ',
  playful: 'กวนตีน ตลก มุกเบาๆ เฮฮา สนุกสนาน',
  polite: 'ผู้ดี สุภาพ น่าเชื่อถือ พูดจาดี มีมารยาท',
  hardsell: 'ขายแรงๆ กระตุ้นซื้อ เร่งด่วน รีบเลย ของมีจำกัด',
  isan: 'อีสานบ้านๆ ใส่คำอีสาน สำเนียงอีสาน',
  northern: 'คำเมืองเหนือ อ่อนหวานนุ่มนวล สำเนียงเหนือ',
  cute: 'น่ารักมุ้งมิ้ง สดใส ใช้คำน่ารักๆ',
  confident: 'มั่นใจจัด รู้จริง เชี่ยวชาญ พูดหนักแน่น',
  excited: 'ตื่นเต้นสุดๆ พลังเยอะ ร้องว้าว',
  peaceful: 'สงบสุข ผ่อนคลาย เสียงนุ่มนวล',
  romantic: 'หวานโรแมนติก อ่อนโยน เสียงหวาน',
};

export const VOICE_CHARACTER_PRESETS: Record<string, string | null> = {
  '': '',
  female: 'เสียงผู้หญิงไทย',
  male: 'เสียงผู้ชายไทย',
  none: null,
  teen_girl: 'เสียงสาววัยรุ่นไทย อายุประมาณ 18-22 ปี พูดสดใส ร่าเริง',
  teen_boy: 'เสียงหนุ่มวัยรุ่นไทย อายุประมาณ 18-22 ปี พูดเท่ๆ คูลๆ',
  vendor_female: 'เสียงแม่ค้าไทย พูดเชียร์ขายของ กระตุ้นให้ซื้อ',
  vendor_male: 'เสียงพ่อค้าไทย พูดเชียร์ขายของ กระตุ้นให้ซื้อ',
  office_female: 'เสียงพี่สาวออฟฟิศ พูดสุภาพ มืออาชีพ น่าเชื่อถือ',
  office_male: 'เสียงพี่ชายออฟฟิศ พูดสุภาพ มืออาชีพ น่าเชื่อถือ',
  aunt: 'เสียงป้าไทย อายุประมาณ 40-50 ปี พูดเป็นกันเอง อบอุ่น',
  uncle: 'เสียงลุงไทย อายุประมาณ 40-50 ปี พูดเป็นกันเอง ใจดี',
};

export function buildSceneDialoguePrompt(
  product: GoogleFlowRunnerProduct,
  sceneCount: number,
  voiceover: boolean,
  selectedVideoDuration: number,
  hasSceneImages: boolean
): string {
  const video = product.settings.video;
  const styleDesc = video.scriptStyleCustom || SCRIPT_STYLE_PRESETS[video.scriptStyle || ''] || SCRIPT_STYLE_PRESETS[''];
  const isNoVoice = video.voiceCharacter === 'none';
  const isAutoVoice = !video.voiceCharacter;
  const voiceDesc = video.voiceCharacterCustom || VOICE_CHARACTER_PRESETS[video.voiceCharacter || ''];
  const voiceSection = (() => {
    if (isNoVoice) {
      return 'เสียง: ไม่มีเสียงพูด วิดีโอเงียบมีแค่เพลงประกอบ';
    }
    if (isAutoVoice) {
      if (!hasSceneImages) {
        return [
          'เสียงพากย์: ออโต้จากข้อมูลสินค้า ใช้เสียงผู้บรรยายไทยกลางที่เหมาะกับสินค้า ถ้าไม่แน่ใจให้ใช้เสียงผู้หญิงไทยที่ขายของเป็นธรรมชาติ',
          `สไตล์บทพูด: ${styleDesc}`,
        ].join('\n');
      }
      return [
        'เสียงพากย์: ออโต้จากรูปฉาก ถ้าเห็นตัวละครหรือใบหน้าคน ให้เลือกเสียงพูดภาษาไทยที่เหมาะกับเพศและวัยของตัวละครในรูป เช่น ผู้หญิงใช้เสียงผู้หญิงไทย ผู้ชายใช้เสียงผู้ชายไทย ถ้าเห็นแค่มือหรือสินค้าและไม่เห็นคน ให้ใช้เสียงบรรยายไทยกลางที่เหมาะกับสินค้า',
        `สไตล์บทพูด: ${styleDesc}`,
      ].join('\n');
    }
    return [`เสียงพากย์: ${voiceDesc || 'เสียงพูดภาษาไทย'}`, `สไตล์บทพูด: ${styleDesc}`].join('\n');
  })();
  const voiceStyleGuidance = (() => {
    if (isNoVoice) {
      return '- ไม่ต้องสร้าง voiceStyleInstruction (ใส่ค่าว่าง "")';
    }
    if (isAutoVoice) {
      if (!hasSceneImages) {
        return '- voiceStyleInstruction ใช้เสียงผู้บรรยายไทยกลางที่เหมาะกับสินค้า พูดเร็วแบบ TikTok และ voiceGender ให้ใช้ "neutral" ถ้าไม่มีข้อมูลเพศชัดเจน';
      }
      return '- voiceStyleInstruction ต้องเลือกเพศและวัยของเสียงให้เหมาะกับตัวละครที่เห็นในรูปฉาก ถ้าไม่เห็นตัวละครหรือไม่เห็นหน้า ให้ใช้เสียงผู้บรรยายไทยกลางที่เหมาะกับสินค้า';
    }
    if (voiceDesc) {
      return `- voiceStyleInstruction ต้องสอดคล้องกับเสียงที่เลือก: "${voiceDesc}" ห้ามขัดกัน`;
    }
    return '';
  })();
  const safeVideoDuration = Math.max(1, Number(selectedVideoDuration) || 8);
  const voiceoverTargetDuration = Math.max(
    1,
    Math.round(sceneCount * Math.max(1, safeVideoDuration - AUTO_MULTI_SCENE_TRIM_END_SECONDS) - VOICEOVER_END_BUFFER_SECONDS)
  );
  const voiceoverTotalMinChars = Math.max(sceneCount * 42, Math.round(voiceoverTargetDuration * 12));
  const voiceoverTotalMaxChars = Math.max(voiceoverTotalMinChars + sceneCount * 8, Math.round(voiceoverTargetDuration * 15));
  const voiceoverSceneMinChars = Math.max(35, Math.round(voiceoverTotalMinChars / sceneCount));
  const voiceoverSceneMaxChars = Math.max(voiceoverSceneMinChars + 8, Math.round(voiceoverTotalMaxChars / sceneCount));
  const voiceoverPerSceneRule = voiceover
    ? `- โหมดเสียงพากษ์ต้องปรับความยาวบทตามความยาวคลิปที่เลือก: ผู้ใช้เลือกวิดีโอประมาณ ${safeVideoDuration} วินาทีต่อฉาก รวม ${sceneCount} ฉาก ดังนั้นบทพากษ์รวมควรพูดได้ประมาณ ${voiceoverTargetDuration} วินาที`
      + `\n- แต่ละช่วงควรยาวประมาณ ${voiceoverSceneMinChars} ถึง ${voiceoverSceneMaxChars} ตัวอักษรไทย และบทพากษ์รวมทั้งคลิปควรยาวประมาณ ${voiceoverTotalMinChars} ถึง ${voiceoverTotalMaxChars} ตัวอักษรไทย ไม่รวม Gemini TTS audio tags`
    : '- เป้าหมายความยาวต่อฉากประมาณ 65 ถึง 90 ตัวอักษรไทย หรือ 1 ถึง 2 ช่วงความคิดที่พูดต่อเนื่องกัน';
  const voiceoverConsistencyRule = voiceover
    ? `- โหมดเสียงพากษ์ไม่ต้องทำให้แต่ละช่วงยาว 6.5 วินาทีเท่ากัน ให้ยึดความยาวรวมประมาณ ${voiceoverTargetDuration} วินาที และกระจายเนื้อหาให้เหมาะกับภาพแต่ละฉาก`
    : '- บทพูดแต่ละฉากต้องพูดได้ประมาณ 6.5 วินาที โดยไม่เร่งจนฟังไม่รู้เรื่อง และเหลือช่วงภาพเงียบท้ายฉากให้น้อยที่สุด';
  const ttsTagGuidance = voiceover
    ? `
Gemini TTS audio tags สำหรับโหมดเสียงพากษ์:
- อนุญาตให้ใส่ tag ควบคุมเสียงใน voiceoverScript ได้ เฉพาะ tag เหล่านี้เท่านั้น: [very fast], [excited], [curious], [serious], [amazed], [whispers], [shouting], [laughs], [sighs]
- ต้องใส่ [very fast] ที่ต้น voiceoverScript เสมอ เพื่อให้เหมาะกับคลิป TikTok
- เลือก tag อารมณ์เพิ่มได้ตามบริบทสินค้า แต่ใช้เท่าที่จำเป็น ไม่เกิน 3 ถึง 5 tag ต่อบทพากษ์รวม
- ห้ามสร้าง tag เอง ห้ามใช้ tag ที่ไม่อยู่ในรายการ และห้ามใส่ tag ติดกันหลายอัน
- ห้ามใส่ tag ใน dialogue รายฉาก ให้ใส่เฉพาะ voiceoverScript เท่านั้น
- ตัวอย่าง voiceoverScript: "[very fast] หยุดก่อนถ้ายังหาหมวกที่ใส่ง่ายทุกวัน [curious] รุ่นนี้ทรงสวย แมตช์ง่าย และระบายอากาศดี [excited] กดตะกร้าได้เลย"
`
    : '';
  const customDialogue = (() => {
    if (video.dialogueMode !== 'custom') return '';
    const list = (video.dialogueList ?? []).map((line) => line.trim()).filter(Boolean);
    if (list.length > 0) {
      return list.length >= sceneCount
        ? ['บทพูดที่กำหนดให้แต่ละฉาก (ห้ามเปลี่ยน ใช้ตามนี้เท่านั้น):', ...list.slice(0, sceneCount).map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`)].join('\n')
        : ['บทพูดที่กำหนดบางฉาก:', ...list.map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`), '- ฉากที่เหลือ: ให้ AI คิดบทพูดเอง'].join('\n');
    }
    if (video.dialogue.trim()) {
      const parts = video.dialogue.split('|').map((line) => line.trim()).filter(Boolean);
      if (parts.length >= sceneCount) {
        return ['บทพูดที่กำหนดให้แต่ละฉาก (ห้ามเปลี่ยน ใช้ตามนี้เท่านั้น):', ...parts.slice(0, sceneCount).map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`)].join('\n');
      }
      if (parts.length === 1) {
        return `บทพูดที่กำหนด (ใช้เป็นแนวทางทุกฉาก): "${parts[0]}"`;
      }
      return ['บทพูดที่กำหนดบางฉาก:', ...parts.map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`), '- ฉากที่เหลือ: ให้ AI คิดบทพูดเอง'].join('\n');
    }
    return '';
  })();
  const sceneImageSection = hasSceneImages
    ? [
        'รูปภาพฉาก:',
        `- มีรูปแนบ ${sceneCount} รูป เรียงตามฉากที่ 1 ถึงฉากที่ ${sceneCount}`,
        '- ต้องคิดบทให้สัมพันธ์กับสิ่งที่เห็นในรูปแต่ละฉาก เช่น การถือสินค้า การใช้งานสินค้า มุมกล้อง หรือบริบทของฉากนั้น',
        '- ห้ามพูดสิ่งที่ขัดกับภาพ เช่น บอกว่ากำลังใช้งานถ้าในภาพเป็นแค่ packshot หรือพูดว่าถือสินค้าอยู่ถ้าในภาพไม่มีคนถือ',
        '- ให้บทแต่ละฉากต่อกันเป็นคลิปขายสินค้าเรื่องเดียว ไม่ใช่บทแยกหลายคลิป',
      ].join('\n')
    : [
        'รูปภาพฉาก:',
        '- ไม่มีรูปแนบให้ AI วิเคราะห์ในขั้นตอนคิดบท',
        '- ให้คิดบทจากข้อมูลสินค้า สไตล์บทพูด และลำดับคลิปขายสินค้าแบบหลายฉาก',
        '- ให้บทแต่ละฉากต่อกันเป็นคลิปขายสินค้าเรื่องเดียว โดยไม่อ้างรายละเอียดภาพเฉพาะที่มองไม่เห็น',
      ].join('\n');

  return `
คุณคือผู้เชี่ยวชาญด้านการเขียนบทโฆษณาสินค้าบน TikTok

${voiceover
  ? `คิดบทพากษ์ภาษาไทยแบบต่อเนื่องสำหรับวิดีโอ ${sceneCount} ฉาก โดยแบ่งเนื้อหาเป็น ${sceneCount} ช่วงตามภาพแต่ละฉาก แต่เสียงจริงจะถูกนำไปอ่านต่อเนื่องเป็นไฟล์เดียว ไม่ใช่ให้ตัวละครในวิดีโอพูด`
  : `คิดบทพูดภาษาไทยสำหรับวิดีโอ ${sceneCount} ฉาก (แต่ละฉากยาวประมาณ ${safeVideoDuration} วินาที แต่เสียงพูดควรยาวประมาณ 6.5 วินาที)`}

ข้อมูลสินค้า:
- ชื่อ: ${product.name || 'สินค้า'}
- รายละเอียด: ${product.description || ''}

${sceneImageSection}

เป้าหมายบทพูดแบบ TikTok Direct Response:
- โฟกัสขายบน TikTok อย่างเดียว ต้องเร็ว แรง เข้าใจทันที ไม่ใช่บทโฆษณานุ่มแบบทีวี
- ฉากแรกต้องเป็น hook ภายในสามวินาทีแรก เช่น ปัญหาแรง ผลลัพธ์ที่อยากได้ คำเตือน ความคุ้ม หรือเหตุผลที่ต้องหยุดดู
- ห้ามเริ่มด้วยประโยคทั่วไป เช่น สวัสดีค่ะ วันนี้ หรือ มาแนะนำสินค้า
- ทุกฉากต้องพาคนดูเข้าใกล้การซื้อเร็วขึ้น ด้วยลำดับ Hook, Solution, Benefit, Proof, CTA
- CTA ฉากสุดท้ายต้องชัดแบบ TikTok Shop เช่น กดตะกร้า สั่งเลย ลิงก์อยู่ในตะกร้า

${voiceSection}
${video.dialogueMode === 'none' ? '\nบทพูด: ไม่มีบทพูด' : customDialogue ? `\n${customDialogue}` : ''}
${video.systemPrompt ? `\nคำสั่งเพิ่มเติม: ${video.systemPrompt}` : ''}

กฎสำคัญ:
- ตอบเป็น JSON เท่านั้น
- ต้องมีบทพูดครบ ${sceneCount} ฉากเท่านั้น ห้ามมากกว่าหรือน้อยกว่า
- บทพูดเป็นภาษาไทย
- ฉากที่ 1 ต้องเป็น Hook ที่หยุดนิ้วภายในสามวินาทีแรก
- ฉากสุดท้ายต้องเป็น CTA กระตุ้นให้ซื้อแบบตรงและสั้น
- ${voiceover ? 'แต่ละฉากคือช่วงของเสียงพากษ์รวม ต้องอ่านต่อเนื่องกันได้ลื่นไหลเหมือนคลิปเดียว ห้ามเขียนเหมือนตัวละครพูดในฉาก และห้ามมีคำบรรยายท่าทาง' : 'บทพูดแต่ละฉากต้องเหมาะกับตัวละครหรือผู้บรรยายในฉากนั้น'}
- ${voiceover ? `บทพากษ์ต้องยึดความยาวรวมประมาณ ${voiceoverTargetDuration} วินาที ไม่ต้องทำให้แต่ละช่วงยาวเท่ากัน` : 'ถ้าฉากมีเสียงพูด ให้บทพูดยาวพอสำหรับเสียงประมาณ 6.3 ถึง 7.0 วินาที โดยเป้าหมายหลักคือ 6.5 วินาที ห้ามเป็นวลีสั้นคำเดียว'}
${voiceoverPerSceneRule}

${ttsTagGuidance}

ข้อห้ามเรื่อง TTS:
- ห้ามใช้อักขระพิเศษทุกชนิด เช่น ๆ ! ? " " ( ) * # ... - ~ ฯ ห้ามหมด ถ้าต้องการพูดซ้ำให้พิมพ์ข้อความนั้นซ้ำแทนการใช้ ๆ${voiceover ? ' ยกเว้นวงเล็บเหลี่ยมที่อยู่ใน Gemini TTS audio tags ที่อนุญาตเท่านั้น' : ''}
- ห้ามใช้ emoji ทุกชนิดในบทพูด
- ห้ามลากเสียงหรือเพิ่มตัวอักษรซ้ำ เช่น กรี๊ดดด ทุกคนนน ให้เขียนคำปกติเท่านั้น
- ห้ามใช้คำแสลงหรือคำที่ TTS อ่านไม่ได้ ให้ใช้คำเต็มที่อ่านออกเสียงได้ชัดเจน
- ห้ามใช้ตัวเลขดิบ ให้เขียนเป็นตัวอักษรเสมอ เช่น 199 เขียนเป็น หนึ่งร้อยเก้าสิบเก้า
- ถ้าชื่อสินค้าเป็นภาษาอังกฤษ ให้เขียนทับศัพท์เป็นภาษาไทยที่ TTS อ่านได้

กฎความสม่ำเสมอ:
${voiceoverConsistencyRule}
- โทนเสียงและลักษณะการพูดต้องเหมือนกันทุกฉาก ห้ามเปลี่ยนกลางคัน
- ห้ามมีฉากที่พูดยาวกว่าฉากอื่นมาก

voiceStyleInstruction:
- คิด voiceStyleInstruction เป็นภาษาอังกฤษ 1 ประโยค สำหรับกำกับโทนเสียงพากย์ทุกฉาก
- ต้องระบุ: เพศ, อายุโดยประมาณ, ภาษา (Thai), อารมณ์/โทน, ความเร็วในการพูด
- ต้องสั่งให้พูดเร็วขึ้นเล็กน้อยแบบ TikTok short-form ad pace ห้ามเว้น pause ยาว และต้องจบก่อนเวลาภาพเล็กน้อย
- ตัวอย่าง: "Read aloud in a warm, cheerful young Thai female voice, energetic and friendly like a social media influencer, brisk slightly fast Thai short-form ad pace with no long pauses"
${voiceStyleGuidance}

voiceGender:
- ${hasSceneImages ? 'ถ้าเห็นตัวละครหรือใบหน้าชัดในรูปฉาก ให้เลือก "female" หรือ "male" ตามตัวละครหลักที่ควรเป็นเสียงพากย์' : 'ถ้าไม่มีรูปแนบและไม่มีเสียงที่เลือกชัดเจน ให้ใช้ "neutral"'}
- ถ้าเห็นหลายคน ให้เลือกตามตัวละครหลักหรือคนที่ถือสินค้าเด่นที่สุด
- ถ้าเป็นมือเท่านั้น สินค้าเท่านั้น ไม่เห็นหน้า หรือระบุเพศไม่ได้ ให้ใช้ "neutral"
- ค่า voiceGender ต้องเป็นหนึ่งใน: "female", "male", "neutral"

ตอบกลับเป็น JSON เท่านั้น:
{
  "voiceStyleInstruction": "English voice style instruction here",
  "voiceGender": "${voiceover ? 'female | male | neutral' : 'neutral'}",
  "voiceoverScript": "${voiceover ? 'บทพากษ์รวมทั้งคลิป' : ''}",
  "scenes": [
    { "sceneNumber": 1, "dialogue": "หยุดก่อนถ้ายังเจอปัญหานี้อยู่ วิธีนี้ช่วยให้เห็นทางแก้ไวขึ้นและทำตามได้ง่ายมาก" }
  ]
}
`.trim();
}

export function parsePreparedScenes(text: string, sceneCount: number): Pick<PreparedMultiScenePromptResult, 'scenes' | 'voiceStyleInstruction' | 'voiceoverScript' | 'voiceGender'> {
  const buildFallbackPreparedScenes = (fallbackScenes: { sceneNumber: number; dialogue: string }[]) => {
    const sceneByNumber = new Map(fallbackScenes.map((scene) => [scene.sceneNumber, scene]));
    return {
      scenes: Array.from({ length: sceneCount }, (_, index) => {
        const source = sceneByNumber.get(index + 1);
        return {
          sceneNumber: index + 1,
          dialogue: source?.dialogue || '',
        };
      }),
      voiceStyleInstruction: '',
      voiceoverScript: '',
      voiceGender: undefined,
    };
  };
  let parsed: {
    scenes?: { sceneNumber?: number; dialogue?: string; script?: string; text?: string }[];
    voiceStyleInstruction?: string;
    voiceoverScript?: string;
    voiceGender?: string;
  } | { sceneNumber?: number; dialogue?: string; script?: string; text?: string }[];

  try {
    parsed = parseAiJsonText(text) as typeof parsed;
  } catch {
    const fallbackScenes = parseSceneDialoguesFromText(text, sceneCount);
    if (fallbackScenes.length > 0) {
      return buildFallbackPreparedScenes(fallbackScenes);
    }
    throw new Error('Parse AI response ไม่ได้');
  }

  const parsedRecord = Array.isArray(parsed) ? {} : parsed;
  const sourceScenes = Array.isArray(parsed) ? parsed : Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (sourceScenes.length === 0) {
    const fallbackScenes = parseSceneDialoguesFromText(text, sceneCount);
    if (fallbackScenes.length > 0) {
      return buildFallbackPreparedScenes(fallbackScenes);
    }
    throw new Error('ไม่พบ scenes ใน AI response');
  }
  const rawVoiceGender = String(parsedRecord.voiceGender || '').trim().toLowerCase();
  const voiceGender = rawVoiceGender === 'female' || rawVoiceGender === 'male' || rawVoiceGender === 'neutral'
    ? rawVoiceGender
    : undefined;
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const source = sourceScenes[index] ?? {};
    return {
      sceneNumber: Number(source.sceneNumber || index + 1),
      dialogue: normalizeDialogueText(String(source.dialogue || source.script || source.text || '')),
    };
  });
  return {
    scenes,
    voiceStyleInstruction: String(parsedRecord.voiceStyleInstruction || '').trim(),
    voiceoverScript: normalizeVoiceoverScript(String(parsedRecord.voiceoverScript || '')),
    voiceGender,
  };
}

export const VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC =
  'Audio rule: no speech, narration, dialogue, lip sync, subtitles, or on-screen text. Add only subtle instrumental background music that fits the product, image mood, and scene; prefer light piano, soft acoustic, clean lifestyle music, or elegant minimal music when suitable. No vocals, no lyrics, no loud beats, no distracting sound effects. External voiceover will be added later.';

export const VOICEOVER_VIDEO_SILENT_RETRY_RULE =
  'Retry audio rule: create silent visual-only product footage. No speech, narration, dialogue, lip sync, subtitles, on-screen text, background music, sound effects, vocals, or lyrics. External voiceover will be added later.';

export function toVoiceoverSilentRetryPrompt(prompt: string): string {
  if (prompt.includes(VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC)) {
    return prompt.replace(VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC, VOICEOVER_VIDEO_SILENT_RETRY_RULE);
  }

  return [
    prompt,
    VOICEOVER_VIDEO_SILENT_RETRY_RULE,
  ].join('\n');
}

export function buildDesktopLikeVideoPrompts({
  product,
  scenes,
  voiceStyleInstruction,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  scenes: { sceneNumber: number; dialogue: string }[];
  voiceStyleInstruction: string;
  voiceover: boolean;
}): string[] {
  const video = product.settings.video;
  const basePrompt = stripPresetDialogueLine(promptForStep(product, 'video'));
  const style = promptFieldValue(basePrompt, 'สไตล์วิดีโอ') || video.presetStyleCustom || video.presetStyle || 'natural product review footage with clear product-first composition';
  const cameraMotion = promptFieldValue(basePrompt, 'การเคลื่อนกล้อง') || video.cameraMotionCustom || video.cameraMotion;

  return scenes.map((scene) => {
    if (voiceover) {
      return [
        `Create vertical product footage for scene ${scene.sceneNumber} using the attached reference image as the exact visual source.`,
        'Strictly preserve the scene, background, location, lighting direction, framing, and visible subject from the reference image. Do not create a new scene, new location, new background, new person, or new product.',
        product.name ? `Keep the product "${product.name}" clearly visible in the main frame throughout the clip. Do not hide it, blur it, crop it out, rotate it unnaturally, or turn it into a separate inset shot.` : 'Keep the product clearly visible in the main frame throughout the clip. Do not hide it, blur it, crop it out, rotate it unnaturally, or turn it into a separate inset shot.',
        'Use only the character, hands, pose direction, and product interaction implied by the reference image. If only hands are visible, show only hands. If the shot is product-only, keep it product-only.',
        'Face rule: if a face is visible in the reference image, keep the full face clear, sharp, natural, and unobstructed by product, hands, hair, hat, mask, glasses, shadows, frame edge, or any object. If the reference image does not show a face, do not reveal a new face.',
        `Visual style: ${style}.`,
        'The character or hands may smile, pose, hold, point to, wear, use, or demonstrate the product naturally, but must not speak, mouth words, or perform lip sync.',
        cameraMotion ? `Camera motion: ${cameraMotion}. Keep the movement subtle and do not zoom or pan in a way that reveals a distorted face or loses the product.` : '',
        VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC,
        'Output must be full screen with no black bars.',
        video.systemPrompt ? `Additional user instructions: ${video.systemPrompt}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      basePrompt,
      'ตำแหน่งสินค้าและการโต้ตอบต้องเป็นไปตามภาพที่แนบมา;',
      video.voiceCharacter === 'none' || video.dialogueMode === 'none'
        ? 'บทพูด: ไม่มีบทพูด ห้ามมีเสียงพูดใดๆ ในวิดีโอ;'
        : [
            voiceStyleInstruction ? `สไตล์เสียง: ${voiceStyleInstruction};` : '',
            scene.dialogue ? `บทพูด: ${scene.dialogue};` : '',
          ].filter(Boolean).join('\n'),
    ]
      .filter(Boolean)
      .join('\n');
  });
}

export function stripPresetDialogueLine(prompt: string): string {
  return prompt
    .split(/;\s*|\n+/)
    .map((part) => part.trim())
    .filter((part) => part && !/^บทพูด\/ข้อความประกอบ\s*:/i.test(part) && !/^บทพูด\s*:/i.test(part))
    .join('\n');
}

export function promptFieldValue(prompt: string, label: string): string {
  const prefix = `${label}:`;
  const line = prompt
    .split(/;\s*|\n+/)
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

export function buildGoogleFlowSelfScriptVideoPrompts({
  product,
  sceneCount,
  videoDuration,
}: {
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  videoDuration: number;
}): string[] {
  const video = product.settings.video;
  const rawBasePrompt = promptForStep(product, 'video');
  const basePrompt = video.promptMode === 'auto' ? stripPresetDialogueLine(rawBasePrompt) : rawBasePrompt;
  const noSpeech = video.voiceCharacter === 'none' || video.dialogueMode === 'none';

  return Array.from({ length: sceneCount }, (_, index) => {
    const sceneNumber = index + 1;
    return [
      basePrompt,
      `สร้างวิดีโอโฆษณาสินค้าภาษาไทยฉากที่ ${sceneNumber}/${sceneCount} จากรูป reference นี้`,
      'ใช้ฉาก พื้นหลัง สถานที่ สินค้า ตัวละคร หรือมือจากภาพที่แนบมาเท่านั้น ห้ามสร้างฉากใหม่ ห้ามเปลี่ยนสถานที่ ห้ามเพิ่มคนใหม่',
      product.name ? `สินค้า "${product.name}" ต้องเห็นชัดในเฟรมหลักตลอดฉาก` : 'สินค้าต้องเห็นชัดในเฟรมหลักตลอดฉาก',
      'ถ้าในภาพ reference เห็นใบหน้า ต้องรักษาให้ใบหน้าชัดเจน เปิดโล่ง ไม่ถูกสินค้า มือ ผม หมวก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บัง ถ้าไม่เห็นหน้า ห้าม reveal หน้าใหม่',
      noSpeech
        ? 'เสียง: ไม่มีเสียงพูด ไม่มีบทสนทนา ไม่มีคำบรรยายเสียง'
        : `เสียง: ให้ Google Flow คิดบทพูดภาษาไทยเองจากสินค้าและภาพฉากนี้ ไม่ต้องใช้บทพูดที่กำหนดไว้ล่วงหน้า เสียงควรพอดีกับคลิปประมาณ ${videoDuration} วินาที เป็นรีวิวสินค้าแบบ TikTok ที่พูดธรรมชาติและกระชับ`,
    ]
      .filter(Boolean)
      .join('\n');
  });
}

export function createFallbackMultiScenePromptResult({
  product,
  sceneCount,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  voiceover: boolean;
}): PreparedMultiScenePromptResult {
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    sceneNumber: index + 1,
    dialogue: normalizeDialogueText(dialogueForScene(product, index + 1)),
  }));

  return {
    prompts: buildDesktopLikeVideoPrompts({
      product,
      scenes,
      voiceStyleInstruction: '',
      voiceover,
    }),
    scenes,
    voiceStyleInstruction: '',
    voiceoverScript: '',
    voiceGender: 'neutral',
  };
}

export async function prepareAutoMultiScenePrompts({
  product,
  sceneCount,
  sceneImageDataUrls,
  sendImagesToAi,
  videoDuration,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  sceneImageDataUrls: string[];
  sendImagesToAi: boolean;
  videoDuration: number;
  voiceover: boolean;
}): Promise<PreparedMultiScenePromptResult> {
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนให้ AI คิดบทพูดหลายฉาก');
  }

  const images = sendImagesToAi
    ? sceneImageDataUrls.map(dataUrlToAiImage).filter((image): image is { base64: string; mimeType: string } => !!image?.base64)
    : [];
  if (sendImagesToAi && images.length < sceneCount) {
    throw new Error(`รูปฉากไม่ครบสำหรับให้ AI วิเคราะห์ (${images.length}/${sceneCount})`);
  }

  const aiBrain = await getAiBrainSettings();
  const response = await fetch(`${BACKEND_URL}/api/v1/ai/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: aiBrain.aiProvider,
      model: pickAiBrainModel(aiBrain),
      prompt: buildSceneDialoguePrompt(product, sceneCount, voiceover, videoDuration, sendImagesToAi),
      images,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { text?: string; message?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.message || data.error || 'AI คิดบทพูดหลายฉากไม่สำเร็จ');
  }
  if (!data.text?.trim()) {
    throw new Error('AI ไม่ส่งบทพูดหลายฉากกลับมา');
  }

  const prepared = parsePreparedScenes(data.text, sceneCount);
  const prompts = buildDesktopLikeVideoPrompts({
    product,
    scenes: prepared.scenes,
    voiceStyleInstruction: prepared.voiceStyleInstruction,
    voiceover,
  });
  return { ...prepared, prompts };
}

export async function rewriteVideoPromptForFlowError({
  error,
  originalPrompt,
  product,
}: {
  error: string;
  originalPrompt: string;
  product: GoogleFlowRunnerProduct;
}): Promise<{ prompt: string | null; error?: string }> {
  if (!originalPrompt.trim()) {
    return { prompt: null, error: 'ไม่มี prompt เดิมให้ rewrite' };
  }

  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    return { prompt: null, error: 'ยังไม่ได้เข้าสู่ระบบ' };
  }

  const audioFailure = isAudioGenerationFailure(error);
  const prompt = `${audioFailure
    ? 'Fix this Google Flow / Veo product video prompt because the previous generation failed specifically at audio generation.'
    : 'Rewrite this Google Flow / Veo product video prompt into a safer prompt because the previous generation failed.'}

Return only the final prompt text. Do not use markdown. Do not explain.

Product:
- Name: ${product.name || ''}
- Description: ${product.description || ''}
- Caption: ${product.caption || ''}
- CTA: ${product.cta || ''}

Failure:
${error || 'Generation failed'}

Original prompt:
"""${originalPrompt}"""

Rewrite requirements:
- Write clear generation instructions in English, except any spoken Thai dialogue.
- Preserve product identity, reference-image discipline, scene, character, camera framing, face visibility rule, no-subtitle rule, no-on-screen-text rule, and full-screen requirement from the original prompt.
- Keep the attached reference image as the exact visual source when the original prompt uses a reference image.
- Do not invent a new product, new person, new background, new location, or new face.
- If Thai speech is required, keep it plain, natural, TTS-safe, and about 6.3 to 7.0 seconds.
- If the failure is audio-related, simplify audio to one natural Thai narration voice. Remove or soften background music, sound effects, singing, shouting, whispering, ASMR, multiple speakers, and complex voice acting.
- If the original prompt requested no speech or voiceover visual-only footage, preserve that and do not add dialogue.
- Keep the final prompt concise enough for one Google Flow video generation.`.trim();

  try {
    const aiBrain = await getAiBrainSettings();
    const response = await fetch(`${BACKEND_URL}/api/v1/ai/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: aiBrain.aiProvider,
        model: pickAiBrainModel(aiBrain),
        prompt,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { text?: string; message?: string; error?: string };
    if (!response.ok) {
      return { prompt: null, error: data.message || data.error || 'AI rewrite prompt ไม่สำเร็จ' };
    }

    const rewritten = cleanAiPromptText(data.text || '');
    if (rewritten.length < 20) {
      return { prompt: null, error: 'AI rewrite prompt สั้นเกินไป' };
    }

    return { prompt: rewritten };
  } catch (fetchError) {
    return {
      prompt: null,
      error: fetchError instanceof Error ? fetchError.message : String(fetchError),
    };
  }
}

export function resolveGeminiTtsVoice(voiceCharacter?: string, voiceGender?: string): string {
  const directVoice = voiceCharacter?.startsWith('tts_') ? voiceCharacter.replace(/^tts_/, '') : '';
  if (directVoice) {
    return directVoice.charAt(0).toUpperCase() + directVoice.slice(1).toLowerCase();
  }
  const voiceMap: Record<string, string> = {
    female: 'Aoede',
    male: 'Puck',
    teen_girl: 'Leda',
    teen_boy: 'Fenrir',
    vendor_female: 'Kore',
    vendor_male: 'Charon',
    office_female: 'Callirrhoe',
    office_male: 'Iapetus',
    aunt: 'Sulafat',
    uncle: 'Orus',
    __custom__: 'Kore',
    '': voiceGender === 'female' ? 'Aoede' : voiceGender === 'male' ? 'Puck' : 'Kore',
  };
  return voiceMap[voiceCharacter || ''] || 'Kore';
}

export async function generateVoiceoverAudioDataUrl({
  durationSeconds,
  product,
  sceneDialogues,
  sceneCount,
  voiceStyleInstruction,
  voiceoverScript,
  voiceGender,
}: {
  durationSeconds: number;
  product: GoogleFlowRunnerProduct;
  sceneDialogues?: string[];
  sceneCount: number;
  voiceStyleInstruction?: string;
  voiceoverScript?: string;
  voiceGender?: string;
}): Promise<string | null> {
  const aiSceneScript = sceneDialogues?.map((line) => line.trim()).filter(Boolean).join(' ') ?? '';
  const fallbackScript = Array.from({ length: sceneCount }, (_, index) => dialogueForScene(product, index + 1))
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  const script = voiceoverScript?.trim() || aiSceneScript || fallbackScript;
  if (!script) {
    return null;
  }
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนสร้างเสียงพากษ์');
  }
  const response = await fetch(`${BACKEND_URL}/api/v1/ai/voiceover`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      voiceoverScript: script,
      sceneCount,
      durationSeconds,
      voiceStyleInstruction,
      voice: resolveGeminiTtsVoice(product.settings.video.voiceCharacter, voiceGender),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    audioBase64?: string;
    mimeType?: string;
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(data.message || data.error || 'สร้างเสียงพากษ์ไม่สำเร็จ');
  }
  const audioBase64 = data.audioBase64?.trim();
  if (!audioBase64) {
    throw new Error('API ไม่ส่งไฟล์เสียงพากษ์กลับมา');
  }
  if (audioBase64.startsWith('data:')) {
    return audioBase64;
  }
  return `data:${data.mimeType || 'audio/wav'};base64,${audioBase64}`;
}

export function promptForStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): string {
  const prompt = product.prompts?.[step]?.trim();
  if (prompt) return prompt;

  const productName = product.name?.trim() || 'สินค้า';
  const description = product.description?.trim();
  return [productName, description].filter(Boolean).join('\n');
}
