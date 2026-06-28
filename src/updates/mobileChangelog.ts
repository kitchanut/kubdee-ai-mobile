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
    version: '0.1.9',
    date: '2026-06-29',
    highlight: 'ปรับ Auto Workflow ให้ตั้งค่าและทำงานใกล้เคียง Desktop มากขึ้น',
    changes: [
      { type: 'added', text: 'เพิ่มตัวเลือกให้ AI คิด Caption, Hashtags และ CTA แยกกันได้' },
      { type: 'improved', text: 'ปรับตัวเลือกวิดีโอหลายฉากให้มีมุมเดิม หลายมุม และเสียงพากษ์' },
      { type: 'improved', text: 'ปรับค่าเริ่มต้นและการตรวจโมเดล Flow ให้เหมาะกับการใช้งานบนมือถือมากขึ้น' },
      { type: 'fixed', text: 'ปรับการบันทึกผลลัพธ์ให้ใช้ข้อความที่ AI คิดล่าสุดกับรูปและวิดีโอที่สร้าง' },
    ],
  },
  {
    version: '0.1.8',
    date: '2026-06-28',
    highlight: 'ปรับ Auto Workflow ให้ทำงานต่อเนื่องและตรวจสถานะได้ชัดเจนขึ้น',
    changes: [
      { type: 'added', text: 'เพิ่มตัวเลือกสร้างโปรเจกต์ใหม่ใน Google Flow แยกต่อสินค้า' },
      { type: 'improved', text: 'จำค่าตั้งค่า Auto Workflow และขั้นตอนที่เลือกไว้สำหรับการใช้งานครั้งถัดไป' },
      { type: 'improved', text: 'เพิ่มเวลาและสถานะ Google Flow ใน Activity Log ระหว่างสร้างงาน' },
      { type: 'improved', text: 'ปรับ retry การสร้างวิดีโอเดี่ยวให้ลองใหม่เป็นรอบพร้อมแจ้งสถานะชัดเจนขึ้น' },
    ],
  },
  {
    version: '0.1.7',
    date: '2026-06-28',
    highlight: 'ปรับ Auto Workflow ให้รับมือ Google Flow error ได้ดีขึ้น',
    changes: [
      { type: 'fixed', text: 'แจ้งเตือนเมื่อ Google Flow เปิดเป็นภาษาอื่นที่ทำให้ระบบหาเมนูไม่ตรง' },
      { type: 'improved', text: 'เพิ่มการ retry งานวิดีโอเดี่ยวเมื่อ Google Flow สร้างไม่สำเร็จ' },
      { type: 'improved', text: 'เพิ่มการให้ AI ช่วยปรับ prompt ก่อน retry เมื่อการสร้างวิดีโอมีปัญหา' },
    ],
  },
  {
    version: '0.1.6',
    date: '2026-06-28',
    highlight: 'แสดงสถานะ Auto Workflow ระหว่างทำงานกับ Google Flow ได้ละเอียดขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่ม log ระหว่างเปิดโปรเจกต์ใหม่ กรอก prompt และกดสร้างใน Google Flow' },
      { type: 'improved', text: 'เพิ่ม log ระหว่างเลือกรูปล่าสุดและอัปโหลดรูป reference' },
      { type: 'improved', text: 'ปรับหน้าความคืบหน้าให้บอกขั้นตอนแนบรูปและ retry ได้ชัดเจนขึ้น' },
    ],
  },
  {
    version: '0.1.5',
    date: '2026-06-28',
    highlight: 'ปรับความแม่นยำการแนบรูป reference ใน Auto Workflow',
    changes: [
      { type: 'improved', text: 'เพิ่มการตรวจสอบรูป reference ก่อนเริ่มสร้างวิดีโอ' },
      { type: 'improved', text: 'เพิ่มการรอและลองอัปโหลดรูป reference ซ้ำเมื่อ Google Flow ขอให้เว้นจังหวะ' },
      { type: 'improved', text: 'แสดงสถานะการตรวจ reference และ retry อัปโหลดในหน้าความคืบหน้า' },
    ],
  },
  {
    version: '0.1.4',
    date: '2026-06-28',
    highlight: 'ปรับ Auto Workflow ให้ติดตามสถานะได้ละเอียดขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่มเวลาเริ่มงาน เวลาล่าสุด และ log ล่าสุดในสถานะการทำงาน' },
      { type: 'improved', text: 'เพิ่มสถานะ Google Flow ระหว่างสร้าง เช่น กำลังทำ คิว สำเร็จ และล้มเหลว' },
      { type: 'improved', text: 'ปรับการตรวจหลังส่งคำสั่งสร้างให้ลองกรอก prompt ซ้ำเมื่อ Flow ยังไม่เริ่ม' },
      { type: 'improved', text: 'เพิ่มการหน่วงเวลาระหว่างสินค้าตามค่าความเร็วที่เลือก' },
    ],
  },
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

export const CURRENT_CHANGELOG_VERSION = MOBILE_CHANGELOG[0]?.version ?? '0.1.9';
