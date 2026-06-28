export interface MobileChangelogItem {
  type: 'feature' | 'added' | 'fixed' | 'improved' | 'changed' | 'removed';
  text: string;
}

export interface MobileChangelogRelease {
  version: string;
  date: string;
  highlight: string;
  changes: MobileChangelogItem[];
}

export const MOBILE_CHANGELOG: MobileChangelogRelease[] = [
  {
    version: '0.1.3',
    date: '2026-06-28',
    highlight: 'ปรับหน้าตา Changelog ให้ใกล้เคียง Desktop มากขึ้น',
    changes: [
      { type: 'changed', text: 'เปลี่ยน Changelog จาก bottom sheet เป็น modal กลางจอแบบ Desktop' },
      { type: 'changed', text: 'จัดรายการอัปเดตเป็น timeline พร้อมจุดเวอร์ชันและเส้นลำดับแบบ Desktop' },
      { type: 'changed', text: 'จัดกลุ่มรายการเป็น FEATURES, IMPROVEMENTS และ BUG FIXES เหมือน Desktop' },
    ],
  },
  {
    version: '0.1.2',
    date: '2026-06-28',
    highlight: 'ปรับปรุงคลังรูปภาพและวิดีโอให้ใช้งานได้จริงมากขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้ปุ่มลบในคลังรูปภาพและวิดีโอให้ลบรายการที่เลือกได้ถูกต้อง' },
      { type: 'added', text: 'เพิ่มการดูตัวอย่างรูปภาพจากในคลัง' },
      { type: 'added', text: 'เพิ่มการเปิดเล่นวิดีโอจากคลังผ่าน Android viewer' },
      { type: 'changed', text: 'ปรับการแก้ไขชื่อรายการในคลังให้บันทึกได้จากมือถือ' },
    ],
  },
  {
    version: '0.1.1',
    date: '2026-06-28',
    highlight: 'ปรับปรุงระบบอัปเดตแอปให้ชัดเจนขึ้น',
    changes: [
      { type: 'added', text: 'เพิ่มแถบความคืบหน้าระหว่างดาวน์โหลดอัปเดต' },
      { type: 'added', text: 'เพิ่มการตรวจสอบไฟล์หลังดาวน์โหลด' },
      { type: 'changed', text: 'ปรับการเช็คอัปเดตให้ครอบคลุมมากขึ้นหลังเข้าสู่ระบบ' },
      { type: 'fixed', text: 'ปรับข้อความช่วยเหลือเมื่อ Android ต้องอนุญาตการติดตั้งแอป' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-28',
    highlight: 'เริ่มระบบ Mobile App พร้อมหน้าตรวจสอบเวอร์ชัน',
    changes: [
      { type: 'added', text: 'เพิ่มเมนูเช็คอัปเดตแอปจากในหน้าบัญชี' },
      { type: 'added', text: 'เพิ่มหน้าเวอร์ชันและประวัติการเปลี่ยนแปลง' },
      { type: 'changed', text: 'ปรับปรุงการแจ้งเตือนเมื่อมีเวอร์ชันใหม่' },
      { type: 'fixed', text: 'ปรับพื้นฐานระบบให้พร้อมสำหรับการอัปเดตครั้งถัดไป' },
    ],
  },
];

export const CURRENT_CHANGELOG_VERSION = MOBILE_CHANGELOG[0]?.version ?? '0.1.3';
