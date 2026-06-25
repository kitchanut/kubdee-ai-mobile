import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Square, X } from 'lucide-react-native';

import {
  emitGoogleFlowRunnerLog,
  registerGoogleFlowWebViewRunnerHost,
} from '@/autopilot/googleFlowRunnerBridge';
import { BACKEND_URL } from '@/auth/constants';
import { getStoredAuthTokens } from '@/auth/storage';
import type {
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerLogEntry,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerProduct,
} from '@/autopilot/types';
import FlowWebView, { type FlowConnectionState, type FlowWebViewHandle } from '@/flow/FlowWebView';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import {
  mergeGoogleFlowVideos,
  saveGoogleFlowDataUrlAsset,
  waitForGoogleFlowDownload,
} from '@/native/AccessibilityBridge';

interface GoogleFlowWebViewRunnerHostProps {
  theme: KubdeeTheme;
}

interface FlowResultPoll {
  videos?: string[];
  images?: number;
  failedCount?: number;
  successCount?: number;
  generatingCount?: number;
  queuedCount?: number;
  tilesFound?: number;
  progress?: number | null;
}

interface FlowSnapshot {
  videoUrls?: string[];
  tileCount?: number;
}

interface FlowDownloadPayload {
  method?: string;
  urlKind?: string;
  url?: string;
  dataUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

interface FlowImageDownloadPayload {
  images?: Array<{
    url?: string;
    dataUrl?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number | null;
  }>;
  found?: number;
  errors?: string[];
}

interface PreparedMultiScenePromptResult {
  prompts: string[];
  scenes: Array<{ sceneNumber: number; dialogue: string }>;
  voiceStyleInstruction: string;
  voiceoverScript: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class GoogleFlowWebViewRunnerStopped extends Error {
  constructor() {
    super('Google Flow WebView runner stopped');
  }
}

function stepLabel(step: AutoPilotStepType): string {
  return step === 'image' ? 'รูปภาพ' : 'วิดีโอ';
}

function outputCountForStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): number {
  const raw = product.settings[step]?.outputCount;
  const value = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function imageModelForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): string {
  return product.settings.image.imageModel || settings.flowImageModel || 'nano_banana_pro';
}

function videoModelForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): string {
  return product.settings.video.videoModel || settings.flowVideoModel || 'veo_31_lite_lower';
}

function videoDurationForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): number {
  const model = videoModelForProduct(product, settings);
  const raw = Number(product.settings.video.videoDuration || settings.flowVideoDuration || 8);
  const configured = Number.isFinite(raw) && raw > 0 ? raw : 8;
  return model === 'omni_flash' ? configured : Math.min(configured, 8);
}

function clampAutoSceneCount(value: string | number | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  return Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 1;
}

function isAutoMultiSceneVideo(product: GoogleFlowRunnerProduct): boolean {
  const video = product.settings.video;
  return (video.videoMethod || 'extend') === 'multi' && clampAutoSceneCount(video.sceneCount) > 1;
}

function autoMultiSceneMode(product: GoogleFlowRunnerProduct): string {
  return product.settings.video.multiSceneAngleMode || 'same_angle';
}

const FACE_VISIBILITY_IMAGE_INSTRUCTION =
  'ถ้าเห็นใบหน้าคนต้องเห็นชัดเจนเต็มหน้าและไม่ถูกอะไรบัง ถ้าฉากนี้ไม่ควรเห็นหน้าก็ไม่ต้อง reveal หน้าเลย ห้ามใช้มุมที่เห็นหน้าครึ่ง ๆ กลาง ๆ หรือมีวัตถุบังหน้า';
const SAME_ANGLE_PRESENTER_IMAGE_INSTRUCTION =
  'สำหรับวิดีโอหลายฉากแบบมุมเดียว ให้จัดตัวละครหันหน้ามองกล้องโดยตรง สีหน้าเป็นธรรมชาติ ท่าทางพร้อมพูดหรือพรีเซนต์สินค้า มือถือหรือใช้งานสินค้าในตำแหน่งที่เห็นชัด เหมาะสำหรับนำรูปเดียวไปสร้างวิดีโอหลายฉากที่บทพูดเปลี่ยนไปเรื่อย ๆ';

function getAutoMultiSceneImageVariationInstruction(sceneNumber: number, totalScenes: number): string {
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

function dialogueForScene(product: GoogleFlowRunnerProduct, sceneNumber: number): string {
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
  return product.caption?.trim() || 'พูดแนะนำจุดเด่นสินค้าแบบกระชับ เป็นภาษาไทย ฟังเป็นธรรมชาติ';
}

function multiSceneImagePrompt(product: GoogleFlowRunnerProduct, sceneNumber: number, totalScenes: number, sameAngle: boolean): string {
  return [
    `สร้างภาพฉากที่ ${sceneNumber}/${totalScenes} สำหรับวิดีโอหลายฉากของสินค้า "${product.name || 'สินค้า'}"`,
    getAutoMultiSceneImageVariationInstruction(sceneNumber, totalScenes),
    sameAngle ? SAME_ANGLE_PRESENTER_IMAGE_INSTRUCTION : 'คงตัวละครเดิม ใบหน้าเดิม สินค้าเดิม แพ็กเกจเดิม และแบรนด์เดิม แต่เปลี่ยนมุมกล้อง ระยะภาพ การกระทำ หรือบริบทให้ต่างจากฉากก่อนหน้าอย่างชัดเจน',
    FACE_VISIBILITY_IMAGE_INSTRUCTION,
    'ห้ามใส่ subtitle หรือข้อความบนภาพเองถ้าไม่ได้ตั้งค่าไว้',
  ]
    .filter(Boolean)
    .join(' ');
}

function multiSceneVideoPrompt(product: GoogleFlowRunnerProduct, basePrompt: string, sceneNumber: number, totalScenes: number, voiceover: boolean): string {
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

function dataUrlToAiImage(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return { mimeType: match[1] || 'image/jpeg', base64: match[2] || '' };
}

function cleanAiJsonText(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/g, '')
    .trim();
}

function normalizeDialogueText(text: string): string {
  return text
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSceneDialoguePrompt(product: GoogleFlowRunnerProduct, sceneCount: number, voiceover: boolean): string {
  const video = product.settings.video;
  const customDialogue = (() => {
    if (video.dialogueMode !== 'custom') return '';
    const list = (video.dialogueList ?? []).map((line) => line.trim()).filter(Boolean);
    if (list.length > 0) {
      return list.map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`).join('\n');
    }
    if (video.dialogue.trim()) {
      return video.dialogue
        .split('|')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`)
        .join('\n');
    }
    return '';
  })();

  return `
คุณคือผู้กำกับวิดีโอโฆษณาสินค้าแบบสั้นบนมือถือ

สินค้า:
- ชื่อ: ${product.name || 'สินค้า'}
- รายละเอียด: ${product.description || ''}
- Caption: ${product.caption || ''}
- Hashtags: ${product.hashtags || ''}
- CTA: ${product.cta || ''}

มีรูปแนบ ${sceneCount} รูป เรียงตามฉากที่ 1 ถึงฉากที่ ${sceneCount}
ให้วิเคราะห์รูปแต่ละฉาก แล้วเขียนบทพูดภาษาไทยให้สัมพันธ์กับภาพนั้นจริง ๆ

การตั้งค่า:
- จำนวนฉาก: ${sceneCount}
- โหมด: ${voiceover ? 'เสียงพากษ์รวมภายหลัง วิดีโอแต่ละฉากต้องเป็นภาพล้วน' : 'หลายมุมพร้อมเสียงพูดในวิดีโอแต่ละฉาก'}
- สไตล์บทพูด: ${video.scriptStyleCustom || video.scriptStyle || 'รีวิวเป็นกันเอง'}
- เสียง: ${video.voiceCharacterCustom || video.voiceCharacter || 'auto'}
- โหมดบทพูด: ${video.dialogueMode}
${customDialogue ? `\nบทพูดที่ผู้ใช้กำหนด:\n${customDialogue}` : ''}

กฎสำคัญ:
- ต้องมี scenes ครบ ${sceneCount} ฉากเท่านั้น
- dialogue แต่ละฉากต้องยาวพอพูดได้ประมาณ 6.5 วินาที ประมาณ 65 ถึง 90 ตัวอักษรไทย
- ให้ต่อเนื่องแบบ hook, demo/benefit/proof, CTA ตามจำนวนฉาก
- ถ้าโหมดเสียงพากษ์ ให้เขียน voiceoverScript รวมทั้งคลิป ยาวพอสำหรับวิดีโอรวม และ dialogue รายฉากยังต้องมีไว้เป็นแผนเนื้อหา
- ห้ามใส่ emoji, hashtag, subtitle, timestamp, หมายเลขฉาก หรือคำอธิบายใน dialogue
- ห้ามใช้อักขระพิเศษ ตัวเลขดิบ หรือสัญลักษณ์ที่ TTS อ่านยาก ให้เขียนเป็นคำไทยธรรมชาติ
- ถ้าภาพเป็นสินค้าอย่างเดียวหรือมืออย่างเดียว ห้ามแต่งบทเหมือนมีคนพูดอยู่ในภาพ ให้เป็นเสียงบรรยายขายสินค้าแทน

ตอบกลับเป็น JSON เท่านั้น:
{
  "voiceStyleInstruction": "English voice style instruction here",
  "voiceoverScript": "${voiceover ? 'บทพากษ์รวมทั้งคลิป' : ''}",
  "scenes": [
    { "sceneNumber": 1, "dialogue": "บทพูดภาษาไทยของฉากนี้" }
  ]
}
`.trim();
}

function parsePreparedScenes(text: string, sceneCount: number): Pick<PreparedMultiScenePromptResult, 'scenes' | 'voiceStyleInstruction' | 'voiceoverScript'> {
  const parsed = JSON.parse(cleanAiJsonText(text)) as {
    scenes?: Array<{ sceneNumber?: number; dialogue?: string; script?: string; text?: string }>;
    voiceStyleInstruction?: string;
    voiceoverScript?: string;
  };
  const sourceScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const source = sourceScenes[index] ?? {};
    return {
      sceneNumber: Number(source.sceneNumber || index + 1),
      dialogue: normalizeDialogueText(String(source.dialogue || source.script || source.text || '')),
    };
  });
  return {
    scenes,
    voiceStyleInstruction: String(parsed.voiceStyleInstruction || '').trim(),
    voiceoverScript: normalizeDialogueText(String(parsed.voiceoverScript || '')),
  };
}

function buildDesktopLikeVideoPrompts({
  product,
  scenes,
  voiceStyleInstruction,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  scenes: Array<{ sceneNumber: number; dialogue: string }>;
  voiceStyleInstruction: string;
  voiceover: boolean;
}): string[] {
  const video = product.settings.video;
  const style = video.presetStyleCustom || video.presetStyle || 'natural product review footage with clear product-first composition';
  const cameraMotion = video.cameraMotionCustom || video.cameraMotion;

  return scenes.map((scene) => {
    if (voiceover) {
      return [
        `Create vertical product footage for scene ${scene.sceneNumber} using the attached reference image as the exact visual source.`,
        'Strictly preserve the scene, background, location, lighting direction, framing, visible product, visible character or hands from the reference image. Do not create a new scene, new location, new person, or new product.',
        product.name ? `Keep the product "${product.name}" clearly visible in the main frame throughout the clip.` : 'Keep the product clearly visible in the main frame throughout the clip.',
        'Use only the character, hands, pose direction, and product interaction implied by the reference image. If only hands are visible, show only hands. If the shot is product-only, keep it product-only.',
        'Face rule: if a face is visible in the reference image, keep the full face clear, sharp, natural, and unobstructed. If the reference image does not show a face, do not reveal a new face.',
        `Visual style: ${style}.`,
        cameraMotion ? `Camera motion: ${cameraMotion}. Keep movement subtle and keep the product visible.` : '',
        'Audio rule: no speech, narration, dialogue, lip sync, subtitles, or on-screen text. External voiceover will be added later.',
        'Output must be full screen with no black bars.',
        video.systemPrompt ? `Additional user instructions: ${video.systemPrompt}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      'สร้างวิดีโอโฆษณาสินค้าภาษาไทย ต้องใช้ฉากและตัวละครหรือมือจากภาพที่แนบมาเท่านั้น ห้ามสร้างฉากใหม่ ห้ามเปลี่ยนสถานที่ตลอดทั้งวิดีโอ;',
      'ฉาก: ใช้ฉากจากภาพที่แนบมาเท่านั้น พื้นหลังและสถานที่ต้องเหมือนกับในภาพทุกประการ;',
      'ตัวละคร: ใช้ตัวละครหรือมือจากภาพที่แนบมา คงลักษณะเดิมทุกประการตลอดทั้งวิดีโอ ถ้าในภาพเห็นแค่มือก็ให้เห็นแค่มือ;',
      'ใบหน้าคน: ถ้าในภาพ reference เห็นใบหน้า ต้องรักษาให้ใบหน้าชัดเจน ไม่ถูกสินค้า มือ ผม หมวก หน้ากาก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บดบัง และไม่เบลอ ถ้าภาพ reference ไม่เห็นหน้า ห้าม reveal หน้าใหม่;',
      'ตำแหน่งสินค้าและการโต้ตอบต้องเป็นไปตามภาพที่แนบมา;',
      `สไตล์วิดีโอ: ${style};`,
      cameraMotion ? `การเคลื่อนกล้อง: ${cameraMotion};` : '',
      video.voiceCharacter === 'none' || video.dialogueMode === 'none'
        ? 'บทพูด: ไม่มีบทพูด ห้ามมีเสียงพูดใดๆ ในวิดีโอ;'
        : [
            voiceStyleInstruction ? `สไตล์เสียง: ${voiceStyleInstruction};` : '',
            video.voiceCharacterCustom ? `เสียงพากย์: ${video.voiceCharacterCustom};` : '',
            `สไตล์บทพูด: ${video.scriptStyleCustom || video.scriptStyle || 'รีวิวเป็นกันเอง'};`,
            scene.dialogue ? `บทพูด: ${scene.dialogue};` : '',
          ].filter(Boolean).join('\n'),
      video.musicSfxMode === 'none' ? 'เสียงดนตรีและเอฟเฟค: ห้ามมีเสียงดนตรีหรือเสียงเอฟเฟคใดๆ ทั้งสิ้น;' : '',
      video.musicSfxMode === 'custom' && video.musicSfxCustom ? `เสียงดนตรีและเอฟเฟค: ${video.musicSfxCustom};` : '',
      'ความต่อเนื่อง: ห้ามเปลี่ยนฉาก ห้ามเปลี่ยนสถานที่ ห้ามเปลี่ยนพื้นหลัง วิดีโอทั้งหมดต้องอยู่ในที่เดียวตั้งแต่ต้นจนจบ;',
      'ข้อห้าม: ห้ามมี subtitle ห้ามมีข้อความบนจอ ทุกบทพูดต้องเป็นเสียงเท่านั้น ห้ามมีขอบดำ วิดีโอต้องเต็มจอ;',
      video.systemPrompt ? `คำสั่งเพิ่มเติม: ${video.systemPrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
}

async function prepareAutoMultiScenePrompts({
  product,
  sceneCount,
  sceneImageDataUrls,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  sceneImageDataUrls: string[];
  voiceover: boolean;
}): Promise<PreparedMultiScenePromptResult> {
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนให้ AI คิดบทพูดหลายฉาก');
  }

  const images = sceneImageDataUrls.map(dataUrlToAiImage).filter((image): image is { base64: string; mimeType: string } => !!image?.base64);
  if (images.length < sceneCount) {
    throw new Error(`รูปฉากไม่ครบสำหรับให้ AI วิเคราะห์ (${images.length}/${sceneCount})`);
  }

  const response = await fetch(`${BACKEND_URL}/api/v1/ai/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      prompt: buildSceneDialoguePrompt(product, sceneCount, voiceover),
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

function resolveGeminiTtsVoice(voiceCharacter?: string): string {
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
    '': 'Kore',
  };
  return voiceMap[voiceCharacter || ''] || 'Kore';
}

async function generateVoiceoverAudioDataUrl({
  durationSeconds,
  product,
  sceneCount,
  voiceStyleInstruction,
  voiceoverScript,
}: {
  durationSeconds: number;
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  voiceStyleInstruction?: string;
  voiceoverScript?: string;
}): Promise<string | null> {
  const script = voiceoverScript?.trim() || Array.from({ length: sceneCount }, (_, index) => dialogueForScene(product, index + 1))
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
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
      voice: resolveGeminiTtsVoice(product.settings.video.voiceCharacter),
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

function promptForStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): string {
  const prompt = product.prompts?.[step]?.trim();
  if (prompt) return prompt;

  const productName = product.name?.trim() || 'สินค้า';
  const description = product.description?.trim();
  return [productName, description].filter(Boolean).join('\n');
}

function getReferenceFileName(product: GoogleFlowRunnerProduct): string {
  const code = product.productId || product.catalogId || product.id || 'product';
  return `kubdee-reference-${code.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48)}.png`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('อ่านรูป reference ไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}

async function loadImageReferenceDataUrl(uri: string): Promise<string | null> {
  const cleanUri = uri.trim();
  if (!cleanUri) {
    return null;
  }
  if (cleanUri.startsWith('data:image/')) {
    return cleanUri;
  }

  try {
    const response = await fetch(cleanUri);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.size) {
      return null;
    }
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

export default function GoogleFlowWebViewRunnerHost({
  theme,
}: GoogleFlowWebViewRunnerHostProps): React.JSX.Element {
  const flowRef = useRef<FlowWebViewHandle>(null);
  const runningRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const payloadRef = useRef<GoogleFlowRunnerPayload | null>(null);
  const flowStatusRef = useRef<FlowConnectionState>('unknown');
  const [visible, setVisible] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowConnectionState>('unknown');
  const [overlayLogs, setOverlayLogs] = useState<string[]>([]);

  const emit = useCallback((entry: Omit<GoogleFlowRunnerLogEntry, 'ts'> & { ts?: number }): void => {
    emitGoogleFlowRunnerLog(entry);
    if (entry.message) {
      setOverlayLogs((current) => [...current.slice(-7), entry.message]);
    }
  }, []);

  const checkStop = useCallback((): void => {
    if (stopRequestedRef.current) {
      throw new GoogleFlowWebViewRunnerStopped();
    }
  }, []);

  const waitForHandle = useCallback(async (): Promise<FlowWebViewHandle> => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (flowRef.current) {
        return flowRef.current;
      }
      await sleep(250);
    }
    throw new Error('WebView ยังไม่พร้อม');
  }, []);

  const runActionOrThrow = useCallback(
    async (
      handle: FlowWebViewHandle,
      action: Parameters<FlowWebViewHandle['runAction']>[0],
      args: Record<string, unknown>,
      timeoutMs: number
    ): Promise<Record<string, unknown>> => {
      checkStop();
      const result = await handle.runAction(action, args, timeoutMs);
      checkStop();
      if (!result.ok) {
        throw new Error(result.error || `${action} ไม่สำเร็จ`);
      }
      return result.result ?? {};
    },
    [checkStop]
  );

  const openGoogleFlowProject = useCallback(
    async ({
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
    }: {
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
    }): Promise<Record<string, unknown>> => {
      const startedAt = Date.now();
      let lastError = '';

      while (Date.now() - startedAt < 120_000) {
        checkStop();
        const status = flowStatusRef.current;
        if (status === 'signin' || status === 'loggedout') {
          throw new Error('ยังไม่ได้เชื่อมต่อ Google Flow ใน WebView');
        }

        try {
          return await runActionOrThrow(handle, 'newProject', {}, 35_000);
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'wait_flow_ready',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `รอ Google Flow WebView พร้อม (${status})`,
          });
          await sleep(3000);
        }
      }

      throw new Error(lastError || 'รอ Google Flow WebView พร้อมไม่สำเร็จ');
    },
    [checkStop, emit, runActionOrThrow]
  );

  const waitForStepResult = useCallback(
    async ({
      baselineVideoUrls,
      count,
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
    }: {
      baselineVideoUrls: string[];
      count: number;
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
    }): Promise<FlowResultPoll> => {
      const startedAt = Date.now();
      const timeoutMs = step === 'video' ? 300_000 : 180_000;
      let failConfirm = 0;
      let doneConfirm = 0;

      while (Date.now() - startedAt < timeoutMs) {
        checkStop();
        await sleep(4000);
        const result = (await runActionOrThrow(
          handle,
          'videoResults',
          { count, ignoreUrls: baselineVideoUrls },
          20_000
        )) as FlowResultPoll;

        const generating = result.generatingCount ?? 0;
        const queued = result.queuedCount ?? 0;
        const failed = result.failedCount ?? 0;
        const videos = result.videos ?? [];
        const imageCount = result.images ?? 0;
        const progress = result.progress;
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'waiting_result',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `รอผล${stepLabel(step)}: gen ${generating} queue ${queued} ok ${result.successCount ?? 0} fail ${failed}${
            progress != null ? ` ${progress}%` : ''
          }`,
        });

        if (generating > 0 || queued > 0 || progress != null || (result.tilesFound ?? 0) === 0) {
          failConfirm = 0;
          doneConfirm = 0;
          continue;
        }

        const hasOutput = step === 'video' ? videos.length > 0 : imageCount > 0;
        if (hasOutput) {
          doneConfirm += 1;
          if (doneConfirm >= 2) {
            return result;
          }
        } else if (failed > 0) {
          failConfirm += 1;
          if (failConfirm >= 3) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'failed',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}`,
            });
            throw new Error(`Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}`);
          }
        } else {
          failConfirm = 0;
          doneConfirm = 0;
        }
      }

      throw new Error(`หมดเวลารอผล${stepLabel(step)}`);
    },
    [checkStop, emit, runActionOrThrow]
  );

  const runProductStep = useCallback(
    async ({
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
    }: {
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
    }): Promise<void> => {
      const label = stepLabel(step);
      const count = outputCountForStep(product, step);
      const prompt = promptForStep(product, step);
      if (!prompt.trim()) {
        throw new Error(`prompt ${label} ว่าง`);
      }

      if (step === 'video' && isAutoMultiSceneVideo(product)) {
        const sceneCount = clampAutoSceneCount(product.settings.video.sceneCount);
        const sceneMode = autoMultiSceneMode(product);
        const useSameAngle = sceneMode === 'same_angle';
        const useVoiceover = sceneMode === 'voiceover';
        const imageModel = imageModelForProduct(product, payload.settings);
        const videoModel = videoModelForProduct(product, payload.settings);
        const videoDuration = videoDurationForProduct(product, payload.settings);

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'multi_scene_start',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `เริ่มวิดีโอหลายฉาก ${sceneCount} ฉาก (${useSameAngle ? 'มุมเดียว' : useVoiceover ? 'เสียงพากษ์' : 'หลายมุม'})`,
        });

        await openGoogleFlowProject({
          handle,
          payload,
          product,
          productIndex,
          round,
          step,
        });

        const hasPriorImageStep = payload.enabledSteps.includes('image');
        const neededSceneImages = useSameAngle ? (hasPriorImageStep ? 0 : 1) : hasPriorImageStep ? sceneCount - 1 : sceneCount;
        const firstGeneratedSceneNumber = !useSameAngle && hasPriorImageStep ? 2 : 1;
        const sceneImageDataUrls: string[] = [];

        if (hasPriorImageStep) {
          await runActionOrThrow(handle, 'selectRecentImage', { indexOffset: 0 }, 45_000);
          const priorImagePayload = (await runActionOrThrow(
            handle,
            'downloadImages',
            { count: 1 },
            90_000
          )) as FlowImageDownloadPayload;
          const priorImageDataUrl = priorImagePayload.images?.find((image) => image.dataUrl)?.dataUrl;
          if (priorImageDataUrl) {
            sceneImageDataUrls.push(priorImageDataUrl);
          }
        }

        for (let sceneIndex = 0; sceneIndex < neededSceneImages; sceneIndex += 1) {
          checkStop();
          const sceneNumber = firstGeneratedSceneNumber + sceneIndex;
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step: 'image',
            stage: 'multi_scene_image',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `หลายฉาก: สร้างรูปฉาก ${sceneNumber}/${sceneCount}`,
          });

          const config = (await runActionOrThrow(
            handle,
            'configurePopper',
            {
              targetMode: 'image',
              aspectRatio: product.settings.image.aspectRatio,
              outputCount: 1,
              imageModel,
            },
            70_000
          )) as { success?: boolean; error?: string };
          if (config.success === false) {
            throw new Error(`ตั้งค่า Flow รูปฉากไม่ครบ: ${config.error ?? 'unknown'}`);
          }

          if (sceneNumber > 1 || hasPriorImageStep) {
            await runActionOrThrow(handle, 'selectRecentImage', { indexOffset: 0 }, 45_000);
          } else if (product.preview) {
            const dataUrl = await loadImageReferenceDataUrl(product.preview);
            await runActionOrThrow(
              handle,
              'uploadReferenceImage',
              {
                dataUrl: dataUrl ?? undefined,
                fileName: getReferenceFileName(product),
                imageUrl: dataUrl ? undefined : product.preview,
              },
              120_000
            );
          }

          await runActionOrThrow(
            handle,
            'fillPrompt',
            {
              prompt: multiSceneImagePrompt(product, sceneNumber, sceneCount, useSameAngle),
            },
            45_000
          );
          await runActionOrThrow(handle, 'submit', {}, 45_000);
          const imageResult = await waitForStepResult({
            baselineVideoUrls: [],
            count: 1,
            handle,
            payload,
            product,
            productIndex,
            round,
            step: 'image',
          });
          const imageCount = Math.max(1, Number(imageResult.images ?? 1) || 1);
          const imagePayload = (await runActionOrThrow(
            handle,
            'downloadImages',
            { count: imageCount },
            90_000
          )) as FlowImageDownloadPayload;
          const firstImage = imagePayload.images?.find((image) => image.dataUrl);
          if (firstImage?.dataUrl) {
            sceneImageDataUrls.push(firstImage.dataUrl);
            const downloaded = await saveGoogleFlowDataUrlAsset('image', firstImage.dataUrl, firstImage.fileName);
            if (downloaded?.uri) {
              emit({
                event: 'asset',
                runId: payload.runId,
                status: 'running',
                step: 'image',
                stage: 'generated',
                productId: product.id,
                productName: product.name,
                fileUri: downloaded.uri,
                fileName: downloaded.fileName,
                mimeType: downloaded.mimeType || firstImage.mimeType || 'image/png',
                sizeBytes: downloaded.sizeBytes || firstImage.sizeBytes || undefined,
                createdAt: downloaded.createdAt || Date.now(),
                message: `ได้รูปฉาก ${sceneNumber}/${sceneCount} แล้ว`,
              });
            }
          }
        }

        const promptImageDataUrls = useSameAngle
          ? Array.from({ length: sceneCount }, () => sceneImageDataUrls[0]).filter(Boolean)
          : sceneImageDataUrls.slice(0, sceneCount);

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'multi_scene_prepare_prompts',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: useVoiceover ? `เตรียมส่งรูป ${sceneCount} ฉากให้ AI คิดบทพากษ์รวม` : `เตรียมส่งรูป ${sceneCount} ฉากให้ AI คิดบทพูด`,
        });

        const promptResult = await prepareAutoMultiScenePrompts({
          product,
          sceneCount,
          sceneImageDataUrls: promptImageDataUrls,
          voiceover: useVoiceover,
        });

        for (const scene of promptResult.scenes) {
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'multi_scene_dialogue_ready',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `บทฉาก ${scene.sceneNumber}: ${scene.dialogue.slice(0, 80)}`,
          });
        }

        const sceneVideoUris: string[] = [];
        for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
          checkStop();
          const sceneNumber = sceneIndex + 1;
          const referenceOffset = useSameAngle ? 0 : Math.max(0, sceneCount - sceneNumber);
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'multi_scene_video',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `หลายฉาก: สร้างวิดีโอฉาก ${sceneNumber}/${sceneCount}`,
          });

          const config = (await runActionOrThrow(
            handle,
            'configurePopper',
            {
              targetMode: 'video',
              aspectRatio: product.settings.video.aspectRatio,
              outputCount: 1,
              videoDuration,
              videoModel,
            },
            70_000
          )) as { success?: boolean; error?: string };
          if (config.success === false) {
            throw new Error(`ตั้งค่า Flow วิดีโอฉากไม่ครบ: ${config.error ?? 'unknown'}`);
          }

          if (neededSceneImages > 0 || payload.enabledSteps.includes('image')) {
            await runActionOrThrow(handle, 'selectRecentImage', { indexOffset: referenceOffset }, 45_000);
          } else if (product.preview) {
            const dataUrl = await loadImageReferenceDataUrl(product.preview);
            await runActionOrThrow(
              handle,
              'uploadReferenceImage',
              {
                dataUrl: dataUrl ?? undefined,
                fileName: getReferenceFileName(product),
                imageUrl: dataUrl ? undefined : product.preview,
              },
              120_000
            );
          }

          const snapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
          const baselineVideoUrls = snapshot.videoUrls ?? [];
          await runActionOrThrow(
            handle,
            'fillPrompt',
            { prompt: promptResult.prompts[sceneIndex] || multiSceneVideoPrompt(product, prompt, sceneNumber, sceneCount, useVoiceover) },
            45_000
          );
          await runActionOrThrow(handle, 'submit', {}, 45_000);
          const videoResult = await waitForStepResult({
            baselineVideoUrls,
            count: 1,
            handle,
            payload,
            product,
            productIndex,
            round,
            step,
          });

          const [url] = videoResult.videos ?? [];
          if (!url) {
            throw new Error(`สร้างวิดีโอฉาก ${sceneNumber} แล้วแต่ไม่พบ URL สำหรับดาวน์โหลด`);
          }
          const downloadStartedAt = Date.now();
          const downloadPayload = (await runActionOrThrow(
            handle,
            'downloadVideo',
            { url, index: 0 },
            120_000
          )) as FlowDownloadPayload;
          let downloaded = downloadPayload.dataUrl
            ? await saveGoogleFlowDataUrlAsset('video', downloadPayload.dataUrl, downloadPayload.fileName)
            : null;
          if (!downloaded?.uri) {
            downloaded = await waitForGoogleFlowDownload('video', downloadStartedAt, 15_000);
          }
          if (!downloaded?.uri) {
            throw new Error(`ดาวน์โหลดวิดีโอฉาก ${sceneNumber} ลงมือถือไม่สำเร็จ`);
          }
          sceneVideoUris.push(downloaded.uri);
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'scene_video_ready',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `ได้วิดีโอฉาก ${sceneNumber}/${sceneCount} แล้ว เตรียมรวมไฟล์`,
          });
        }

        let voiceoverDataUrl: string | null = null;
        if (useVoiceover) {
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'voiceover',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: 'กำลังสร้างเสียงพากษ์รวมสำหรับวิดีโอหลายฉาก',
          });
          voiceoverDataUrl = await generateVoiceoverAudioDataUrl({
            durationSeconds: Math.max(1, Math.round(sceneCount * Math.max(1, videoDuration - 0.5) - 1)),
            product,
            sceneCount,
            voiceStyleInstruction: promptResult.voiceStyleInstruction,
            voiceoverScript: promptResult.voiceoverScript,
          });
        }

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'merge_video',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: useVoiceover ? 'กำลังรวมวิดีโอหลายฉากพร้อมเสียงพากษ์' : 'กำลังรวมวิดีโอหลายฉาก',
        });
        const merged = await mergeGoogleFlowVideos(sceneVideoUris, voiceoverDataUrl);
        if (!merged?.uri) {
          throw new Error('รวมวิดีโอหลายฉากบนมือถือไม่สำเร็จ');
        }
        emit({
          event: 'asset',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'generated',
          productId: product.id,
          productName: product.name,
          fileUri: merged.uri,
          fileName: merged.fileName,
          mimeType: merged.mimeType || 'video/mp4',
          sizeBytes: merged.sizeBytes,
          createdAt: merged.createdAt || Date.now(),
          message: useVoiceover ? 'ได้วิดีโอรวมพร้อมเสียงพากษ์แล้ว' : `ได้วิดีโอรวม ${sceneCount} ฉากแล้ว`,
        });

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'multi_scene_done',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `วิดีโอหลายฉากสร้างครบ ${sceneCount} ฉากแล้ว`,
        });
        return;
      }

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'open_project',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `เข้า Google Flow project สำหรับ${label}`,
      });
      const newProject = await openGoogleFlowProject({
        handle,
        payload,
        product,
        productIndex,
        round,
        step,
      });
      emit({
        runId: payload.runId,
        status: 'running',
        message: newProject.already ? 'อยู่ใน Google Flow project อยู่แล้ว' : 'เข้า Google Flow project แล้ว',
      });

      const configArgs =
        step === 'image'
          ? {
              targetMode: 'image',
              aspectRatio: product.settings.image.aspectRatio,
              outputCount: count,
              imageModel: imageModelForProduct(product, payload.settings),
            }
          : {
              targetMode: 'video',
              aspectRatio: product.settings.video.aspectRatio,
              outputCount: count,
              videoDuration: videoDurationForProduct(product, payload.settings),
              videoModel: videoModelForProduct(product, payload.settings),
            };
      const config = (await runActionOrThrow(handle, 'configurePopper', configArgs, 70_000)) as {
        success?: boolean;
        error?: string;
      };
      if (config.success === false) {
        emit({
          runId: payload.runId,
          status: 'running',
          message: `ตั้งค่า Flow ไม่ครบ: ${config.error ?? 'unknown'}`,
        });
        throw new Error(`ตั้งค่า Flow ไม่ครบ: ${config.error ?? 'unknown'}`);
      } else {
        emit({ runId: payload.runId, status: 'running', message: `ตั้งค่าโหมด${label}แล้ว` });
      }

      const shouldUsePreviousImage = step === 'video' && payload.enabledSteps.includes('image');
      if (shouldUsePreviousImage) {
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'attach_reference',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: 'แนบรูปที่เพิ่งสร้างจาก Google Flow เป็น reference วิดีโอ',
        });
        await runActionOrThrow(handle, 'selectRecentImage', { indexOffset: 0 }, 45_000);
      } else if (product.preview) {
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'attach_reference',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `แนบรูปสินค้า reference สำหรับ${label}`,
        });
        const dataUrl = await loadImageReferenceDataUrl(product.preview);
        await runActionOrThrow(
          handle,
          'uploadReferenceImage',
          {
            dataUrl: dataUrl ?? undefined,
            fileName: getReferenceFileName(product),
            imageUrl: dataUrl ? undefined : product.preview,
          },
          120_000
        );
      }

      let baselineVideoUrls: string[] = [];
      if (step === 'video') {
        const snapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
        baselineVideoUrls = snapshot.videoUrls ?? [];
      }

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'fill_prompt',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `กรอก prompt ${label}: ${(product.name || 'สินค้า').slice(0, 34)}`,
      });
      await runActionOrThrow(handle, 'fillPrompt', { prompt }, 45_000);
      await runActionOrThrow(handle, 'submit', {}, 45_000);
      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'submitted',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `ส่ง prompt ${label} แล้ว`,
      });

      const result = await waitForStepResult({
        baselineVideoUrls,
        count,
        handle,
        payload,
        product,
        productIndex,
        round,
        step,
      });

      if (step === 'video') {
        const videos = result.videos ?? [];
        for (const [index, url] of videos.entries()) {
          const downloadStartedAt = Date.now();
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'downloading_result',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `ดาวน์โหลดวิดีโอ Google Flow ลงมือถือ (${index + 1}/${videos.length})`,
          });
          const downloadPayload = (await runActionOrThrow(
            handle,
            'downloadVideo',
            { url, index },
            120_000
          )) as FlowDownloadPayload;
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'download_triggered',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `รับวิดีโอจาก Flow: ${downloadPayload.method ?? 'unknown'}${
              downloadPayload.sizeBytes ? ` ${(downloadPayload.sizeBytes / 1024 / 1024).toFixed(1)}MB` : ''
            }`,
          });

          let downloaded = downloadPayload.dataUrl
            ? await saveGoogleFlowDataUrlAsset('video', downloadPayload.dataUrl, downloadPayload.fileName)
            : null;

          if (!downloaded?.uri) {
            downloaded = await waitForGoogleFlowDownload('video', downloadStartedAt, 15_000);
          }
          if (!downloaded?.uri) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'download_missing',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: 'สร้างวิดีโอแล้ว แต่ดาวน์โหลดไฟล์ลงมือถือไม่สำเร็จ',
            });
            throw new Error('สร้างวิดีโอแล้ว แต่ดาวน์โหลดไฟล์ลงมือถือไม่สำเร็จ');
          }

          emit({
            event: 'asset',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'generated',
            productId: product.id,
            productName: product.name,
            fileUri: downloaded.uri,
            fileName: downloaded.fileName,
            mimeType: downloaded.mimeType || 'video/mp4',
            sizeBytes: downloaded.sizeBytes,
            createdAt: downloaded.createdAt || Date.now(),
            message: `ได้วิดีโอจาก Google Flow แล้ว (${index + 1}/${videos.length})`,
          });
        }
      } else {
        const imageCount = Math.max(1, Number(result.images ?? count) || count);
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'downloading_result',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `Flow สร้างรูปภาพแล้ว กำลังบันทึกลงคลัง (${imageCount})`,
        });

        const imagePayload = (await runActionOrThrow(
          handle,
          'downloadImages',
          { count: imageCount },
          90_000
        )) as FlowImageDownloadPayload;
        const images = imagePayload.images ?? [];
        if (images.length === 0) {
          throw new Error(
            imagePayload.errors?.[0] || 'สร้างรูปภาพแล้ว แต่ดึงไฟล์รูปจาก Google Flow ไม่สำเร็จ'
          );
        }

        for (const [index, image] of images.entries()) {
          if (!image.dataUrl) {
            continue;
          }
          const downloaded = await saveGoogleFlowDataUrlAsset('image', image.dataUrl, image.fileName);
          if (!downloaded?.uri) {
            throw new Error('บันทึกรูปภาพลงมือถือไม่สำเร็จ');
          }
          emit({
            event: 'asset',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'generated',
            productId: product.id,
            productName: product.name,
            fileUri: downloaded.uri,
            fileName: downloaded.fileName,
            mimeType: downloaded.mimeType || image.mimeType || 'image/png',
            sizeBytes: downloaded.sizeBytes || image.sizeBytes || undefined,
            createdAt: downloaded.createdAt || Date.now(),
            message: `ได้รูปภาพจาก Google Flow แล้ว (${index + 1}/${images.length})`,
          });
        }
      }
    },
    [emit, openGoogleFlowProject, runActionOrThrow, waitForStepResult]
  );

  const runPayload = useCallback(
    async (payload: GoogleFlowRunnerPayload): Promise<void> => {
      try {
        const handle = await waitForHandle();
        emit({
          runId: payload.runId,
          status: 'running',
          message: 'Google Flow WebView runner เริ่มทำงาน',
        });

        for (let round = 1; round <= payload.settings.totalRounds; round += 1) {
          for (let productIndex = 0; productIndex < payload.products.length; productIndex += 1) {
            const product = payload.products[productIndex];
            for (const step of payload.enabledSteps) {
              checkStop();
              await runProductStep({
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
              });
            }
          }
        }

        emit({
          runId: payload.runId,
          status: 'completed',
          message: 'Auto Pilot Google Flow WebView จบแล้ว',
        });
        setVisible(false);
      } catch (error) {
        if (error instanceof GoogleFlowWebViewRunnerStopped) {
          emit({
            runId: payload.runId,
            status: 'stopped',
            message: 'หยุด Auto Pilot Google Flow WebView แล้ว',
          });
          setVisible(false);
        } else {
          emit({
            runId: payload.runId,
            status: 'error',
            message: `Google Flow WebView error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      } finally {
        runningRef.current = false;
        stopRequestedRef.current = false;
        payloadRef.current = null;
        setActiveRunId(null);
      }
    },
    [checkStop, emit, runProductStep, waitForHandle]
  );

  useEffect(() => {
    return registerGoogleFlowWebViewRunnerHost({
      start(payload) {
        if (runningRef.current) {
          return false;
        }
        runningRef.current = true;
        stopRequestedRef.current = false;
        payloadRef.current = payload;
        setActiveRunId(payload.runId);
        setFlowStatus('unknown');
        flowStatusRef.current = 'unknown';
        setOverlayLogs([]);
        setVisible(true);
        void runPayload(payload);
        return true;
      },
      stop(runId) {
        const activePayload = payloadRef.current;
        if (!runningRef.current || (activePayload?.runId && activePayload.runId !== runId)) {
          return false;
        }
        stopRequestedRef.current = true;
        emit({
          runId,
          status: 'running',
          message: 'กำลังหยุด Google Flow WebView runner...',
        });
        return true;
      },
    });
  }, [emit, runPayload]);

  const requestStop = (): void => {
    const activePayload = payloadRef.current;
    if (!activePayload) {
      setVisible(false);
      return;
    }
    stopRequestedRef.current = true;
    emit({
      runId: activePayload.runId,
      status: 'running',
      message: 'กำลังหยุด Google Flow WebView runner...',
    });
  };

  const flowStatusLabel =
    flowStatus === 'connected'
      ? 'เชื่อมต่อแล้ว'
      : flowStatus === 'signin'
        ? 'รอเข้าสู่ระบบ'
        : flowStatus === 'loggedout'
          ? 'ยังไม่เชื่อมต่อ'
          : 'กำลังโหลด';

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={requestStop}>
      <SafeAreaView className="flex-1 bg-kd-panel">
        <View className="h-14 flex-row items-center justify-between border-b border-kd-border bg-kd-panel px-4">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-title font-semibold text-kd-text">
              Google Flow WebView
            </Text>
            <Text numberOfLines={1} className="text-kd-caption text-kd-text-muted">
              {activeRunId ? `run ${activeRunId.slice(-8)} · ${flowStatusLabel}` : flowStatusLabel}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="หยุด Google Flow WebView"
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={requestStop}
            className="h-10 w-10 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card"
          >
            {runningRef.current ? (
              <Square size={14} color={theme.red} fill={theme.red} strokeWidth={2.2} />
            ) : (
              <X size={18} color={theme.textSubtle} strokeWidth={2.4} />
            )}
          </TouchableOpacity>
        </View>
        <View className="relative flex-1">
          <FlowWebView
            ref={flowRef}
            backgroundColor={theme.screen}
            onStatusChange={(state) => {
              flowStatusRef.current = state;
              setFlowStatus(state);
            }}
          />
          {overlayLogs.length > 0 ? (
            <View
              pointerEvents="none"
              style={{ backgroundColor: 'rgba(0,0,0,0.66)' }}
              className="absolute inset-x-2 top-2 rounded-kd-lg px-3 py-2"
            >
              {overlayLogs.map((line, index) => (
                <Text key={`${index}-${line}`} numberOfLines={1} className="text-kd-micro leading-4 text-white">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          {!flowRef.current ? (
            <View className="absolute inset-0 items-center justify-center bg-kd-panel/70">
              <ActivityIndicator size="small" color={theme.orange} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
