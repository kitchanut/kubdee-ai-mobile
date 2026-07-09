import { buildPrompt, type BuildSettings } from '@/autopilot/promptCatalog/build';
import type { Category, PromptCatalog } from '@/autopilot/promptCatalog/types';
import { categoryOptions } from '@/autopilot/promptCatalog/types';
import type {
  AutoPilotProduct,
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerPromptBundle,
} from '@/autopilot/types';

function compactText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

const VIDEO_STYLE_FALLBACKS: Record<string, string> = {
  '': 'รีวิวสินค้าแบบปกติ พูดแนะนำสินค้าอย่างเป็นธรรมชาติ',
  ugc: 'ถ่ายแบบ UGC คนธรรมดารีวิวเอง มุมมองบุคคลที่หนึ่ง (POV) แสงธรรมชาติ ไม่จัดแสง ดูเรียลๆ จริงใจ เหมือน TikTok ทั่วไป',
  hands_only: 'มุมมองบุคคลที่หนึ่ง (POV) เห็นเพียงแค่มือถือสินค้า โฟกัสที่สินค้าชัดเจน ไม่เห็นหน้า สไตล์ unboxing',
  hardsell_ugc: 'คลิป UGC สไตล์ TikTok Shop ถ่ายด้วยมือถือ ใช้ฉากเดิมจากภาพ มือถือสินค้านิ่งสนิท ห้ามหมุน ห้ามพลิกสินค้า ห้ามเปลี่ยนรูปทรง สี หรือ composition ของสินค้า ต้องเหมือน reference 100% บรรยากาศเคลียร์สต็อก โปรแรง ของมีจำกัด แสงเรียลลิสติก โฟกัสสินค้าในมือชัด ห้ามมี barcode ห้ามมี text overlay บนคลิป ห้ามมีโลโก้ ห้ามมี background music คลิปเดียว ห้าม collage ห้ามแบ่งหลาย panel ห้าม split screen',
  lifestyle: 'ใช้ชีวิตประจำวันกับสินค้าอย่างเป็นธรรมชาติ ดูดี มีสไตล์ เหมือนชีวิตจริง บรรยากาศผ่อนคลาย',
  studio: 'ถ่ายในสตูดิโอ จัดแสงสวย พื้นหลังสะอาด โฟกัสที่สินค้าและตัวละคร ดูเป็นมืออาชีพ คมชัด',
  outdoor: 'ถ่ายกลางแจ้ง แสงธรรมชาติสวย บรรยากาศเปิดโล่ง สดชื่น มีชีวิตชีวา สถานที่สวยงาม',
  professional: 'ถ่ายแบบโฆษณามืออาชีพ จัดแสงสวย องค์ประกอบภาพลงตัว ดูมีราคา น่าเชื่อถือ คมชัดทุกเฟรม',
  runway_pose: 'เดินแบบแฟชั่น โพสท่าเหมือนนางแบบมืออาชีพ มั่นใจ สง่างาม เดินโชว์สินค้า',
  cute_dance: 'เต้นท่าเต้นน่ารักๆ ขยับตัวตามจังหวะเพลง ยิ้มแย้ม สดใส ร่าเริง ดูแล้วมีความสุข ถือสินค้าขณะเต้น',
  cinematic: 'ถ่ายแบบภาพยนตร์ มีความดราม่า แสงสวย เน้นอารมณ์ ดูพรีเมียม มุมกล้องหลากหลาย',
  minimal: 'เรียบง่าย ไม่รกตา พื้นหลังสะอาด โทนสีนุ่มนวล โฟกัสที่สินค้าเป็นหลัก',
  luxury: 'หรูหรา พรีเมียม แสงระยิบระยับ โทนสีทอง/ดำ/เข้ม บรรยากาศดูแพง ดูมีระดับ',
  modern: 'ทันสมัย สไตล์คนรุ่นใหม่ ดีไซน์ล้ำ โทนสีสด มีพลัง เทรนดี้ ดึงดูดวัยรุ่น',
  playful: 'ขี้เล่น สนุกสนาน ทำหน้าตลก เล่นมุก ยิ้มแย้มร่าเริง พลังงานสูง ให้คนดูมีความสุข',
  storytelling: 'เล่าเรื่องขายของ เริ่มจากปัญหา แล้วสินค้าช่วยแก้ได้ ดึงอารมณ์คนดูให้อยากซื้อ มี narrative ชัดเจน',
  cgi_realistic: 'ภาพ CGI สมจริง 3D render คุณภาพสูง สินค้าลอยหมุนโชว์ เอฟเฟกต์พิเศษ ดูล้ำสมัย',
  asmr: 'เน้นเสียง เบาๆ กระซิบ เสียงแกะกล่อง เสียงสัมผัสสินค้า ผ่อนคลาย ดึงดูดด้วยเสียง',
  slow_motion: 'ภาพช้าๆ ชัดๆ เห็นรายละเอียดสินค้าทุกมุม การเคลื่อนไหวสโลว์โมชั่น ดูพรีเมียม สวยงาม',
  unboxing: 'แกะกล่องสินค้า เปิดดูทีละชิ้น แสดงความตื่นเต้นขณะเปิด โชว์สินค้าที่ได้รับ',

  // --- สตอรี่ (ใช้กับ Omni Flash + Ingredients, ต่อยอดจากรูป Story 5 ช่อง) ---
  เรื่องราวมินิมอล:
    'โทนสีขาว-สว่างสไตล์มินิมอล บรรยากาศเรียบง่ายไม่รกตา สถานที่ให้ตรงกับภาพอ้างอิงที่แนบมาเป๊ะ สินค้าต้องเหมือนภาพอ้างอิงทุกจุด ไม่มีพรีเซนเตอร์หรือคนพูดหน้ากล้อง เคลื่อนกล้องนุ่มนวลต่อเนื่อง ไม่มีการตัดต่อกระชาก',
};

// ต้องตรงกับ storyStyle ฝั่ง optionSets.ts (STORY_VIDEO_STYLE_KEY) และ VIDEO_STYLE_FALLBACKS ด้านบน
const STORY_STYLE_KEY = 'เรื่องราวมินิมอล';

// สตอรี่: collage 5 ช่องภาพพร้อมคำบรรยายลายมือ ใช้กับ Omni Flash + Ingredients ฝั่งวิดีโอ
const STORY_STYLE_FALLBACKS: Record<string, string> = {
  เรื่องราวมินิมอล:
    'โทนสีขาว-สว่างสไตล์มินิมอล องค์ประกอบและพื้นผิวเรียบง่ายไม่รกตา สีสันนุ่มนวลอ่อนโยน แสงสว่างจ้าฟุ้งกระจายแบบ high-key ให้ความรู้สึกโล่ง สะอาด ทันสมัย ให้สินค้าเป็นจุดเด่นกลางภาพในทุกช่อง (สถานที่/ฉากให้เป็นไปตามที่กำหนดในหัวข้อฉากด้านล่าง ไม่ได้กำหนดตายตัว) บรรยากาศ โทนสี และทิศทางแสงต้องเหมือนกันทุกช่องเพื่อความต่อเนื่อง',
};

const SCRIPT_STYLE_FALLBACKS: Record<string, string> = {
  '': 'รีวิวเป็นกันเอง พูดอย่างเป็นธรรมชาติ',
  normal: 'ปกติ รีวิวเป็นกันเอง เหมือนเพื่อนบอกต่อ',
  playful: 'กวนตีน ตลก มุกเบาๆ เฮฮา สนุกสนาน',
  polite: 'ผู้ดี สุภาพ น่าเชื่อถือ พูดจาดี มีมารยาท',
  hardsell: 'ขายแรงๆ กระตุ้นซื้อ เร่งด่วน รีบเลย ของมีจำกัด',
  isan: 'อีสานบ้านๆ ใส่คำอีสาน สำเนียงอีสาน เช่น หล่าสิเด้อ บักหล่า แซบอีหลี',
  northern: 'คำเมืองเหนือ อ่อนหวานนุ่มนวล สำเนียงเหนือ เช่น กุ๊กๆ เจ้า ขอบคุณเน้อ',
  cute: 'น่ารักมุ้งมิ้ง สดใส ใช้คำน่ารักๆ เสียงแหลมนิดๆ อ้อนเก่ง',
  confident: 'มั่นใจจัด รู้จริง เชี่ยวชาญ พูดหนักแน่น น่าเชื่อถือ',
  excited: 'ตื่นเต้นสุดๆ พลังเยอะ ร้องว้าว กรี๊ด โอ้โห ดีมากๆ',
  peaceful: 'สงบสุข ผ่อนคลาย เสียงนุ่มนวล ช้าๆ ไม่เร่งรีบ',
  romantic: 'หวานโรแมนติก อ่อนโยน เสียงหวาน พูดจามีความรัก',
};

const VOICE_CHARACTER_FALLBACKS: Record<string, string | null> = {
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

const CAMERA_MOTION_FALLBACKS: Record<string, string> = {
  'แพนซ้าย-ขวา': 'กล้องแพนจากซ้ายไปขวาอย่างนุ่มนวล',
  'แพนขึ้น-ลง': 'กล้องแพนจากบนลงล่างหรือล่างขึ้นบน',
  'ซูมเข้า': 'ค่อยๆ ซูมเข้าหาสินค้าอย่างช้าๆ',
  'ซูมออก': 'ค่อยๆ ซูมออกเพื่อเผยให้เห็นภาพรวม',
  'โคจรรอบ': 'กล้องโคจรรอบสินค้า 360 องศา',
  ติดตาม: 'กล้องเคลื่อนที่ติดตามสินค้าหรือตัวละคร',
  คงที่: 'กล้องคงที่ไม่เคลื่อนไหว ถ่ายจากมุมเดียว',
};

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

function catalogCategory(catalog: PromptCatalog, id: string): Category | undefined {
  return catalog.categories.find((category) => category.id === id);
}

function catalogOptionPrompt(catalog: PromptCatalog, categoryId: string, value: string): string {
  const cleanValue = compactText(value);
  if (!cleanValue || cleanValue === 'auto') {
    return '';
  }

  const category = catalogCategory(catalog, categoryId);
  if (!category) {
    return '';
  }

  return categoryOptions(category).find((option) => option.value === cleanValue)?.prompt || '';
}

function resolveImageStylePrompt(
  imageSettings: AutoPilotProduct['settings']['image'],
  catalog: PromptCatalog
): { selectedStyle: string; prompt: string; customText: string } {
  const styleMode = imageSettings.styleMode || 'preset';
  const selectedStyle =
    styleMode === 'story'
      ? imageSettings.storyStyle || STORY_STYLE_KEY
      : styleMode === 'viral'
        ? imageSettings.viralStyle || ''
        : styleMode === 'custom'
          ? imageSettings.customStyle || imageSettings.presetStyle || ''
          : imageSettings.presetStyle || '';
  const customText =
    styleMode === 'story'
      ? compactText(imageSettings.storyStyleCustom)
      : styleMode === 'viral'
        ? compactText(imageSettings.viralStyleCustom)
        : compactText(imageSettings.presetStyleCustom);

  if (!selectedStyle || selectedStyle === 'auto') {
    return { selectedStyle, prompt: '', customText };
  }
  if (selectedStyle === '__custom__' || selectedStyle === 'custom') {
    return { selectedStyle, prompt: customText, customText };
  }

  const categoryId =
    styleMode === 'story'
      ? 'image_story_style'
      : styleMode === 'viral'
        ? 'image_viral_style'
        : styleMode === 'custom'
          ? 'image_custom_style'
          : 'image_preset_style';
  return {
    selectedStyle,
    prompt: catalogOptionPrompt(catalog, categoryId, selectedStyle) || STORY_STYLE_FALLBACKS[selectedStyle] || '',
    customText,
  };
}

function resolveVideoDialogueForDesktopLikePrompt(videoSettings: AutoPilotProduct['settings']['video']): string {
  const dialogueList = videoSettings.dialogueList.map(compactText).filter(Boolean);
  if (dialogueList.length > 0) {
    return dialogueList.join(' | ');
  }
  return compactText(videoSettings.dialogue);
}

function buildDesktopLikeImagePrompt(
  product: AutoPilotProduct,
  catalog: PromptCatalog
): string {
  const imageSettings = product.settings.image;
  const productName = product.name || 'สินค้า';
  const promptParts: string[] = [];
  const isStoryMode = (imageSettings.styleMode || 'preset') === 'story';

  let mainInstruction = isStoryMode
    ? `สร้างภาพเดียวในรูปแบบ Story Board Collage สำหรับวางแผนคลิปสั้น ภาพต้องเต็มสัดส่วนที่กำหนด ห้ามมีขอบดำ แบ่งภาพออกเป็น 5 ช่อง (panel) เท่านั้น ห้ามมี 6, 7 หรือน้อยกว่า 5 ช่องเด็ดขาด คั่นด้วยเส้นขอบสีขาวบางๆ จัดเป็น 2 แถว: แถวบน 3 ช่องขนาดเท่ากัน แถวล่าง 2 ช่องขนาดใหญ่กว่าเล็กน้อยวางกึ่งกลาง แต่ละช่องคือภาพนิ่งหนึ่งฉากของสินค้าเดียวกัน ต่อเนื่องกันเหมือนสตอรี่บอร์ด ฉากหลัง โทนสี และบรรยากาศต้องเหมือนกันทุกช่องเพื่อความต่อเนื่อง เปลี่ยนแค่มุมกล้องและการกระทำในแต่ละช่อง ห้ามมีช่องซ้อนทับกันเอง สินค้าคือ ${productName} ตามภาพแรกที่แนบให้ ต้องปรากฏชัดเจนเป็นจุดเด่นในทุกช่อง รูปทรง สัดส่วน สี และโลโก้ของสินค้าต้องตรงกับภาพต้นฉบับเป๊ะทุกช่อง ห้ามบิดเบือนหรือสร้างสินค้าใหม่ที่ไม่ตรงกับภาพที่แนบ`
    : `สร้างภาพโฆษณาสินค้ามืออาชีพ ภาพต้องเต็มสัดส่วนที่กำหนด ห้ามมีขอบดำหรือพื้นที่ว่างบนล่างหรือซ้ายขวา ต้องเป็นภาพเดียวเท่านั้น ห้ามเป็น collage ห้ามมีภาพซ้อนภาพ ห้ามมี inset หรือ overlay ของสินค้าในมุมภาพ ห้ามมี product shot แยกต่างหาก สินค้าต้องปรากฏในฉากหลักเท่านั้น สินค้าคือ ${productName} ตามรูปสินค้า reference ที่แนบให้`;

  const charMode = imageSettings.characterMode || 'auto';
  if (charMode === 'auto') {
    mainInstruction += isStoryMode
      ? ' เน้นสินค้าเป็นหลักในทุกช่อง ถ้าจำเป็นให้เห็นเพียงมือของคนกำลังใช้งานสินค้าในบางช่องเท่านั้น ไม่ต้องมีตัวละครเต็มตัว'
      : ' และให้สร้างตัวละครคนไทยตามความเหมาะสมกับสินค้า';
  } else if (charMode === 'description' && imageSettings.characterDescription) {
    mainInstruction += ` และใช้ตัวละคร ${imageSettings.characterDescription}`;
  } else if (['gallery', 'upload'].includes(charMode)) {
    mainInstruction += ' และใช้ตัวละครตามรูปตัวละคร reference ที่แนบให้';
  } else if (charMode === 'none') {
    mainInstruction += ' ไม่ต้องใส่ตัวละคร';
  } else {
    mainInstruction += ' และให้สร้างตัวละครคนไทยตามความเหมาะสมกับสินค้า';
  }

  promptParts.push(`${mainInstruction};`);
  promptParts.push('กฎใบหน้าคน: ถ้ามีใบหน้าคนในภาพ ต้องเห็นใบหน้าชัดเจน เปิดโล่ง ไม่ถูกสินค้า มือ ผม หมวก หน้ากาก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บดบัง และไม่เบลอหรือบิดเบี้ยว ถ้าภาพตั้งใจเป็น product-only, hands-only, close-up รายละเอียดสินค้า หรือมุมที่ไม่เห็นหน้า ให้ไม่เห็นหน้าไปเลย ห้ามถอยกล้องหรือเปลี่ยน framing เพื่อ reveal หน้า;');

  const referenceRules = ['รูปสินค้า reference: ใช้สินค้าให้ตรงกับภาพอ้างอิง ห้ามเปลี่ยนรูปทรง สี โลโก้ หรือแพ็กเกจ'];
  if (['gallery', 'upload'].includes(charMode)) {
    referenceRules.push('รูปตัวละคร reference: ใช้หน้าตา บุคลิก และความต่อเนื่องของตัวละคร แต่ปรับท่าทางให้เข้ากับฉากได้');
  }
  if (
    ['gallery', 'upload'].includes(imageSettings.sceneMode || '') &&
    Boolean(imageSettings.customSceneUri || imageSettings.customScenePreview || imageSettings.selectedSceneId)
  ) {
    referenceRules.push('รูปฉาก reference: ใช้เป็นฉากหลัง บรรยากาศ layout แสง material และ color tone ห้ามทำให้ฉากกลายเป็นสินค้า');
  }
  promptParts.push(`รูปอ้างอิงที่แนบ: ${referenceRules.join(' | ')};`);
  promptParts.push('แสดงสินค้าอย่างเหมาะสมกับประเภทสินค้า เช่น สวมใส่ถ้าเป็นเสื้อผ้า/รองเท้า ถือถ้าเป็นสินค้าทั่วไป;');

  if (product.description) {
    promptParts.push(`รายละเอียดสินค้า: ${product.description};`);
  }

  const style = resolveImageStylePrompt(imageSettings, catalog);
  if (!style.selectedStyle || style.selectedStyle === 'auto') {
    promptParts.push('สไตล์: เลือกสไตล์ภาพที่เหมาะสมกับสินค้าและบรรยากาศโดยอัตโนมัติ;');
  } else if (style.selectedStyle === '__custom__' || style.selectedStyle === 'custom') {
    promptParts.push(
      style.prompt
        ? `สไตล์: ${style.prompt};`
        : 'สไตล์: เลือกสไตล์ภาพที่เหมาะสมกับสินค้าและบรรยากาศโดยอัตโนมัติ;'
    );
  } else if (style.prompt) {
    promptParts.push(`สไตล์: ${style.prompt};`);
  } else {
    promptParts.push(`สไตล์: ${style.selectedStyle};`);
  }

  const locationMode = imageSettings.sceneMode || 'preset';
  const bg = imageSettings.background || 'auto';
  if (locationMode === 'none') {
    promptParts.push('ฉาก: ไม่ต้องใช้ฉากเด่น ให้ใช้พื้นหลังเรียบหรือพื้นผิวสะอาดที่ทำให้สินค้าเด่น;');
  } else if (
    ['gallery', 'upload'].includes(locationMode) &&
    Boolean(imageSettings.customSceneUri || imageSettings.customScenePreview || imageSettings.selectedSceneId)
  ) {
    const locationDetail = imageSettings.sceneDescription?.trim()
      ? ` รายละเอียดเพิ่มเติมของฉาก: ${imageSettings.sceneDescription.trim()}`
      : '';
    promptParts.push(`ฉาก: ใช้รูปฉาก reference ที่แนบเป็นฉากหลังหลัก คง mood, lighting, layout, material, color tone และบรรยากาศเดิมของฉาก แล้วจัดวางสินค้าให้เด่นชัดในฉากอย่างเป็นธรรมชาติ;${locationDetail}`);
  } else if (['gallery', 'upload'].includes(locationMode) && imageSettings.sceneDescription) {
    promptParts.push(`ฉาก: ${imageSettings.sceneDescription};`);
  } else if (locationMode === 'description' && imageSettings.sceneDescription) {
    promptParts.push(`ฉาก: ${imageSettings.sceneDescription};`);
  } else if (bg === 'auto') {
    promptParts.push('ฉาก: เลือกฉาก/พื้นหลังที่เหมาะสมกับสินค้าและสไตล์ภาพโดยอัตโนมัติ;');
  } else if (bg === '__custom__' && imageSettings.backgroundCustom) {
    promptParts.push(`ฉาก: ${imageSettings.backgroundCustom};`);
  } else {
    promptParts.push(`ฉาก: ${catalogOptionPrompt(catalog, 'image_background', bg) || bg};`);
  }

  const light = imageSettings.lighting || 'auto';
  if (light === 'auto') {
    promptParts.push('แสง: เลือกการจัดแสงที่เหมาะสมกับสินค้าและบรรยากาศโดยอัตโนมัติ;');
  } else if (light === '__custom__' && imageSettings.lightingCustom) {
    promptParts.push(`แสง: ${imageSettings.lightingCustom};`);
  } else {
    promptParts.push(`แสง: ${catalogOptionPrompt(catalog, 'image_lighting', light) || light};`);
  }

  const frame = imageSettings.frame || 'auto';
  if (frame === 'auto') {
    promptParts.push('มุมกล้อง: เลือกมุมกล้องที่เหมาะสมกับสินค้าและการนำเสนอโดยอัตโนมัติ;');
  } else if (frame === '__custom__' && imageSettings.frameCustom) {
    promptParts.push(`มุมกล้อง: ${imageSettings.frameCustom};`);
  } else {
    promptParts.push(`มุมกล้อง: ${catalogOptionPrompt(catalog, 'image_frame', frame) || frame};`);
  }

  const outfit = imageSettings.characterOutfit || 'auto';
  if (outfit === 'auto') {
    promptParts.push('ให้ตัวละครใส่ชุดที่เหมาะสมกับฉากและสินค้า;');
  } else if (outfit === 'original') {
    promptParts.push('ให้ตัวละครใส่ชุดเดิมตามภาพต้นฉบับ;');
  } else if (outfit === 'custom' && imageSettings.characterOutfitCustom) {
    promptParts.push(`ชุดของตัวละคร: ${imageSettings.characterOutfitCustom};`);
  }

  const textOverlay = imageSettings.textOverlay || 'auto';
  if (isStoryMode) {
    promptParts.push(`ข้อความในภาพ (บังคับ - สตอรี่ 5 ช่อง): ในแต่ละช่องทั้ง 5 ช่อง มุมบนซ้ายใส่ป้ายเวลารูปแคปซูลพื้นหลังทึบสีเข้มขอบมน ตัวอักษรไทยสีขาวตัวหนา ไล่ตามลำดับช่องคือ "ฉาก 1 (0-2s)", "ฉาก 2 (2-4s)", "ฉาก 3 (4-6s)", "ฉาก 4 (6-8s)", "ฉาก 5 (8-10s)"; นอกจากป้ายเวลา แต่ละช่องต้องมีคำบรรยายสั้นภาษาไทย 2-4 คำ ตัวอักษรใหญ่ชัดเจนอ่านง่าย (จะถูกตัดไปใช้เป็นคำบรรยายในคลิปวิดีโอด้วย) เขียนด้วยลายมือสไตล์ hand-drawn มินิมอล เส้นเรียบบางไม่หนาเทอะทะ สีขาวตัดกับพื้นหลัง วางในตำแหน่งเด่นไม่บังสินค้า น้ำเสียงคำบรรยายเหมือนเพื่อนแนะนำเพื่อน (โทนป้ายยา) เป็นกันเอง จริงใจ กระตือรือร้น ไม่เป็นทางการ ไล่เนื้อหาตามจังหวะการเล่าเรื่อง: ช่องที่ 1 ชื่อหรือจุดขายหลักของสินค้า ช่องที่ 2 ขั้นตอนการใช้งานแรก ช่องที่ 3 ความง่ายในการใช้งาน ช่องที่ 4 จุดเด่นด้านคุณภาพของสินค้า ช่องที่ 5 สรุปปิดการขายหรือความคุ้มค่า/เข้ากับทุกที่; ประกอบคำบรรยายด้วยลายเส้นเล็กๆ เรียบง่ายสีขาว 1-2 ชิ้นต่อช่อง เช่น ดาวเล็ก เส้นขีดใต้ ลูกศรโค้งบาง ให้ดูมินิมอลไม่รกตา ห้ามสะกดคำภาษาไทยผิด ห้ามใช้ภาษาอังกฤษยกเว้นชื่อยี่ห้อ;`);
  } else if (textOverlay === 'auto') {
    promptParts.push('ใส่ข้อความแนวโฆษณาสั้นๆ ที่สะดุดตาในภาพ เช่น ชื่อสินค้า slogan กระตุ้นให้อยากซื้อ ห้ามใส่ราคา จัดวางในตำแหน่งที่โดดเด่นไม่บังสินค้า ใช้ภาษาไทยเป็นหลัก ยกเว้นชื่อยี่ห้อหรือคำที่จำเป็นค่อยใช้ภาษาอังกฤษ;');
  } else if (textOverlay === 'none') {
    promptParts.push('ห้ามมีข้อความหรือตัวอักษรใดๆ ในภาพ;');
  } else if (textOverlay === 'custom' && imageSettings.textOverlayCustom) {
    promptParts.push(`TEXT OVERLAY REQUIREMENT: The image MUST contain this EXACT text verbatim: '${imageSettings.textOverlayCustom}' - This text uses Thai script/characters. CRITICAL: Render the Thai characters EXACTLY as shown above. DO NOT translate to English. Copy the Thai text character-by-character: ${imageSettings.textOverlayCustom};`);
  }

  if (imageSettings.systemPrompt?.trim()) {
    promptParts.push(`คำสั่งเพิ่มเติม: ${imageSettings.systemPrompt};`);
  }

  return promptParts.join('\n');
}

function buildDesktopLikeVideoPrompt(
  product: AutoPilotProduct,
  catalog: PromptCatalog,
  hasRefImage: boolean
): string {
  const videoSettings = product.settings.video;
  const styleKey = videoSettings.presetStyle || '';
  if (styleKey === STORY_STYLE_KEY) {
    return buildStoryVideoPrompt(product, catalog, hasRefImage);
  }
  let stylePrompt: string;
  if (styleKey === '__custom__') {
    stylePrompt = videoSettings.presetStyleCustom?.trim() || VIDEO_STYLE_FALLBACKS[''];
  } else {
    stylePrompt = catalogOptionPrompt(catalog, 'video_style', styleKey) || VIDEO_STYLE_FALLBACKS[styleKey] || styleKey || VIDEO_STYLE_FALLBACKS[''];
  }

  const scriptStyleKey = videoSettings.scriptStyle || '';
  const scriptTone =
    scriptStyleKey === '__custom__' && videoSettings.scriptStyleCustom
      ? videoSettings.scriptStyleCustom
      : catalogOptionPrompt(catalog, 'video_script_style', scriptStyleKey) || SCRIPT_STYLE_FALLBACKS[scriptStyleKey] || SCRIPT_STYLE_FALLBACKS[''];
  const voiceKey = videoSettings.voiceCharacter || '';
  const voiceDescription =
    voiceKey === '__custom__' && videoSettings.voiceCharacterCustom
      ? videoSettings.voiceCharacterCustom
      : catalogOptionPrompt(catalog, 'video_voice', voiceKey) || VOICE_CHARACTER_FALLBACKS[voiceKey];
  const isNoVoice = voiceKey === 'none';
  const isAutoVoice = voiceKey === '';
  const autoVoiceInstruction = hasRefImage
    ? 'เสียงพากย์: ออโต้จากภาพ reference ถ้าเห็นตัวละครหรือใบหน้าคน ให้เลือกเสียงพูดภาษาไทยที่เหมาะกับเพศและวัยของตัวละครในภาพ เช่น ผู้หญิงใช้เสียงผู้หญิงไทย ผู้ชายใช้เสียงผู้ชายไทย ถ้าเห็นแค่มือหรือสินค้าและไม่เห็นคน ให้ใช้เสียงบรรยายไทยกลางที่เหมาะกับสินค้า;'
    : 'เสียงพากย์: ออโต้ เลือกเสียงพูดภาษาไทยกลางที่เหมาะกับสินค้าและโทนโฆษณา;';

  const promptParts: string[] = [];
  promptParts.push('สร้างวิดีโอโฆษณาสินค้าภาษาไทย ต้องใช้ฉากและตัวละครหรือมือจากภาพที่แนบมาเท่านั้น ห้ามสร้างฉากใหม่ ห้ามเปลี่ยนสถานที่ตลอดทั้งวิดีโอ;');
  if (product.name) {
    promptParts.push(`สินค้า: ${product.name};`);
  }
  if (product.description) {
    promptParts.push(`รายละเอียดสินค้า: ${product.description};`);
  }

  promptParts.push('ฉาก: ใช้ฉากจากภาพที่แนบมาเท่านั้น พื้นหลังและสถานที่ต้องเหมือนกับในภาพทุกประการ ห้ามสร้างฉากใหม่ ห้ามเปลี่ยนสถานที่;');
  if (hasRefImage) {
    promptParts.push('ตัวละคร: ใช้ตัวละครหรือมือจากภาพที่แนบมา คงลักษณะเดิมทุกประการตลอดทั้งวิดีโอ ถ้าในภาพเห็นแค่มือก็ให้เห็นแค่มือ;');
    promptParts.push('ใบหน้าคน: ถ้าในภาพ reference เห็นใบหน้า ต้องรักษาให้ใบหน้าชัดเจน ไม่ถูกสินค้า มือ ผม หมวก หน้ากาก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บดบัง และไม่เบลอ ถ้าภาพ reference ไม่เห็นหน้า เช่น hands-only, product-only หรือมุมด้านหลัง ห้าม reveal หน้าใหม่ในวิดีโอ;');
  } else {
    promptParts.push('ตัวละคร: ไม่มีตัวละคร โฟกัสที่สินค้าเป็นหลัก;');
  }

  const dialogueMode = videoSettings.dialogueMode || 'auto';
  const isNoDialogue = dialogueMode === 'none';
  let finalStylePrompt = stylePrompt;
  if (isNoDialogue || isNoVoice) {
    finalStylePrompt = stylePrompt
      .replace(/\s*พูดแนะนำสินค้าอย่างเป็นธรรมชาติ/g, '')
      .replace(/\s*พูดรีวิว/g, '')
      .replace(/\s*พูดเชียร์ขายของ[^,;]*/g, '')
      .replace(/\s*พูดคุยกับกล้อง/g, '')
      .replace(/\s*พูด[^\s,;]*/g, '');
  }
  promptParts.push(`สไตล์วิดีโอ: ${finalStylePrompt};`);

  if (videoSettings.cameraMotion) {
    const motionDesc =
      videoSettings.cameraMotion === '__custom__' && videoSettings.cameraMotionCustom
        ? videoSettings.cameraMotionCustom
        : catalogOptionPrompt(catalog, 'video_camera_motion', videoSettings.cameraMotion) ||
          CAMERA_MOTION_FALLBACKS[videoSettings.cameraMotion] ||
          videoSettings.cameraMotion;
    promptParts.push(`การเคลื่อนกล้อง: ${motionDesc};`);
  }

  if (isNoVoice) {
    promptParts.push('เสียง: ไม่มีเสียงพูด วิดีโอเงียบมีแค่เพลงประกอบ;');
  } else if (isNoDialogue) {
    promptParts.push('บทพูด: ไม่มีบทพูด ห้ามมีเสียงพูดใดๆ ในวิดีโอ;');
  } else {
    if (isAutoVoice) {
      promptParts.push(autoVoiceInstruction);
    } else if (voiceDescription) {
      promptParts.push(`เสียงพากย์: ${voiceDescription};`);
    }
    promptParts.push(`สไตล์บทพูด: ${scriptTone};`);

    if (dialogueMode === 'auto') {
      promptParts.push('บทพูด: สร้างบทโฆษณาภาษาไทยประมาณ 6.5 วินาที หรือ 1-2 ประโยคที่พูดต่อเนื่องกัน กระตุ้นให้อยากซื้อและลดช่วงเงียบท้ายคลิป;');
    } else if (dialogueMode === 'custom') {
      const dialogue = resolveVideoDialogueForDesktopLikePrompt(videoSettings);
      if (dialogue) {
        promptParts.push(`บทพูด: ${dialogue};`);
      }
    }
  }

  const musicSfxMode = videoSettings.musicSfxMode || 'auto';
  if (musicSfxMode === 'none') {
    promptParts.push('เสียงดนตรีและเอฟเฟค: ห้ามมีเสียงดนตรีหรือเสียงเอฟเฟคใดๆ ทั้งสิ้น;');
  } else if (musicSfxMode === 'custom' && videoSettings.musicSfxCustom?.trim()) {
    promptParts.push(`เสียงดนตรีและเอฟเฟค: ${videoSettings.musicSfxCustom.trim()};`);
  }

  promptParts.push('ความต่อเนื่อง: ห้ามเปลี่ยนฉาก ห้ามเปลี่ยนสถานที่ ห้ามเปลี่ยนพื้นหลัง วิดีโอทั้งหมดต้องอยู่ในที่เดียวตั้งแต่ต้นจนจบ ตัวละครหรือมือต้องเป็นคนเดิมเหมือนกันตลอด ห้ามหมุนสินค้า;');

  if (isNoDialogue || isNoVoice) {
    promptParts.push('ข้อห้าม: ห้ามมี subtitle ห้ามมีข้อความบนจอ ห้ามมีขอบดำ วิดีโอต้องเต็มจอ ห้ามมีเสียงพูดใดๆ ทั้งสิ้น;');
  } else {
    promptParts.push('ข้อห้าม: ห้ามมี subtitle ห้ามมีข้อความบนจอ ทุกบทพูดต้องเป็นเสียงเท่านั้น ห้ามมีขอบดำ วิดีโอต้องเต็มจอ ใช้เสียงพูดภาษาไทยเท่านั้น;');
  }

  if (videoSettings.systemPrompt?.trim()) {
    promptParts.push(`คำสั่งเพิ่มเติม: ${videoSettings.systemPrompt.trim()}`);
  }

  return promptParts.join('\n');
}

/**
 * สร้าง Prompt สำหรับสไตล์ "สตอรี่" (Omni Flash + Ingredients)
 * ภาพอ้างอิงคือ Story Board Collage 5 ช่องที่สร้างจากฝั่งรูป (buildDesktopLikeImagePrompt isStoryMode)
 * วิดีโอผลลัพธ์ต้องเป็นคลิปต่อเนื่องเดียว 10 วิ ไล่ตามลำดับช่องในภาพ ไม่ใช่ collage/split screen
 */
function buildStoryVideoPrompt(product: AutoPilotProduct, catalog: PromptCatalog, hasRefImage: boolean): string {
  const videoSettings = product.settings.video;
  const storyStyleDescription =
    catalogOptionPrompt(catalog, 'video_style', STORY_STYLE_KEY) || VIDEO_STYLE_FALLBACKS[STORY_STYLE_KEY] || '';

  const dialogueMode = videoSettings.dialogueMode || 'auto';
  const isNoDialogue = dialogueMode === 'none';
  const voiceKey = videoSettings.voiceCharacter || '';
  const isNoVoice = voiceKey === 'none';
  const isAutoVoice = voiceKey === '';
  const voiceDescription =
    voiceKey === '__custom__' && videoSettings.voiceCharacterCustom
      ? videoSettings.voiceCharacterCustom
      : catalogOptionPrompt(catalog, 'video_voice', voiceKey) || VOICE_CHARACTER_FALLBACKS[voiceKey];

  const promptParts: string[] = [];

  promptParts.push('สร้างวิดีโอโฆษณาสินค้าภาษาไทย โดยใช้ภาพอ้างอิงที่แนบมาเป็นตัวกำหนดฉากและลำดับเหตุการณ์ทั้งหมด ภาพอ้างอิงเป็น Story Board Collage แบ่ง 5 ช่อง มีป้ายเวลาและคำบรรยายกำกับแต่ละช่องอยู่แล้ว ห้ามสร้างฉากใหม่ ห้ามเปลี่ยนสถานที่;');

  if (product.name) {
    promptParts.push(`สินค้า: ${product.name};`);
  }
  if (product.description) {
    promptParts.push(`รายละเอียดสินค้า: ${product.description};`);
  }

  promptParts.push(`สไตล์วิดีโอ: ${storyStyleDescription};`);

  promptParts.push('ลำดับเหตุการณ์: ไล่เนื้อหาไปตามลำดับทั้ง 5 ช่องในภาพอ้างอิง (จากซ้ายไปขวา บนลงล่าง) แต่ละช่วงยาวประมาณ 2 วินาที รวมความยาว 10 วินาที ฉากหลัง โทนสี และทิศทางแสงต้องเหมือนกันตลอดทั้งวิดีโอ เปลี่ยนแค่มุมกล้องและการกระทำตามแต่ละช่วงที่เห็นในภาพอ้างอิง;');

  promptParts.push('สินค้า: รูปทรง สัดส่วน สี และโลโก้ต้องตรงกับภาพอ้างอิงทุกจุด ห้ามบิดเบือนหรือสร้างสินค้าใหม่ที่ไม่ตรงกับภาพ;');

  promptParts.push(
    hasRefImage
      ? 'ตัวละคร: เน้นสินค้าเป็นหลัก ถ้าในภาพอ้างอิงเห็นแค่มือก็ให้เห็นแค่มือ ไม่ต้องมีพรีเซนเตอร์หรือคนพูดหน้ากล้อง;'
      : 'ตัวละคร: ไม่มีตัวละคร โฟกัสที่สินค้าเป็นหลัก;'
  );

  promptParts.push('ข้อความบนจอ (บังคับ): คงคำบรรยายภาษาไทยลายมือสไตล์มินิมอลตัวใหญ่แบบเดียวกับที่ปรากฏในภาพอ้างอิงไว้บนหน้าจอ ให้ตรงกับช่วงเวลาของแต่ละช่อง (ฉาก 1 = 0-2s, ฉาก 2 = 2-4s, ฉาก 3 = 4-6s, ฉาก 4 = 6-8s, ฉาก 5 = 8-10s) ตัวอักษรใหญ่ชัดเจนอ่านง่าย สีขาว ห้ามสะกดคำภาษาไทยผิด ห้ามใช้ภาษาอังกฤษยกเว้นชื่อยี่ห้อ;');

  if (isNoDialogue || isNoVoice) {
    promptParts.push('เสียง: ไม่มีเสียงพูดหรือเสียงพากย์ใดๆ ทั้งสิ้น มีแค่คำบรรยายบนจอเท่านั้น;');
  } else {
    if (isAutoVoice) {
      promptParts.push(
        hasRefImage
          ? 'เสียงพากย์: ออโต้จากภาพ reference ถ้าเห็นตัวละครหรือใบหน้าคน ให้เลือกเสียงพูดภาษาไทยที่เหมาะกับเพศและวัยของตัวละครในภาพ ถ้าเห็นแค่มือหรือสินค้าและไม่เห็นคน ให้ใช้เสียงบรรยายไทยกลางที่เหมาะกับสินค้า เป็นเสียงพากย์ (voice over) เท่านั้น ไม่ต้องมีคนพูดโชว์หน้ากล้อง;'
          : 'เสียงพากย์: ออโต้ เลือกเสียงพูดภาษาไทยกลางที่เหมาะกับสินค้า เป็นเสียงพากย์ (voice over) เท่านั้น ไม่ต้องมีคนพูดโชว์หน้ากล้อง;'
      );
    } else if (voiceDescription) {
      promptParts.push(`เสียงพากย์: ${voiceDescription} เป็นเสียงพากย์ (voice over) เท่านั้น ไม่ต้องมีคนพูดโชว์หน้ากล้อง;`);
    }

    if (dialogueMode === 'auto') {
      promptParts.push('บทพูด: พากย์เสียงบรรยายให้เนื้อหาตรงกับคำบรรยายและรายละเอียดที่ปรากฏจริงในแต่ละช่องของภาพอ้างอิง ไล่ตามลำดับทั้ง 5 ช่วง ช่วงละประมาณ 2 วินาที (รวม 10 วินาที) ไม่ต้องยึดหัวข้อตายตัว ให้ดูจากภาพจริงว่าช่องนั้นสื่ออะไรแล้วพูดขยายความเรื่องนั้น สำคัญมาก: ต้องพูดให้จบประโยคภายในเวลาของช่วงนั้นเสมอ ห้ามพูดค้างคาหรือถูกตัดกลางคำเด็ดขาด เลือกใช้คำสั้นกระชับพอดีกับจังหวะ 2 วินาที ถ้าเนื้อหาช่องไหนเยอะให้สรุปสั้นแทนที่จะพูดยาวจนโดนตัด น้ำเสียงเหมือนเพื่อนแนะนำเพื่อน (โทนป้ายยา) เป็นกันเอง จริงใจ กระตือรือร้น;');
    } else if (dialogueMode === 'custom') {
      const dialogue = resolveVideoDialogueForDesktopLikePrompt(videoSettings);
      if (dialogue) {
        promptParts.push(`บทพูด: ${dialogue};`);
      }
    }
  }

  const musicSfxMode = videoSettings.musicSfxMode || 'auto';
  if (musicSfxMode === 'none') {
    promptParts.push('เสียงดนตรีและเอฟเฟค: ห้ามมีเสียงดนตรีหรือเสียงเอฟเฟคใดๆ ทั้งสิ้น;');
  } else if (musicSfxMode === 'custom' && videoSettings.musicSfxCustom?.trim()) {
    promptParts.push(`เสียงดนตรีและเอฟเฟค: ${videoSettings.musicSfxCustom.trim()};`);
  } else {
    promptParts.push('เสียงดนตรีและเอฟเฟค: ใส่เพลงประกอบบรรยากาศเบาๆ สไตล์มินิมอล/อบอุ่น ดังพอได้ยินแต่ไม่กลบเสียงพากย์หรือคำบรรยาย พร้อมเสียงเอฟเฟคเล็กน้อยตามการกระทำในแต่ละช่วงทั้ง 5 ช่วง (เช่น เสียงสัมผัสสินค้า เสียงเปิด-ปิด) ให้เข้ากับจังหวะฉากที่เปลี่ยนไป;');
  }

  promptParts.push('ข้อห้าม: ห้ามมี collage ห้ามแบ่งหลาย panel หรือ split screen ในวิดีโอผลลัพธ์ (แม้ภาพอ้างอิงจะเป็น storyboard แต่วิดีโอต้องเป็นภาพต่อเนื่องเต็มจอเดียวเท่านั้น) ห้ามมีขอบดำ ห้ามมีโลโก้แพลตฟอร์มหรือ watermark วิดีโอต้องเต็มจอ;');

  if (videoSettings.systemPrompt?.trim()) {
    promptParts.push(`คำสั่งเพิ่มเติม: ${videoSettings.systemPrompt.trim()}`);
  }

  return promptParts.join('\n');
}

function resolveImageModel(product: AutoPilotProduct, settings: AutoPilotSettings): string {
  return product.settings.image.imageModel || settings.flowImageModel || 'nano_banana_pro';
}

function resolveVideoModel(product: AutoPilotProduct, settings: AutoPilotSettings): string {
  return product.settings.video.videoModel || settings.flowVideoModel || 'veo_31_lite_lower';
}

function resolveVideoDuration(product: AutoPilotProduct, settings: AutoPilotSettings): number {
  const videoModel = resolveVideoModel(product, settings);
  const raw = Number(product.settings.video.videoDuration || settings.flowVideoDuration || 8);
  const configured = Number.isFinite(raw) && raw > 0 ? raw : 8;
  return videoModel === 'omni_flash' ? configured : Math.min(configured, 8);
}

function isMultiSceneVideo(product: AutoPilotProduct): boolean {
  const videoSettings = product.settings.video;
  const sceneCount = Number.parseInt(videoSettings.sceneCount || '1', 10);
  return (
    (videoSettings.videoMethod || 'extend') === 'multi' &&
    Number.isFinite(sceneCount) &&
    sceneCount > 1
  );
}

function createImageBuildSettings(product: AutoPilotProduct, settings: AutoPilotSettings): BuildSettings {
  const imageSettings = product.settings.image;
  const videoDuration = resolveVideoDuration(product, settings);
  return {
    ...imageSettings,
    customStyleCustom: imageSettings.customStyle === '__custom__' ? imageSettings.presetStyleCustom : undefined,
    imageModel: resolveImageModel(product, settings),
    duration: String(videoDuration),
    flowVideoDuration: String(videoDuration),
  };
}

function createImageReferenceInstructionLines(imageSettings: AutoPilotProduct['settings']['image']): string[] {
  const lines: string[] = [];
  const characterDescription = compactText(imageSettings.characterDescription);
  const sceneDescription = compactText(imageSettings.sceneDescription);
  const characterMode = imageSettings.characterMode;
  const hasCharacterReference = characterMode !== 'auto' && characterMode !== 'none';

  if (characterMode === 'none') {
    lines.push('ตัวละคร: ไม่ต้องมีคนหรือตัวละครในภาพ ให้เน้นสินค้าเป็นหลัก');
  } else if (characterDescription && hasCharacterReference) {
    lines.push(`ตัวละคร reference: ${characterDescription}`);
  }

  if (characterMode !== 'none') {
    const outfit = imageSettings.characterOutfit || 'auto';
    if (outfit === 'original') {
      lines.push('ชุดตัวละคร: ให้ตัวละครใส่ชุดเดิมตามรูปตัวละคร reference');
    } else if (outfit === 'custom' && compactText(imageSettings.characterOutfitCustom)) {
      lines.push(`ชุดตัวละคร: ${compactText(imageSettings.characterOutfitCustom)}`);
    } else if (hasCharacterReference) {
      lines.push(
        'ชุดตัวละคร: ใช้รูปตัวละคร reference เพื่อรักษาใบหน้า ทรงผม บุคลิก และตัวตนเท่านั้น ไม่ต้องคงชุดเดิม ให้เปลี่ยนชุดให้เหมาะกับสินค้า ฉาก และบริบทการใช้งานจริง'
      );
    } else {
      lines.push('ชุดตัวละคร: ให้ตัวละครใส่ชุดที่เหมาะสมกับสินค้า ฉาก และบริบทการใช้งานจริง');
    }
  }

  if (imageSettings.sceneMode === 'none') {
    lines.push('ฉาก: ใช้พื้นหลังเรียบง่ายและไม่ดึงความสนใจจากสินค้า');
  } else if (sceneDescription && imageSettings.sceneMode !== 'auto') {
    lines.push(`ฉาก reference: ${sceneDescription}`);
  }

  return lines;
}

function appendImageReferenceInstructions(
  prompt: string,
  imageSettings: AutoPilotProduct['settings']['image']
): string {
  const referenceLines = createImageReferenceInstructionLines(imageSettings);
  if (referenceLines.length === 0) {
    return prompt;
  }

  return [prompt, ...referenceLines].filter(Boolean).join('; ');
}

function createVideoBuildSettings(product: AutoPilotProduct, settings: AutoPilotSettings): BuildSettings {
  const videoSettings = product.settings.video;
  const sceneCount = Number.parseInt(videoSettings.sceneCount || '1', 10);
  const videoModel = resolveVideoModel(product, settings);
  const videoDuration = resolveVideoDuration(product, settings);

  return {
    ...videoSettings,
    videoModel,
    videoDuration,
    duration: String(videoDuration),
    flowVideoDuration: String(videoDuration),
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
  const needsImagePrompt = enabledSteps.includes('image') || (enabledSteps.includes('video') && isMultiSceneVideo(product));
  if (needsImagePrompt) {
    const imageSettings = product.settings.image;
    const prompt =
      imageSettings.promptMode === 'custom'
        ? buildPrompt(
            'image',
            createImageBuildSettings(product, settings),
            {
              ...baseProduct,
              hasReference: Boolean(product.preview),
            },
            catalog
          ).trim()
        : buildDesktopLikeImagePrompt(product, catalog).trim();
    if (prompt) {
      bundle.image = imageSettings.promptMode === 'custom'
        ? appendImageReferenceInstructions(prompt, product.settings.image)
        : prompt;
    }
  }

  if (enabledSteps.includes('video')) {
    const videoSettings = product.settings.video;
    const hasRefImage = Boolean(product.preview) || enabledSteps.includes('image');
    const prompt =
      videoSettings.promptMode === 'custom'
        ? buildPrompt(
            'video',
            createVideoBuildSettings(product, settings),
            {
              ...baseProduct,
              hasReference: hasRefImage,
            },
            catalog
          ).trim()
        : buildDesktopLikeVideoPrompt(product, catalog, hasRefImage).trim();
    if (prompt) {
      bundle.video = prompt;
    }
  }

  return bundle;
}
