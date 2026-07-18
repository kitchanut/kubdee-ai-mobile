import { refreshAuthToken } from '@/auth/api';
import { APP_TYPE, BACKEND_URL } from '@/auth/constants';
import { getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';
import { getAiBrainSettings, pickAiBrainModel } from '@/autopilot/aiBrainSettingsStore';
import {
  SHOPEE_POST_CHARACTER_LIMIT,
  SHOPEE_POST_SAFE_CHARACTER_LIMIT,
  countShopeePostCharacters,
  getShopeeSafeHashtagCount,
  normalizeShopeeHashtags,
} from '@/autopilot/shopeePostTextLimit';

// รับแค่ field ที่ AI content generation ใช้จริง — AutoPilotProduct/AutoPilotSettings (types.ts)
// มี field ครบเกินความจำเป็น (structurally satisfy interface นี้อยู่แล้ว จึงใช้ต่อได้โดยไม่ต้องแก้ caller เดิม)
export interface AutoPilotAiContentProductInput {
  name: string;
  description: string;
  productId: string;
  productUrl: string;
  caption: string;
  hashtags: string;
  cta: string;
}

export interface AutoPilotAiContentSettingsInput {
  aiGenerateCaption: boolean;
  aiGenerateHashtags: boolean;
  aiGenerateCta: boolean;
  aiHashtagCount: number;
}

interface AiGenerateResponse {
  text?: string;
  message?: string;
  error?: string;
  code?: string;
  currentCredits?: number;
}

export interface AutoPilotAiContentResult {
  success: boolean;
  caption?: string;
  hashtags?: string;
  cta?: string;
  error?: string;
  wasLimited?: boolean;
  wordCount?: number;
  characterCount?: number;
  wasRewritten?: boolean;
}

interface NormalizedAiContent {
  caption: string;
  cta: string;
  hashtags: string;
}

interface AiContentLengthCheck {
  captionHashtagCharacterCount: number;
  fullCharacterCount: number;
  isValid: boolean;
  message: string;
}

export function getAutoPilotAiContentLabels(settings: AutoPilotAiContentSettingsInput): string {
  return [
    settings.aiGenerateCaption && 'Caption',
    settings.aiGenerateHashtags && 'Hashtags',
    settings.aiGenerateCta && 'CTA',
  ].filter(Boolean).join('/');
}

function buildAutoPilotCaptionPrompt({
  product,
  settings,
}: {
  product: AutoPilotAiContentProductInput;
  settings: AutoPilotAiContentSettingsInput;
}): string {
  const jsonLines: string[] = [];
  const hashtagCount = getShopeeSafeHashtagCount(settings.aiHashtagCount);
  if (settings.aiGenerateCaption) {
    jsonLines.push('  "caption": "แคปชั่นไทยสั้น กระชับ ไม่เกิน 70 ตัวอักษร"');
  }
  if (settings.aiGenerateHashtags) {
    const hashtagExample = Array.from({ length: Math.min(3, hashtagCount) }, (_, index) => `#แท็ก${index + 1}`).join(' ');
    jsonLines.push(`  "hashtags": "${hashtagExample}"`);
  }
  if (settings.aiGenerateCta) {
    jsonLines.push('  "cta": "CTA สั้นมาก"');
  }

  return `คุณคือผู้เชี่ยวชาญด้านการเขียนข้อความขายสินค้าสำหรับ Shopee Video และ affiliate video.

คิด ${getAutoPilotAiContentLabels(settings) || 'Caption/Hashtags/CTA'} สำหรับสินค้านี้ โดยตอบเป็น JSON เท่านั้น ห้ามมี markdown หรือคำอธิบายอื่น

ข้อมูลสินค้า:
- ชื่อ: ${product.name || 'สินค้า'}
- รายละเอียด: ${product.description || ''}
- รหัสสินค้า: ${product.productId || ''}
- URL: ${product.productUrl || ''}
- Caption เดิม: ${product.caption || ''}
- Hashtags เดิม: ${product.hashtags || ''}
- CTA เดิม: ${product.cta || ''}

กฎ:
- ใช้ภาษาไทยเป็นหลัก อ่านง่าย เหมาะกับคลิปสั้น
- หลีกเลี่ยงคำโฆษณาเกินจริง คำต้องห้าม คำเกี่ยวกับความรุนแรง การพนัน ยาเสพติด เพศ และการเงินเสี่ยง
- Shopee จำกัดช่องแคปชั่นรวมไม่เกิน ${SHOPEE_POST_CHARACTER_LIMIT} ตัวอักษร
- สำคัญที่สุด: Caption + Hashtags ต้องรวมกันไม่เกิน ${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษร นับรวมช่องว่าง เครื่องหมาย # อีโมจิ และวรรคตอน
- ถ้าสร้าง CTA ด้วย ให้ Caption + CTA + Hashtags รวมกันไม่เกิน ${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษรเช่นกัน
- Caption ควรอยู่ประมาณ 45-70 ตัวอักษร ถ้าไม่แน่ใจให้สั้นลง
- Caption ต้องไม่ใส่ hashtag เพราะ hashtags แยกต่างหาก
- Hashtags ใช้ไม่เกิน ${hashtagCount} แท็ก เลือกแท็กสั้นและสำคัญที่สุดเท่านั้น ถ้าแท็กเยอะแล้วเกิน ${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษรให้ลดจำนวนแท็กเอง
- CTA ต้องสั้นมาก และเหมาะกับการกดซื้อในแพลตฟอร์ม
- ก่อนตอบให้ตรวจนับตัวอักษรเอง ถ้าเกิน ${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ต้องเขียนใหม่ให้สั้นลง

ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น:
{
${jsonLines.join(',\n')}
}`.trim();
}

function buildAutoPilotCaptionRewritePrompt({
  content,
  product,
  settings,
  validation,
}: {
  content: NormalizedAiContent;
  product: AutoPilotAiContentProductInput;
  settings: AutoPilotAiContentSettingsInput;
  validation: AiContentLengthCheck;
}): string {
  return `ข้อความ Shopee ที่คุณสร้างยังยาวเกินกำหนด กรุณาคิดใหม่ให้สั้นลงและตอบเป็น JSON เท่านั้น

สินค้า: ${product.name || 'สินค้า'}
เหตุผลที่ต้องแก้: ${validation.message}

ข้อความเดิม:
${JSON.stringify({
  caption: settings.aiGenerateCaption ? content.caption : undefined,
  hashtags: settings.aiGenerateHashtags ? content.hashtags : undefined,
  cta: settings.aiGenerateCta ? content.cta : undefined,
}, null, 2)}

กฎสำคัญ:
- Caption + Hashtags รวมกันไม่เกิน ${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษร
- ถ้ามี CTA ให้ Caption + CTA + Hashtags รวมกันไม่เกิน ${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษร
- นับรวมช่องว่าง เครื่องหมาย # อีโมจิ และวรรคตอน
- ห้ามตอบคำอธิบาย ห้าม markdown ตอบ JSON เท่านั้น

ตอบกลับเป็น JSON เฉพาะ field ที่ขอ:
{
${[
  settings.aiGenerateCaption ? '  "caption": "..."' : '',
  settings.aiGenerateHashtags ? '  "hashtags": "#..."' : '',
  settings.aiGenerateCta ? '  "cta": "..."' : '',
].filter(Boolean).join(',\n')}
}`.trim();
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonText = cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)?.[0] || '';
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function postAiGenerate(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: AiGenerateResponse }> {
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    return { ok: false, status: 401, data: { error: 'กรุณาเข้าสู่ระบบก่อนใช้ KUBDEE AI' } };
  }

  const makeRequest = async (accessToken: string): Promise<{ ok: boolean; status: number; data: AiGenerateResponse }> => {
    const response = await fetch(`${BACKEND_URL}/api/v1/ai/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-App-Type': APP_TYPE,
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as AiGenerateResponse;
    return { ok: response.ok, status: response.status, data };
  };

  let result = await makeRequest(tokens.accessToken);
  if (result.status !== 401 || !tokens.refreshToken) {
    return result;
  }

  const refresh = await refreshAuthToken(tokens.refreshToken);
  const refreshedAccessToken = refresh.ok ? refresh.data?.accessToken : null;
  if (!refreshedAccessToken) {
    return result;
  }

  await saveStoredAuthTokens({ accessToken: refreshedAccessToken, refreshToken: tokens.refreshToken });
  result = await makeRequest(refreshedAccessToken);
  return result;
}

function cleanAiField(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeGeneratedContent(parsed: Record<string, unknown>, settings: AutoPilotAiContentSettingsInput): NormalizedAiContent {
  return {
    caption: settings.aiGenerateCaption ? cleanAiField(parsed.caption) : '',
    hashtags: settings.aiGenerateHashtags ? normalizeShopeeHashtags(cleanAiField(parsed.hashtags), Number.MAX_SAFE_INTEGER) : '',
    cta: settings.aiGenerateCta ? cleanAiField(parsed.cta) : '',
  };
}

function joinPostText(parts: (string | null | undefined)[]): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' ').trim();
}

function checkAiContentLength({
  content,
  product,
  settings,
}: {
  content: NormalizedAiContent;
  product: AutoPilotAiContentProductInput;
  settings: AutoPilotAiContentSettingsInput;
}): AiContentLengthCheck {
  const caption = settings.aiGenerateCaption ? content.caption : product.caption;
  const hashtags = settings.aiGenerateHashtags ? content.hashtags : product.hashtags;
  const cta = settings.aiGenerateCta ? content.cta : product.cta;
  const captionHashtagText = joinPostText([caption, hashtags]);
  const fullText = joinPostText([caption, cta, hashtags]);
  const captionHashtagCharacterCount = countShopeePostCharacters(captionHashtagText);
  const fullCharacterCount = countShopeePostCharacters(fullText);
  const overCaptionHashtags = captionHashtagCharacterCount > SHOPEE_POST_SAFE_CHARACTER_LIMIT;
  const overFull = fullCharacterCount > SHOPEE_POST_SAFE_CHARACTER_LIMIT;
  const message = overFull
    ? `Caption + CTA + Hashtags ${fullCharacterCount}/${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษร`
    : `Caption + Hashtags ${captionHashtagCharacterCount}/${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษร`;

  return {
    captionHashtagCharacterCount,
    fullCharacterCount,
    isValid: !overCaptionHashtags && !overFull,
    message,
  };
}

export async function generateAutoPilotProductContent({
  product,
  settings,
}: {
  product: AutoPilotAiContentProductInput;
  settings: AutoPilotAiContentSettingsInput;
}): Promise<AutoPilotAiContentResult> {
  if (!settings.aiGenerateCaption && !settings.aiGenerateHashtags && !settings.aiGenerateCta) {
    return { success: false, error: 'ไม่ได้เลือกให้ AI สร้างข้อมูลใด' };
  }

  try {
    const aiBrain = await getAiBrainSettings();
    const result = await postAiGenerate({
      provider: aiBrain.aiProvider,
      model: pickAiBrainModel(aiBrain),
      prompt: buildAutoPilotCaptionPrompt({ product, settings }),
    });

    if (!result.ok) {
      if (result.data.code === 'INSUFFICIENT_CREDITS') {
        return {
          success: false,
          error: `เครดิตไม่เพียงพอ (เหลือ ${Number(result.data.currentCredits || 0).toFixed(2)} เครดิต)`,
        };
      }
      return { success: false, error: result.data.message || result.data.error || 'KUBDEE AI error' };
    }

    const parsed = extractJsonObject(result.data.text || '');
    if (!parsed) {
      return { success: false, error: 'Parse AI response ไม่ได้' };
    }

    let content = normalizeGeneratedContent(parsed, settings);
    let validation = checkAiContentLength({ content, product, settings });
    let wasRewritten = false;

    for (let attempt = 1; !validation.isValid && attempt <= 2; attempt += 1) {
      const rewrite = await postAiGenerate({
        provider: aiBrain.aiProvider,
        model: pickAiBrainModel(aiBrain),
        prompt: buildAutoPilotCaptionRewritePrompt({ content, product, settings, validation }),
      });

      if (!rewrite.ok) {
        return { success: false, error: rewrite.data.message || rewrite.data.error || 'KUBDEE AI rewrite error' };
      }

      const rewritten = extractJsonObject(rewrite.data.text || '');
      if (!rewritten) {
        return { success: false, error: 'Parse AI rewrite response ไม่ได้' };
      }

      content = normalizeGeneratedContent(rewritten, settings);
      validation = checkAiContentLength({ content, product, settings });
      wasRewritten = true;
    }

    if (!validation.isValid) {
      return {
        success: false,
        error: `AI สร้างข้อความยาวเกิน ${SHOPEE_POST_SAFE_CHARACTER_LIMIT} ตัวอักษร (${validation.message})`,
      };
    }

    return {
      success: true,
      caption: content.caption,
      hashtags: content.hashtags,
      cta: content.cta,
      wasLimited: wasRewritten,
      wasRewritten,
      characterCount: validation.fullCharacterCount,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
