export interface MobileChangelogItem {
  type: 'added' | 'changed' | 'fixed';
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

export const CURRENT_CHANGELOG_VERSION = MOBILE_CHANGELOG[0]?.version ?? '0.1.0';
