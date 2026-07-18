import { extractJsonObject, postAiGenerate } from '@/autopilot/aiCaption';
import { getAiBrainSettings, pickAiBrainModel } from '@/autopilot/aiBrainSettingsStore';

// Port ของ desktop captionService.buildCaptionPrompt (TikTok-specific — ไม่มี char cap แบบ Shopee)
// transport/auth ใช้ postAiGenerate ตัวเดียวกับ auto pilot: POST kubdee.ai/api/v1/ai/generate

export interface TikTokAiContentRequest {
  productName: string;
  productDescription?: string;
  hashtagCount: number;
  generateCaption: boolean;
  generateHashtags: boolean;
  generateCta: boolean;
}

export interface TikTokAiContentResult {
  success: boolean;
  caption?: string;
  hashtags?: string;
  cta?: string;
  error?: string;
}

export function buildTikTokCaptionPrompt({
  productName,
  productDescription,
  hashtagCount,
  generateCaption,
  generateHashtags,
  generateCta,
}: TikTokAiContentRequest): string {
  const parts: string[] = [];
  const requestedFields = [
    generateCaption && 'Caption',
    generateHashtags && 'Hashtags',
    generateCta && 'CTA (Call to Action)',
  ]
    .filter(Boolean)
    .join(', ');

  parts.push('คุณคือผู้เชี่ยวชาญด้านการเขียน Caption โฆษณาสินค้าบน TikTok');
  parts.push('');
  parts.push(`คิด ${requestedFields || 'Caption, Hashtags และ CTA (Call to Action)'} สำหรับโพสต์ TikTok`);
  parts.push('');
  parts.push('ข้อมูลสินค้า:');
  parts.push(`- ชื่อ: ${productName || 'สินค้า'}`);
  if (productDescription) {
    parts.push(`- รายละเอียด: ${productDescription}`);
  }

  parts.push('');
  parts.push('กฎสำคัญ:');
  parts.push('- ตอบเป็น JSON เท่านั้น');
  parts.push('');

  if (generateCaption) {
    parts.push('Caption:');
    parts.push('- เป็นภาษาไทย สั้นกระชับ ดึงดูดใจ เหมาะกับ TikTok (ไม่เกิน 2 บรรทัด)');
    parts.push('- ใส่ emoji 1-3 ตัวที่เหมาะกับสินค้า ช่วยดึงดูดสายตา (ใส่ต้น caption จะดีที่สุด)');
    parts.push('- ห้ามใช้อักขระพิเศษ เช่น ๆ ถ้าต้องการพูดซ้ำให้พิมพ์ข้อความนั้นซ้ำแทนการใช้ ๆ');
    parts.push('- ห้ามใส่ #hashtag ใน Caption เด็ดขาด (hashtag จะแยกใส่ทีหลัง)');
    parts.push('- ห้ามใช้คำต้องห้าม/คำเสี่ยงของ TikTok (ระบบ AI ของ TikTok ตรวจจับบริบทเนื้อหา ทำให้คลิปไม่ขึ้น FYP, โดน Shadowban, หรือโดนลบ):');
    parts.push('  [โฆษณาเกินจริง] "ฟรี", "แจก", "ลดราคา", "ถูกที่สุด", "อันดับ 1", "ดีที่สุดในโลก", "การันตี", "100% ได้ผล", "รักษาได้ทุกโรค", "ขาวใน 3 วัน", "ลด 10 กิโลใน 7 วัน", "ส่วนลด", "โปรโมชั่น", "flash sale"');
    parts.push('  [สุขภาพ/ความงามเกินจริง] "รักษาโรค", "ยาลดน้ำหนัก", "ลดน้ำหนักเร็ว", "ผอม", "ขาว", "หน้าใส"');
    parts.push('  [การเงิน/ชวนลงทุน] "เงินกู้", "รายได้เสริม", "สร้างรายได้", "ทำเงิน", "รวย", "ลงทุน", "กำไร"');
    parts.push('  [ชักชวนออกนอกแพลตฟอร์ม] "คลิกลิงก์", "กดลิงก์", "DM", "inbox"');
    parts.push('  [ความรุนแรง/อาชญากรรม] "ฆ่า", "ฆาตกรรม", "ยิง", "ระเบิด", "ทำร้าย", "ทุบตี", "ก่อการร้าย", "ข่มขืน", "ค้ามนุษย์", "อาวุธ", "ตาย", "เลือด"');
    parts.push('  [ยาเสพติด] "ยาบ้า", "ยาไอซ์", "โคเคน", "กัญชา" (ในบริบทชวนใช้), "เสพยา", "ซื้อยา"');
    parts.push('  [การพนัน] "เว็บพนัน", "สล็อต", "คาสิโน", "แทงบอลออนไลน์", "หวยใต้ดิน", "ปั่นสล็อต", "เว็บตรง"');
    parts.push('  [Hate speech/เหยียด] คำเหยียดเชื้อชาติ เหยียดเพศ เหยียดศาสนา ด่ากลุ่มคน');
    parts.push('  [คำหยาบ/ลามก] คำด่าหยาบคาย คำเกี่ยวกับอวัยวะเพศ คำส่อเรื่องเพศ "18+"');
    parts.push('  [ประเด็นอ่อนไหว] ปลุกปั่นการเมือง ด่าศาสนา ข่าวปลอม conspiracy');
    parts.push('- สรุป: TikTok แบนบริบทเนื้อหา ไม่ใช่แค่คำ — หลีกเลี่ยงเนื้อหาเกี่ยวกับ ความรุนแรง, เพศ, ยาเสพติด, การพนัน, hate speech, โฆษณาเกินจริง ทั้งหมด');
    parts.push('- ห้ามใช้คำเลี่ยงแทนคำต้องห้ามด้วย (เช่น "จัดการ" แทน "ฆ่า", "ซิกซ์" แทน "เซ็กส์") เพราะ TikTok ตรวจจับบริบทได้');
    parts.push('');
  }

  if (generateHashtags) {
    parts.push('Hashtags:');
    parts.push(`- เป็นภาษาไทยและอังกฤษรวมกัน ต้องมีจำนวน ${hashtagCount} แท็กเท่านั้น (ขึ้นต้นด้วย #)`);
    parts.push('- ห้ามใช้ hashtag ที่มีคำต้องห้าม/คำเสี่ยงของ TikTok');
    parts.push('');
  }

  if (generateCta) {
    parts.push('CTA:');
    parts.push('- เป็นข้อความสั้นสำหรับแสดงบนปุ่ม (button) ไม่เกิน 3-4 คำ');
    parts.push('- ห้ามใส่ emoji');
    parts.push('- แนะนำให้ใช้ CTA มาตรฐานของ TikTok โดยเลือกให้เหมาะกับสินค้า:');
    parts.push('  "ซื้อเลย" / "สั่งซื้อเลย" / "สั่งซื้อตอนนี้" - สินค้าทั่วไป กระตุ้นให้ซื้อทันที');
    parts.push('  "ดูเพิ่มเติม" / "ดูรายละเอียด" - สินค้าที่ต้องศึกษาข้อมูลก่อนตัดสินใจ');
    parts.push('  "รับข้อเสนอ" - สินค้าที่มีโปรโมชั่นหรือดีลพิเศษ');
    parts.push('  "สมัครเลย" - บริการสมัครสมาชิก คอร์สเรียน');
    parts.push('  "จองเลย" - บริการจอง ร้านอาหาร โรงแรม');
    parts.push('  "ติดต่อเรา" - สินค้า/บริการที่ต้องสอบถามก่อน');
    parts.push('  "ดาวน์โหลด" - แอปหรือซอฟต์แวร์');
    parts.push('');
  }

  const hashtagExample = Array.from({ length: hashtagCount }, (_, i) => `#แท็ก${i + 1}`).join(' ');
  const jsonLines: string[] = [];
  if (generateCaption) jsonLines.push('  "caption": "Caption ภาษาไทย ใส่ emoji 1-3 ตัว"');
  if (generateHashtags) jsonLines.push(`  "hashtags": "${hashtagExample}"`);
  if (generateCta) jsonLines.push('  "cta": "ข้อความปุ่ม CTA"');

  parts.push('ตอบกลับเป็น JSON format นี้เท่านั้น:');
  parts.push('{');
  parts.push(jsonLines.map((line, index) => `${line}${index < jsonLines.length - 1 ? ',' : ''}`).join('\n'));
  parts.push('}');

  return parts.join('\n');
}

function cleanField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function generateTikTokPostContent(
  request: TikTokAiContentRequest
): Promise<TikTokAiContentResult> {
  if (!request.generateCaption && !request.generateHashtags && !request.generateCta) {
    return { success: true };
  }
  try {
    const aiBrain = await getAiBrainSettings();
    const result = await postAiGenerate({
      provider: aiBrain.aiProvider,
      model: pickAiBrainModel(aiBrain),
      prompt: buildTikTokCaptionPrompt(request),
    });
    if (!result.ok) {
      const error =
        result.data.code === 'INSUFFICIENT_CREDITS'
          ? `เครดิตไม่เพียงพอ (เหลือ ${result.data.currentCredits ?? 0} เครดิต)`
          : result.data.message || result.data.error || `KUBDEE AI error (${result.status})`;
      return { success: false, error };
    }
    const parsed = extractJsonObject(String(result.data.text || ''));
    if (!parsed) {
      return { success: false, error: 'Parse AI response ไม่ได้' };
    }
    return {
      success: true,
      caption: cleanField(parsed.caption),
      hashtags: cleanField(parsed.hashtags),
      cta: cleanField(parsed.cta),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'เรียก KUBDEE AI ไม่สำเร็จ',
    };
  }
}
