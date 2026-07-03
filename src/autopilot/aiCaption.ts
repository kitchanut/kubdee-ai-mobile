import { refreshAuthToken } from '@/auth/api';
import { APP_TYPE, BACKEND_URL } from '@/auth/constants';
import { getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';
import {
  SHOPEE_AI_CAPTION_WORD_LIMIT,
  SHOPEE_AI_CTA_WORD_LIMIT,
  SHOPEE_AI_HASHTAG_WORD_LIMIT,
  SHOPEE_AI_TOTAL_WORD_LIMIT,
  SHOPEE_POST_WORD_LIMIT,
  getShopeeSafeHashtagCount,
  limitShopeePostTextParts,
} from '@/autopilot/shopeePostTextLimit';
import type { AutoPilotProduct, AutoPilotSettings } from '@/autopilot/types';

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
}

export function getAutoPilotAiContentLabels(settings: AutoPilotSettings): string {
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
  product: AutoPilotProduct;
  settings: AutoPilotSettings;
}): string {
  const jsonLines: string[] = [];
  const hashtagCount = getShopeeSafeHashtagCount(settings.aiHashtagCount);
  if (settings.aiGenerateCaption) {
    jsonLines.push(`  "caption": "Caption ภาษาไทยสั้น กระชับ เหมาะกับ Shopee Video ไม่เกิน ${SHOPEE_AI_CAPTION_WORD_LIMIT} คำ"`);
  }
  if (settings.aiGenerateHashtags) {
    const hashtagExample = Array.from(
      { length: hashtagCount },
      (_, index) => `#แท็ก${index + 1}`
    ).join(' ');
    jsonLines.push(`  "hashtags": "${hashtagExample}"`);
  }
  if (settings.aiGenerateCta) {
    jsonLines.push('  "cta": "ข้อความปุ่ม CTA"');
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
- Shopee จำกัดข้อความในช่องแคปชั่นรวม Caption + CTA + Hashtags ไม่เกิน ${SHOPEE_POST_WORD_LIMIT} คำ
- เพื่อความปลอดภัย ให้เขียนรวมทุก field ไม่เกิน ${SHOPEE_AI_TOTAL_WORD_LIMIT} คำเท่านั้น
- Caption ควรอยู่ประมาณ 70-${SHOPEE_AI_CAPTION_WORD_LIMIT} คำ ถ้าไม่แน่ใจให้สั้นลง
- Caption ต้องไม่ใส่ hashtag เพราะ hashtags แยกต่างหาก
- Hashtags ต้องมี ${hashtagCount} แท็กเท่านั้น ขึ้นต้นด้วย # และรวมไม่เกิน ${SHOPEE_AI_HASHTAG_WORD_LIMIT} คำ
- CTA ต้องสั้น ไม่เกิน ${SHOPEE_AI_CTA_WORD_LIMIT} คำ และเหมาะกับการกดซื้อในแพลตฟอร์ม

ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น:
{
${jsonLines.join(',\n')}
}`.trim();
}

function extractJsonObject(text: string): Record<string, unknown> | null {
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

async function postAiGenerate(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: AiGenerateResponse }> {
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

export async function generateAutoPilotProductContent({
  product,
  settings,
}: {
  product: AutoPilotProduct;
  settings: AutoPilotSettings;
}): Promise<AutoPilotAiContentResult> {
  if (!settings.aiGenerateCaption && !settings.aiGenerateHashtags && !settings.aiGenerateCta) {
    return { success: false, error: 'ไม่ได้เลือกให้ AI สร้างข้อมูลใด' };
  }

  try {
    const result = await postAiGenerate({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
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

    const limitedText = limitShopeePostTextParts(
      {
        caption: settings.aiGenerateCaption && typeof parsed.caption === 'string' ? parsed.caption : '',
        hashtags: settings.aiGenerateHashtags && typeof parsed.hashtags === 'string' ? parsed.hashtags : '',
        cta: settings.aiGenerateCta && typeof parsed.cta === 'string' ? parsed.cta : '',
      },
      {
        totalWordLimit: SHOPEE_AI_TOTAL_WORD_LIMIT,
        captionWordLimit: SHOPEE_AI_CAPTION_WORD_LIMIT,
        hashtagWordLimit: SHOPEE_AI_HASHTAG_WORD_LIMIT,
        hashtagCountLimit: getShopeeSafeHashtagCount(settings.aiHashtagCount),
        ctaWordLimit: SHOPEE_AI_CTA_WORD_LIMIT,
      }
    );

    return {
      success: true,
      caption: limitedText.caption,
      hashtags: limitedText.hashtags,
      cta: limitedText.cta,
      wasLimited: limitedText.wasLimited,
      wordCount: limitedText.wordCount,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
