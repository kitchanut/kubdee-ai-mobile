/**
 * optionSets.ts — ชุดตัวเลือกสำหรับฟอร์มตั้งค่ารูปภาพ/วิดีโอรายสินค้า
 * Port มาจาก kubdee-ai-extension (ImageSettingsForm.jsx / VideoSettingsForm.jsx)
 * เพื่อให้ UI ของ mobile ตรงกับ extension มากที่สุด
 */

export interface AutoPilotOption {
  value: string;
  label: string;
  isNew?: boolean;
  isCustom?: boolean;
}

export interface AutoPilotTab {
  key: string;
  label: string;
}

// ───────────────────────── รูปภาพ: สไตล์ (ชุดเซท) ─────────────────────────

export const PRESET_TABS: AutoPilotTab[] = [
  { key: 'core', label: 'สไตล์หลัก' },
  { key: 'festival', label: 'เทศกาล' },
  { key: 'lifestyle', label: 'ไลฟ์สไตล์' },
  { key: 'profession', label: 'อาชีพ' },
  { key: 'product', label: 'สินค้า' },
];

export const PRESET_OPTIONS: Record<string, AutoPilotOption[]> = {
  core: [
    { value: 'auto', label: 'ออโต้' },
    { value: 'คนธรรมดารีวิว', label: 'คนธรรมดา' },
    { value: 'ภาพถ่ายจากมือถือ', label: 'มือถือ' },
    { value: 'มืออาชีพ', label: 'มืออาชีพ' },
    { value: 'สวมใส่เสื้อผ้า', label: 'สวมใส่' },
    { value: 'ถือสินค้ารีวิว', label: 'ถือสินค้า' },
    { value: 'รีวิวการใช้งาน', label: 'ใช้งานจริง' },
    { value: 'เห็นมืออย่างเดียว', label: 'เห็นมือ' },
    { value: 'อลังการ ดุดัน', label: 'อลังการ' },
    { value: 'หรูหรา', label: 'หรูหรา' },
    { value: 'มินิมอล', label: 'มินิมอล' },
    { value: 'สนุกสดใส', label: 'สนุกสดใส' },
    { value: 'โมเดิร์น', label: 'โมเดิร์น' },
    { value: 'หรูหรา พรีเมียม', label: 'พรีเมียม' },
    { value: 'ธรรมชาติ ออร์แกนิค', label: 'ออร์แกนิค' },
    { value: 'ไลฟ์สไตล์', label: 'ไลฟ์สไตล์' },
    { value: 'ป๊อปอาร์ต', label: 'ป๊อปอาร์ต' },
  ],
  festival: [
    { value: 'ตรุษจีน', label: 'ตรุษจีน' },
    { value: 'วาเลนไทน์', label: 'วาเลนไทน์' },
    { value: 'สงกรานต์', label: 'สงกรานต์' },
    { value: 'วันเกิด', label: 'วันเกิด' },
    { value: 'วัดทำบุญ', label: 'วัดทำบุญ' },
  ],
  lifestyle: [
    { value: 'กำลังออกกำลังกาย', label: 'ออกกำลังกาย' },
    { value: 'กำลังทำอาหาร', label: 'ทำอาหาร' },
    { value: 'กำลังกินข้าว', label: 'กินข้าว' },
    { value: 'กำลังดื่มกาแฟ', label: 'ดื่มกาแฟ' },
    { value: 'กำลังทำงาน', label: 'ทำงาน' },
    { value: 'กำลังเดินทาง', label: 'เดินทาง' },
    { value: 'กำลังพักผ่อน', label: 'พักผ่อน' },
    { value: 'กำลังอ่านหนังสือ', label: 'อ่านหนังสือ' },
    { value: 'กำลังแต่งหน้า', label: 'แต่งหน้า' },
    { value: 'กำลังบำรุงผิว', label: 'บำรุงผิว' },
    { value: 'กำลังอาบน้ำ', label: 'อาบน้ำ' },
    { value: 'กำลังนอนหลับ', label: 'นอนหลับ' },
    { value: 'กำลังขับรถ', label: 'ขับรถ' },
    { value: 'กำลังช้อปปิ้ง', label: 'ช้อปปิ้ง' },
    { value: 'กำลังเล่นกับสัตว์เลี้ยง', label: 'เล่นสัตว์เลี้ยง' },
  ],
  profession: [
    { value: 'หมอ', label: 'หมอ' },
    { value: 'พยาบาล', label: 'พยาบาล' },
    { value: 'เภสัชกร', label: 'เภสัชกร' },
    { value: 'นักวิทยาศาสตร์', label: 'นักวิทย์' },
    { value: 'นักศึกษา', label: 'นักศึกษา' },
    { value: 'พนักงานออฟฟิศ', label: 'ออฟฟิศ' },
    { value: 'แม่บ้าน', label: 'แม่บ้าน' },
    { value: 'แม่ลูกอ่อน', label: 'แม่ลูกอ่อน' },
    { value: 'เชฟ', label: 'เชฟ' },
    { value: 'นักกีฬา', label: 'นักกีฬา' },
    { value: 'เทรนเนอร์', label: 'เทรนเนอร์' },
    { value: 'ช่างแต่งหน้า', label: 'ช่างแต่งหน้า' },
    { value: 'บิวตี้บล็อกเกอร์', label: 'บิวตี้' },
    { value: 'Influencer', label: 'Influencer' },
    { value: 'นางแบบ', label: 'นางแบบ' },
  ],
  product: [
    { value: 'สกินแคร์', label: 'สกินแคร์' },
    { value: 'เครื่องสำอาง', label: 'เครื่องสำอาง' },
    { value: 'อาหารเสริม', label: 'อาหารเสริม' },
    { value: 'เสื้อผ้า', label: 'เสื้อผ้า' },
    { value: 'กระเป๋า', label: 'กระเป๋า' },
    { value: 'รองเท้า', label: 'รองเท้า' },
    { value: 'เครื่องประดับ', label: 'เครื่องประดับ' },
    { value: 'อาหาร', label: 'อาหาร' },
    { value: 'เครื่องดื่ม', label: 'เครื่องดื่ม' },
    { value: 'ของใช้ในบ้าน', label: 'ของใช้บ้าน' },
    { value: 'อุปกรณ์ไอที', label: 'ไอที/Gadget' },
    { value: 'สัตว์เลี้ยง', label: 'สัตว์เลี้ยง' },
    { value: 'ของใช้เด็ก', label: 'ของใช้เด็ก' },
    { value: 'กีฬา', label: 'กีฬา' },
    { value: 'รถยนต์', label: 'รถยนต์' },
  ],
};

export const CUSTOM_STYLE_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'คนธรรมดา', label: 'คนธรรมดา' },
  { value: 'ภาพถ่ายจากมือถือ', label: 'มือถือ' },
  { value: 'มืออาชีพ', label: 'มืออาชีพ' },
  { value: 'สวมใส่', label: 'สวมใส่' },
  { value: 'ถือสินค้า', label: 'ถือสินค้า' },
  { value: 'ใช้งานจริง', label: 'ใช้งานจริง' },
  { value: 'เห็นมือ', label: 'เห็นมือ' },
  { value: 'อลังการ', label: 'อลังการ' },
  { value: 'สนุกสดใส', label: 'สนุกสดใส' },
  { value: 'โมเดิร์น', label: 'โมเดิร์น' },
  { value: 'มินิมอล', label: 'มินิมอล' },
  { value: 'หรูหรา พรีเมียม', label: 'หรูหรา' },
  { value: 'ธรรมชาติ ออร์แกนิค', label: 'ออร์แกนิค' },
  { value: 'ไลฟ์สไตล์', label: 'ไลฟ์สไตล์' },
  { value: 'ป๊อปอาร์ต', label: 'ป๊อปอาร์ต' },
  { value: 'พาสเทล', label: 'พาสเทล' },
  { value: 'นีออน ไซเบอร์', label: 'นีออน' },
  { value: 'ฟิล์มวินเทจ', label: 'วินเทจ' },
  { value: 'ขาวดำ', label: 'ขาวดำ' },
  { value: '3D น่ารัก', label: '3D น่ารัก' },
  { value: 'การ์ตูน 2D', label: 'การ์ตูน' },
  { value: 'อนิเมะ', label: 'อนิเมะ' },
  { value: 'ภาพยนตร์', label: 'ภาพยนตร์' },
  { value: '__custom__', label: 'พิมพ์เอง', isCustom: true },
];

// ───────────────────────── รูปภาพ: สไตล์ไวรัล ─────────────────────────

export const VIRAL_TABS: AutoPilotTab[] = [
  { key: 'survival', label: 'หนีตาย' },
  { key: 'rich', label: 'Flex รวย' },
  { key: 'landmark', label: 'สถานที่ดัง' },
  { key: 'funny', label: 'ตลกฮา' },
  { key: 'fantasy', label: 'แฟนตาซี' },
];

export const VIRAL_OPTIONS: Record<string, AutoPilotOption[]> = {
  survival: [
    { value: 'น้ำท่วมถึงเอว', label: 'น้ำท่วม' },
    { value: 'ไฟไหม้หลังบ้าน', label: 'ไฟไหม้' },
    { value: 'ฉลามโผล่หลัง', label: 'ฉลามไล่' },
    { value: 'ตกจากตึกสูง', label: 'ตกจากตึก' },
    { value: 'รถพุ่งชน', label: 'รถชน' },
    { value: 'เรือกำลังจม', label: 'เรือจม' },
    { value: 'แผ่นดินไหว', label: 'แผ่นดินไหว' },
    { value: 'พายุทอร์นาโด', label: 'พายุ' },
    { value: 'ลาวาไหลมา', label: 'ลาวา' },
    { value: 'สิงโตจ้องกิน', label: 'สิงโตจ้อง' },
    { value: 'งูยักษ์รัด', label: 'งูรัด' },
    { value: 'ซอมบี้ไล่กัด', label: 'ซอมบี้' },
  ],
  rich: [
    { value: 'เครื่องบินส่วนตัว', label: 'Private Jet' },
    { value: 'เรือยอร์ช', label: 'เรือยอร์ช' },
    { value: 'หน้ารถLambo', label: 'Lamborghini' },
    { value: 'สระวิลล่าหรู', label: 'วิลล่าหรู' },
    { value: 'ห้องสูทดูไบ', label: 'สูทดูไบ' },
    { value: 'ช้อปแบรนด์เนม', label: 'แบรนด์เนม' },
    { value: 'คฤหาสน์หรู', label: 'คฤหาสน์' },
    { value: 'เฮลิคอปเตอร์', label: 'เฮลิคอปเตอร์' },
    { value: 'ปาร์ตี้บนเรือ', label: 'ปาร์ตี้เรือ' },
    { value: 'ดินเนอร์หรู', label: 'ดินเนอร์หรู' },
  ],
  landmark: [
    { value: 'หน้าหอไอเฟล', label: 'หอไอเฟล' },
    { value: 'หน้าพีระมิด', label: 'พีระมิด' },
    { value: 'บนกำแพงจีน', label: 'กำแพงจีน' },
    { value: 'ในอวกาศ', label: 'อวกาศ' },
    { value: 'ใต้ทะเลปะการัง', label: 'ใต้ทะเล' },
    { value: 'ยอดเอเวอเรสต์', label: 'เอเวอเรสต์' },
    { value: 'หน้าทัชมาฮาล', label: 'ทัชมาฮาล' },
    { value: 'สะพานโกลเดนเกต', label: 'Golden Gate' },
    { value: 'โคลอสเซียม', label: 'โคลอสเซียม' },
    { value: 'มาชูปิกชู', label: 'มาชูปิกชู' },
    { value: 'ซากุระญี่ปุ่น', label: 'ซากุระ' },
    { value: 'แกรนด์แคนยอน', label: 'แกรนด์แคนยอน' },
  ],
  funny: [
    { value: 'รีวิวในห้องน้ำ', label: 'ห้องน้ำ' },
    { value: 'โดนตำรวจจับ', label: 'โดนจับ' },
    { value: 'แฟนโกรธหลังบ้าน', label: 'แฟนโกรธ' },
    { value: 'หลับคาโต๊ะ', label: 'หลับคาโต๊ะ' },
    { value: 'ติดในตู้เสื้อผ้า', label: 'ติดในตู้' },
    { value: 'งานแต่งตัวเอง', label: 'งานแต่ง' },
    { value: 'ระหว่างสอบ', label: 'ระหว่างสอบ' },
    { value: 'ประชุมบริษัท', label: 'ประชุม' },
    { value: 'คิวหมอยาว', label: 'คิวหมอ' },
    { value: 'รถติดมาก', label: 'รถติด' },
    { value: 'ลิฟต์เต็ม', label: 'ลิฟต์เต็ม' },
    { value: 'เมาหลังปาร์ตี้', label: 'เมา' },
  ],
  fantasy: [
    { value: 'ขี่มังกรบิน', label: 'ขี่มังกร' },
    { value: 'ป่าเทพนิยาย', label: 'ป่าเทพนิยาย' },
    { value: 'เมืองอนาคตไซไฟ', label: 'เมืองอนาคต' },
    { value: 'ยุคไดโนเสาร์', label: 'ไดโนเสาร์' },
    { value: 'โลกอนิเมะ', label: 'อนิเมะ' },
    { value: 'พบเอเลี่ยน', label: 'เอเลี่ยน' },
    { value: 'ในเกม3มิติ', label: 'ในเกม' },
    { value: 'ปราสาทเวทมนตร์', label: 'ปราสาท' },
    { value: 'ใต้น้ำแอตแลนติส', label: 'แอตแลนติส' },
    { value: 'บนเมฆสวรรค์', label: 'บนเมฆ' },
    { value: 'ยุคอียิปต์โบราณ', label: 'อียิปต์' },
    { value: 'โลกหลังหายนะ', label: 'Post-Apocalypse' },
  ],
};

// ───────────────────────── รูปภาพ: ฉาก / รายละเอียด ─────────────────────────

export const LOCATION_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'สตูดิโอขาว', label: 'สตูดิโอขาว' },
  { value: 'พื้นหลังไล่สี', label: 'ไล่สี' },
  { value: 'ห้องนั่งเล่น', label: 'ห้องนั่งเล่น' },
  { value: 'ห้องนอน', label: 'ห้องนอน' },
  { value: 'ห้องครัว', label: 'ห้องครัว' },
  { value: 'ห้องน้ำ', label: 'ห้องน้ำ' },
  { value: 'ระเบียง', label: 'ระเบียง' },
  { value: 'ออฟฟิศ', label: 'ออฟฟิศ' },
  { value: 'คาเฟ่', label: 'คาเฟ่' },
  { value: 'ร้านอาหาร', label: 'ร้านอาหาร' },
  { value: 'ห้าง', label: 'ห้าง' },
  { value: 'ห้างลด', label: 'ห้างลด', isNew: true },
  { value: 'ตลาดนัด', label: 'ตลาดนัด', isNew: true },
  { value: 'โกดัง', label: 'โกดัง', isNew: true },
  { value: 'โล๊ะสต๊อก', label: 'โล๊ะสต๊อก', isNew: true },
  { value: 'โรงงาน', label: 'โรงงาน', isNew: true },
  { value: 'สายพาน', label: 'สายพาน', isNew: true },
  { value: 'ตลาดสด', label: 'ตลาดสด' },
  { value: 'ซูเปอร์มาร์เก็ต', label: 'ซูเปอร์' },
  { value: 'ฟิตเนส', label: 'ฟิตเนส' },
  { value: 'สปา', label: 'สปา' },
  { value: 'โรงพยาบาล', label: 'โรงพยาบาล' },
  { value: 'ร้านเสริมสวย', label: 'ร้านเสริมสวย' },
  { value: 'โรงแรม', label: 'โรงแรม' },
  { value: 'รีสอร์ท', label: 'รีสอร์ท' },
  { value: 'สนามบิน', label: 'สนามบิน' },
  { value: 'ริมทะเล', label: 'ริมทะเล' },
  { value: 'สระว่ายน้ำ', label: 'สระว่ายน้ำ' },
  { value: 'สวนสาธารณะ', label: 'สวน' },
  { value: 'ทุ่งดอกไม้', label: 'ทุ่งดอกไม้' },
  { value: 'ภูเขา', label: 'ภูเขา' },
  { value: 'น้ำตก', label: 'น้ำตก' },
  { value: 'ป่า', label: 'ป่า' },
  { value: 'แคมป์ปิ้ง', label: 'แคมป์ปิ้ง' },
  { value: 'ถนนในเมือง', label: 'ถนน' },
  { value: 'รถไฟฟ้า', label: 'รถไฟฟ้า' },
  { value: 'ตึกสูง', label: 'ตึกสูง' },
  { value: 'สะพาน', label: 'สะพาน' },
  { value: 'สนามกีฬา', label: 'สนามกีฬา' },
  { value: 'คอนเสิร์ต', label: 'คอนเสิร์ต' },
  { value: 'อวกาศ', label: 'อวกาศ' },
  { value: 'ใต้น้ำ', label: 'ใต้น้ำ' },
  { value: 'แฟนตาซี', label: 'แฟนตาซี' },
  { value: 'ไซเบอร์พังค์', label: 'ไซเบอร์พังค์' },
  { value: '__custom__', label: 'พิมพ์เอง', isCustom: true },
];

export const LIGHTING_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'แสงนุ่ม', label: 'แสงนุ่ม' },
  { value: 'แสงแข็ง', label: 'แสงแข็ง' },
  { value: 'แสงธรรมชาติ', label: 'ธรรมชาติ' },
  { value: 'แสงสตูดิโอ', label: 'สตูดิโอ' },
  { value: 'ช่วงเวลาแสงทอง', label: 'แสงทอง' },
  { value: 'แสงนีออน', label: 'นีออน' },
  { value: 'แสงมืด', label: 'แสงมืด' },
  { value: '__custom__', label: 'พิมพ์เอง', isCustom: true },
];

export const FRAME_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'ภาพมุมกว้าง', label: 'มุมกว้าง' },
  { value: 'ภาพระยะกลาง', label: 'ระยะกลาง' },
  { value: 'ภาพระยะใกล้', label: 'ระยะใกล้' },
  { value: 'มุมภาพเหนือไหล่', label: 'เหนือไหล่' },
  { value: 'มุมมองบุคคล', label: 'POV' },
  { value: 'มุมสูง', label: 'มุมสูง' },
  { value: 'มุมต่ำ', label: 'มุมต่ำ' },
  { value: 'GoPro Selfie', label: 'GoPro' },
  { value: '__custom__', label: 'พิมพ์เอง', isCustom: true },
];

export const PRODUCT_DISPLAY_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'wear', label: 'สวมใส่' },
  { value: 'hold', label: 'ถือสินค้า' },
  { value: 'use', label: 'ใช้งานจริง' },
  { value: 'display', label: 'วางโชว์' },
];

// ───────────────────────── รูปภาพ: โหมดตัวละคร / ชุด / ข้อความ ─────────────────────────

export const IMAGE_CHARACTER_MODE_TABS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'gallery', label: 'คลัง' },
  { value: 'upload', label: 'อัปโหลด' },
  { value: 'description', label: 'กำหนดเอง' },
  { value: 'none', label: 'ไม่มี' },
];

export const IMAGE_SCENE_MODE_TABS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'gallery', label: 'คลัง' },
  { value: 'upload', label: 'อัปโหลด' },
  { value: 'description', label: 'กำหนดเอง' },
  { value: 'none', label: 'ไม่มี' },
];

export const IMAGE_PROMPT_MODE_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'Auto Prompt' },
  { value: 'ai', label: 'AI Prompt' },
  { value: 'custom', label: 'Manual Prompt' },
];

export const IMAGE_STYLE_MODE_OPTIONS: AutoPilotOption[] = [
  { value: 'preset', label: 'ชุดเซท' },
  { value: 'custom', label: 'กำหนดเอง' },
  { value: 'viral', label: 'ไวรัล' },
];

export const CHARACTER_OUTFIT_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'original', label: 'ตามภาพ' },
  { value: 'custom', label: 'กำหนดเอง' },
];

export const TEXT_OVERLAY_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'none', label: 'ไม่ใส่' },
  { value: 'custom', label: 'กำหนดเอง' },
];

// ───────────────────────── วิดีโอ ─────────────────────────

export const VIDEO_CHARACTER_MODE_OPTIONS: AutoPilotOption[] = [
  { value: 'fromImage', label: 'จากรูป' },
  { value: 'none', label: 'ไม่มี' },
];

export const VIDEO_PROMPT_MODE_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'Auto Prompt' },
  { value: 'ai', label: 'AI Prompt' },
  { value: 'custom', label: 'Manual Prompt' },
];

export const VIDEO_STYLE_OPTIONS: AutoPilotOption[] = [
  { value: '', label: 'ปกติ' },
  { value: 'ugc', label: 'UGC รีวิว' },
  { value: 'hands_only', label: 'เห็นแค่มือ' },
  { value: 'hardsell_ugc', label: 'ขายแรง UGC', isNew: true },
  { value: 'lifestyle', label: 'ไลฟ์สไตล์' },
  { value: 'studio', label: 'สตูดิโอ' },
  { value: 'outdoor', label: 'กลางแจ้ง' },
  { value: 'professional', label: 'มืออาชีพ' },
  { value: 'runway_pose', label: 'เดินโพส' },
  { value: 'cute_dance', label: 'เต้น' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'minimal', label: 'มินิมอล' },
  { value: 'luxury', label: 'หรูหรา' },
  { value: 'modern', label: 'ทันสมัย' },
  { value: 'playful', label: 'ขี้เล่น/สนุก' },
  { value: 'storytelling', label: 'เล่าเรื่องขาย' },
  { value: 'cgi_realistic', label: 'CGI Realistic' },
  { value: 'asmr', label: 'ASMR' },
  { value: 'slow_motion', label: 'Slow Motion' },
  { value: 'unboxing', label: 'แกะกล่อง' },
];

export const CAMERA_OPTIONS: AutoPilotOption[] = [
  { value: '', label: 'ออโต้' },
  { value: 'แพนซ้าย-ขวา', label: 'แพนซ้าย-ขวา' },
  { value: 'แพนขึ้น-ลง', label: 'แพนขึ้น-ลง' },
  { value: 'ซูมเข้า', label: 'ซูมเข้า' },
  { value: 'ซูมออก', label: 'ซูมออก' },
  { value: 'โคจรรอบ', label: 'โคจรรอบ' },
  { value: 'ติดตาม', label: 'ติดตาม' },
  { value: 'คงที่', label: 'คงที่' },
  { value: '__custom__', label: 'กำหนดเอง', isCustom: true },
];

export const VOICE_OPTIONS: AutoPilotOption[] = [
  { value: '', label: 'ออโต้' },
  { value: 'none', label: 'ไม่มี' },
  { value: 'female', label: 'ผู้หญิง' },
  { value: 'male', label: 'ผู้ชาย' },
  { value: 'teen_girl', label: 'สาววัยรุ่น' },
  { value: 'teen_boy', label: 'หนุ่มวัยรุ่น' },
  { value: 'vendor_female', label: 'แม่ค้า' },
  { value: 'vendor_male', label: 'พ่อค้า' },
  { value: 'office_female', label: 'พี่สาวออฟฟิศ' },
  { value: 'office_male', label: 'พี่ชายออฟฟิศ' },
  { value: 'aunt', label: 'ป้า' },
  { value: 'uncle', label: 'ลุง' },
  { value: '__custom__', label: 'กำหนดเอง', isCustom: true },
];

export const VOICEOVER_TTS_GROUPS: Array<{ label: string; options: AutoPilotOption[] }> = [
  {
    label: 'หญิง',
    options: [
      { value: 'tts_aoede', label: 'Aoede โปร่งสบาย' },
      { value: 'tts_leda', label: 'Leda วัยรุ่น' },
      { value: 'tts_callirrhoe', label: 'Callirrhoe สบายๆ' },
      { value: 'tts_zephyr', label: 'Zephyr สดใส' },
      { value: 'tts_sulafat', label: 'Sulafat อบอุ่น' },
      { value: 'tts_achird', label: 'Achird เป็นมิตร' },
      { value: 'tts_achernar', label: 'Achernar นุ่ม' },
      { value: 'tts_vindemiatrix', label: 'Vindemiatrix อ่อนโยน' },
      { value: 'tts_despina', label: 'Despina เรียบลื่น' },
      { value: 'tts_erinome', label: 'Erinome ใสชัด' },
    ],
  },
  {
    label: 'ชาย',
    options: [
      { value: 'tts_puck', label: 'Puck ร่าเริง' },
      { value: 'tts_charon', label: 'Charon ข้อมูลชัด' },
      { value: 'tts_fenrir', label: 'Fenrir ตื่นเต้น' },
      { value: 'tts_orus', label: 'Orus หนักแน่น' },
      { value: 'tts_iapetus', label: 'Iapetus ชัดเจน' },
      { value: 'tts_algenib', label: 'Algenib หนักแน่น' },
      { value: 'tts_alnilam', label: 'Alnilam หนักแน่น' },
      { value: 'tts_rasalgethi', label: 'Rasalgethi ข่าวสาร' },
      { value: 'tts_gacrux', label: 'Gacrux ผู้ใหญ่' },
      { value: 'tts_sadaltager', label: 'Sadaltager ชัดเจน' },
    ],
  },
  {
    label: 'กลาง',
    options: [
      { value: '', label: 'ออโต้' },
      { value: 'tts_kore', label: 'Kore หนักแน่น' },
      { value: 'tts_autonoe', label: 'Autonoe สดใส' },
      { value: 'tts_enceladus', label: 'Enceladus ลมหายใจ' },
      { value: 'tts_umbriel', label: 'Umbriel ง่ายๆ' },
      { value: 'tts_algieba', label: 'Algieba นุ่มลื่น' },
      { value: 'tts_laomedeia', label: 'Laomedeia ร่าเริง' },
      { value: 'tts_pulcherrima', label: 'Pulcherrima กังวาน' },
      { value: 'tts_schedar', label: 'Schedar เสมอ' },
      { value: 'tts_zubenelgenubi', label: 'Zubenelgenubi กันเอง' },
      { value: 'tts_sadachbia', label: 'Sadachbia มีชีวิตชีวา' },
    ],
  },
];

export const SCRIPT_STYLE_OPTIONS: AutoPilotOption[] = [
  { value: '', label: 'ออโต้' },
  { value: 'normal', label: 'ปกติ' },
  { value: 'playful', label: 'กวนตีน' },
  { value: 'polite', label: 'สุภาพ' },
  { value: 'hardsell', label: 'ขายแรง' },
  { value: 'isan', label: 'อีสาน' },
  { value: 'northern', label: 'คำเมือง' },
  { value: 'cute', label: 'น่ารัก' },
  { value: 'confident', label: 'มั่นใจ' },
  { value: 'excited', label: 'ตื่นเต้น' },
  { value: 'peaceful', label: 'สงบ' },
  { value: 'romantic', label: 'โรแมนติก' },
  { value: '__custom__', label: 'กำหนดเอง', isCustom: true },
];

export const DIALOGUE_MODE_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'none', label: 'ไม่มี' },
  { value: 'custom', label: 'กำหนดเอง' },
];

export const MUSIC_SFX_MODE_OPTIONS: AutoPilotOption[] = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'none', label: 'ไม่มี' },
  { value: 'custom', label: 'กำหนดเอง' },
];

export const DIALOGUE_ORDER_OPTIONS: AutoPilotOption[] = [
  { value: 'sequential', label: 'เรียงลำดับ' },
  { value: 'random', label: 'สุ่ม' },
];

// ───────────────────────── พื้นฐาน (ใช้ร่วม) ─────────────────────────

export const ASPECT_RATIO_OPTIONS: AutoPilotOption[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
];

export const OUTPUT_COUNT_VALUES = ['1', '2', '3', '4'] as const;
export const SCENE_COUNT_VALUES = ['1', '2', '3', '4', '5'] as const;
