import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_TYPE, BACKEND_URL, CLIENT_APP } from '@/auth/constants';

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

export type MobileChangelogSource = 'remote' | 'cache' | 'local';

export interface MobileChangelogLoadResult {
  releases: MobileChangelogRelease[];
  source: MobileChangelogSource;
  error: string | null;
}

interface RemoteRelease {
  version?: unknown;
  date?: unknown;
  highlight?: unknown;
  changes?: unknown;
}

interface RemoteReleaseResponse {
  releases?: unknown;
  error?: string;
  message?: string;
}

interface CachedMobileChangelog {
  releases: MobileChangelogRelease[];
  cachedAt: number;
}

const MOBILE_CHANGELOG_CACHE_KEY = 'kubdee_ai_mobile_changelog_v1';

export const MOBILE_CHANGELOG: MobileChangelogRelease[] = [
  {
    version: '0.2.70',
    date: '2026-07-06',
    highlight: 'ดึงสินค้าถูกใจครบขึ้น ไม่ข้ามสินค้าที่ชื่อมีคำอย่าง รับประกัน/ผ่อน/ส่งฟรี',
    changes: [
      {
        type: 'fixed',
        text: 'ดึงสิ่งที่ถูกใจ: สินค้าที่ชื่อมีคำอย่าง รับประกัน ผ่อน ส่งฟรี เคยถูกระบบกรองข้ามไปทั้งการ์ด ตอนนี้ดึงได้ครบตามรายการจริง',
      },
      {
        type: 'improved',
        text: 'log ระหว่างดึงสินค้าแสดงชื่อเต็มไม่ตัดท้าย และบอกสาเหตุทันทีเมื่อการ์ดไหนจับคู่ชื่อกับราคาไม่ได้',
      },
    ],
  },
  {
    version: '0.2.69',
    date: '2026-07-06',
    highlight: 'โพสต์วิดีโอ Shopee ได้แม้ปุ่มโพสต์แสดงเป็นไอคอน + อย่างเดียว',
    changes: [
      {
        type: 'fixed',
        text: 'บางเครื่องปุ่มโพสต์วิดีโอมุมขวาล่างในหน้าบัญชี Shopee Video แสดงเป็นไอคอน + ล้วนจนระบบหาไม่เจอและหยุดโพสต์ ตอนนี้เพิ่มการค้นหาสำรอง ทั้งจับไอคอน + โดยตรงและหาปุ่มกดได้ที่ใกล้มุมขวาล่างที่สุดแทน',
      },
    ],
  },
  {
    version: '0.2.68',
    date: '2026-07-06',
    highlight: 'ดึงสินค้า Shopee เสถียรขึ้น เลิกแตะโดนแถบหมวดหมู่',
    changes: [
      {
        type: 'fixed',
        text: 'ดึงสิ่งที่ถูกใจไม่แตะโดน หมวดหมู่ บนแถบตัวกรองอีก เช็คตำแหน่งแถบจากจอจริงก่อนแตะทุกครั้ง และถ้าแผงตัวกรองเผลอเปิดค้างระบบจะปิดให้เองแล้วดึงต่อ',
      },
      {
        type: 'fixed',
        text: 'ดึงข้อเสนอ Affiliate ต่อเนื่องหลายชิ้นไม่สะดุด ปิดแกลเลอรีรูปที่เปิดซ้อนหลังคัดลอกลิงก์ให้ครบ และเลี่ยงจุดแตะที่เสี่ยงโดนปุ่มแชทลอย',
      },
      {
        type: 'improved',
        text: 'แปลงลิงก์เสร็จแล้วถอยออกจากหน้า แปลงลิงก์ ให้เรียบร้อย ไม่ทิ้งหน้าค้างไว้รบกวนการทำงานรอบถัดไป',
      },
    ],
  },
  {
    version: '0.2.67',
    date: '2026-07-05',
    highlight: 'แปลงลิงก์สินค้าเป็น short link ให้อัตโนมัติจากคลัง',
    changes: [
      {
        type: 'feature',
        text: 'คลังสินค้าแจ้งเตือนเมื่อมีลิงก์ที่ยังไม่ใช่ short link พร้อมปุ่มแปลงลิงก์ ระบบจะเปิด Shopee ไปหน้า แปลงลิงก์ ให้เอง แล้วบันทึกลิงก์ใหม่เข้าคลังสินค้า รูปภาพ และวิดีโอครบทุกที่',
      },
      {
        type: 'improved',
        text: 'แปลงทีละลิงก์เพื่อความแม่นยำ จับคู่ลิงก์ใหม่ตรงตัวสินค้าเสมอ และเก็บผลระหว่างทางไว้บนเครื่อง ต่อให้แอปถูกปิดกลางคันผลที่แปลงแล้วก็ไม่หาย',
      },
      {
        type: 'fixed',
        text: 'โพสต์ Shopee ส่งเฉพาะ short link ไปค้นหาสินค้า ลิงก์แบบเต็มจะใช้ค้นหาด้วยชื่อสินค้าแทน ไม่ค้างที่ขั้นแนบสินค้าอีก',
      },
    ],
  },
  {
    version: '0.2.66',
    date: '2026-07-05',
    highlight: 'รูปและวิดีโอในคลังได้ลิงก์สินค้าใหม่อัตโนมัติ',
    changes: [
      {
        type: 'feature',
        text: 'ลิงก์และชื่อสินค้าในคลังรูปภาพ/วิดีโอ อัปเดตตามคลังสินค้าอัตโนมัติ ดึงสินค้าชุดใหม่แล้วรูป/วิดีโอเดิมได้ลิงก์ใหม่ทันที โพส Shopee ไม่เจอลิงก์หมดอายุอีก',
      },
    ],
  },
  {
    version: '0.2.65',
    date: '2026-07-05',
    highlight: 'โพส Shopee แนบสินค้าได้ครบทุกเครื่อง',
    changes: [
      {
        type: 'fixed',
        text: 'ขั้นตอนแนบสินค้าตอนโพส Shopee รองรับปุ่มทั้งแบบ แตะเพื่อเพิ่มสินค้า และ เพิ่มสินค้าและโค้ดส่วนลด ที่บางเครื่องแสดงต่างกัน',
      },
      {
        type: 'changed',
        text: 'ฟอร์มแก้ไขสินค้าในคลัง เอาช่องรายละเอียดออก ให้เกลาข้อความที่ชื่อสินค้าช่องเดียว (ข้อมูลรายละเอียดเดิมยังถูกใช้ประกอบ prompt ตามปกติ)',
      },
    ],
  },
  {
    version: '0.2.64',
    date: '2026-07-05',
    highlight: 'ปรับโฉม UX หน้าออโต้และ Shopee ทั้งชุด ใช้ง่ายสะอาดตาขึ้น',
    changes: [
      {
        type: 'improved',
        text: 'หน้าออโต้จัดระเบียบใหม่ทั้งหน้า ระยะห่าง มุมโค้ง ฟอนต์เป็นระบบเดียวกัน และหน้าว่างมีปุ่ม เลือกจากคลัง / เพิ่มเอง กดได้ทันที',
      },
      {
        type: 'improved',
        text: 'ตั้งค่าวิดีโอ: โมเดลเป็นเมนูเลือกคู่กับความยาว และจำนวนฉากคู่กับวิธีสร้าง ประหยัดพื้นที่ อ่านง่ายขึ้น',
      },
      {
        type: 'fixed',
        text: 'แก้ UI ซ้อนทับตอนเลือกหลายฉาก และพื้นหลังช่องค้นหา/ช่องกรอกเพี้ยนในโหมดมืด',
      },
      {
        type: 'improved',
        text: 'หน้าต่างตั้งค่าและชีททั้งหมดลอยเว้นขอบจอ มุมโค้งครบ ไม่ชนขอบล่างอีกต่อไป',
      },
      {
        type: 'feature',
        text: 'Preset ลบได้แล้ว บันทึกชื่อซ้ำจะทับตัวเดิม พร้อมแจ้งเตือน toast ทุกการบันทึก/โหลด/ลบ',
      },
      {
        type: 'improved',
        text: 'หน้าโพส Shopee ตัวหนังสืออ่านสบายขึ้น ลิสต์สะอาดขึ้น และซ่อนปุ่มโพสเมื่อคิวว่าง',
      },
    ],
  },
  {
    version: '0.2.63',
    date: '2026-07-05',
    highlight: 'ตั้งค่าสมอง AI เลือก Provider และ Model ได้เองแล้ว',
    changes: [
      {
        type: 'feature',
        text: 'เพิ่มเมนู การตั้งค่า ในเมนูบัญชี (กดรูปโปรไฟล์มุมขวาบน) เปิดหน้าตั้งค่าแบบเดียวกับ extension',
      },
      {
        type: 'feature',
        text: 'แท็บ สมอง เลือก AI Provider (Gemini/OpenAI) และ Model ที่ใช้คิด caption, hashtags, CTA และบทพูดหลายฉากได้เอง ใช้เครดิต KUBDEE เหมือนเดิม',
      },
    ],
  },
  {
    version: '0.2.60',
    date: '2026-07-05',
    highlight: 'Shopee เข้าหน้า ฉัน ได้ผ่านง่ายขึ้นบนบางเครื่อง',
    changes: [
      { type: 'fixed', text: 'ปรับการตรวจหน้า ฉัน ของ Shopee ให้ใช้เงื่อนไขเดิมแต่ลดจำนวน marker ที่ต้องพบจาก 2 ตัวเหลือ 1 ตัว ลดปัญหาอยู่ถูกหน้าแล้วแต่ระบบตรวจไม่ผ่าน' },
    ],
  },
  {
    version: '0.2.59',
    date: '2026-07-05',
    highlight: 'เห็นตำแหน่งกดชัดขึ้นทั้ง Shopee และ Google Flow',
    changes: [
      { type: 'improved', text: 'ปรับ animation แสดงตำแหน่งกดใน Google Flow WebView ให้แสดงจากหน้าเว็บโดยตรง ลดอาการช้ากว่าจังหวะกดจริง' },
      { type: 'improved', text: 'เพิ่มเลขลำดับบน animation การกดใน Shopee Post และ Shopee Import เพื่อช่วยดูว่ากดครั้งไหนติด' },
      { type: 'fixed', text: 'ปรับ Shopee Post ให้รอหลังแตะเพิ่มสินค้านานขึ้น ลดการกดซ้ำเร็วเกินไปก่อนหน้าจอเปลี่ยน' },
      { type: 'improved', text: 'ปรับให้ AI คิด caption สำหรับ Shopee ให้สั้นพอดี โดยรวม caption และ hashtag ไม่เกิน 140 ตัวอักษร' },
    ],
  },
  {
    version: '0.2.58',
    date: '2026-07-05',
    highlight: 'Shopee Post เห็นตำแหน่งกดชัดขึ้นและกดป้ายกำกับ AI ตรงขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การเปิดป้ายกำกับ AI ใน Shopee Post ให้จับคู่สวิตช์จากข้อความกำกับ ลดปัญหากดไปโดน toggle อื่น' },
      { type: 'improved', text: 'ปรับจุดแสดงตำแหน่งที่ระบบกด ให้เห็นครบขึ้นทั้งการกดด้วยพิกัดและการกดปุ่มที่ทำให้เปลี่ยนหน้า' },
    ],
  },
  {
    version: '0.2.57',
    date: '2026-07-04',
    highlight: 'Shopee Post เปิดป้ายกำกับ AI ได้เสถียรขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับการเปิดป้ายกำกับ AI ใน Shopee Post ให้ตรวจสวิตช์จากภาพหน้าจอก่อนกด ลดปัญหาบางเครื่องกด toggle ไม่ติด' },
      { type: 'improved', text: 'เพิ่มการยืนยันสถานะหลังแตะ toggle และ log ให้เห็นชัดว่าเปิดหรือปิดสำเร็จจริงก่อนโพสต์' },
    ],
  },
  {
    version: '0.2.56',
    date: '2026-07-04',
    highlight: 'Shopee Post กดไอคอนโซ่เพิ่มสินค้าได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับการเปิดช่องกรอกลิงก์สินค้าให้คำนวณตำแหน่งไอคอนโซ่จาก header ของ Shopee เมื่อระบบมองไม่เห็นไอคอนโดยตรง' },
      { type: 'improved', text: 'เพิ่ม log ให้เห็นชัดว่าระบบใช้ตำแหน่งจาก header bounds และแนบสินค้าด้วยลิงก์สำเร็จหรือไม่' },
    ],
  },
  {
    version: '0.2.55',
    date: '2026-07-04',
    highlight: 'Shopee Post กดเพิ่มสินค้าได้ตรงขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับการแนบสินค้า Shopee Post ให้กดตรงข้อความ แตะเพื่อเพิ่มสินค้า ก่อนเสมอ ลดปัญหาบางเครื่องกดไม่โดน' },
      { type: 'improved', text: 'เพิ่มการตรวจว่าเมนูเพิ่มสินค้าเปิดจริง และค่อยใช้ตำแหน่งสำรองเมื่อกดจุดหลักแล้วเมนูยังไม่ขึ้น' },
    ],
  },
  {
    version: '0.2.54',
    date: '2026-07-04',
    highlight: 'Shopee Offers ลองกดแชร์ซ้ำอัตโนมัติ',
    changes: [
      { type: 'fixed', text: 'เพิ่มการลองกดแชร์สินค้าข้อเสนอ Shopee ด้วยตำแหน่งสำรองก่อนข้ามรายการเมื่อแผงแชร์ไม่เปิด' },
      { type: 'improved', text: 'ปรับ log ให้เห็นชัดว่าระบบกดแชร์ด้วย resource id, clickable area หรือ fallback จากแถวค่าคอมมิชชั่น' },
    ],
  },
  {
    version: '0.2.53',
    date: '2026-07-04',
    highlight: 'Shopee Offers เปิดแชร์และดึงรูปได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับการกดแชร์สินค้าในข้อเสนอ Shopee ให้ใช้ไอคอนหรือพิกัดจากแถวค่าคอมมิชชั่นเมื่อหา resource id ไม่เจอ' },
      { type: 'improved', text: 'เพิ่ม log แหล่งที่ใช้กดแชร์และจำนวนรูปที่จับคู่ได้ เพื่อช่วยตรวจสอบเครื่องที่ Shopee แสดง UI ต่างกัน' },
    ],
  },
  {
    version: '0.2.52',
    date: '2026-07-04',
    highlight: 'Shopee Import ดูสาเหตุรูปสินค้าไม่ขึ้นได้ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่ม log ตอนดึงรูปสินค้า Shopee เพื่อบอกว่ารูปมาจากแผงแชร์ การ์ดสินค้า URL หรือไม่มีรูป' },
      { type: 'improved', text: 'เพิ่มสรุปผล cache รูปสินค้า ช่วยแยกปัญหาสิทธิ์รูปภาพ MediaStore URL และไฟล์รูปที่โหลดไม่ได้' },
    ],
  },
  {
    version: '0.2.51',
    date: '2026-07-04',
    highlight: 'Shopee Offers Import เจอสินค้าได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้ปัญหาบางเครื่องดึงสินค้าจากข้อเสนอ Shopee แล้วไม่พบสินค้า แม้เห็นการ์ดสินค้าอยู่บนหน้าจอ' },
      { type: 'improved', text: 'เพิ่ม log สั้น ๆ ตอนหา resource id ปุ่มแชร์ไม่เจอ และเปลี่ยนไปอ่านกริดจากราคาและชื่อสินค้าแทน' },
    ],
  },
  {
    version: '0.2.50',
    date: '2026-07-04',
    highlight: 'คลังสินค้าแก้ไขสินค้าได้จากมือถือ',
    changes: [
      { type: 'feature', text: 'เพิ่มฟอร์มแก้ไขสินค้าในหน้าคลังสินค้า แก้รูป ชื่อสินค้า ลิงก์ ราคา สต็อก Caption Hashtag และ CTA ได้จากมือถือ' },
      { type: 'fixed', text: 'ปรับการดึงสินค้า Shopee จากรายการถูกใจให้ใช้มุมมองผู้ซื้อ และซ่อน log panel ชั่วคราวตอนสลับมุมมองเพื่อลดปัญหากดปุ่มไม่ได้' },
      { type: 'improved', text: 'ปรับไอคอนตั้งค่าพื้นฐานในเมนูออโต้ และแสดงไอคอนย่อ/ขยายให้เห็นครบทั้งตอนเปิดและพับ section' },
    ],
  },
  {
    version: '0.2.49',
    date: '2026-07-04',
    highlight: 'Shopee Import ดึงข้อเสนอ Affiliate ได้แม่นขึ้น',
    changes: [
      { type: 'feature', text: 'เพิ่มการดึงสินค้า Shopee จากหน้าข้อเสนอ Affiliate พร้อมเลือกหมวดข้อเสนอ เช่น แนะนำและเครื่องใช้ในบ้าน' },
      { type: 'fixed', text: 'ปรับการแตะ tab หมวดข้อเสนอให้ตรงกับหมวดที่เลือก ลดปัญหาเลือกเครื่องใช้ในบ้านแล้วไปกดหมวดถัดไป' },
      { type: 'improved', text: 'ซ่อน log panel ชั่วคราวตอนกดดาวน์โหลดรูปจากแผงแชร์ เพื่อลดโอกาสบังปุ่มของ Shopee' },
    ],
  },
  {
    version: '0.2.47',
    date: '2026-07-04',
    highlight: 'Shopee Post คุมความยาวแคปชั่นได้ดีขึ้น',
    changes: [
      { type: 'improved', text: 'AI คิดแคปชั่นและแฮชแท็กสำหรับ Shopee ให้สั้นลง และระบบจะปรับข้อความก่อนโพสต์ไม่ให้เกินขีดจำกัดของ Shopee' },
    ],
  },
  {
    version: '0.2.46',
    date: '2026-07-03',
    highlight: 'คลังวิดีโอแทนที่ไฟล์เดิมได้',
    changes: [
      { type: 'feature', text: 'เพิ่มปุ่มแทนที่ในหน้าแก้ไขวิดีโอ เพื่อเลือกวิดีโอใหม่มาแทนรายการเดิมได้โดยยังคงข้อมูลสินค้าและข้อความโพสต์ไว้' },
    ],
  },
  {
    version: '0.2.45',
    date: '2026-07-03',
    highlight: 'Shopee Post กลับมาหน้ารายการหลังทำงานจบ',
    changes: [
      { type: 'improved', text: 'หลังโพสต์ Shopee เสร็จหรือหยุดงาน แอปจะกลับมาที่หน้า Shopee Post เพื่อดูผลลัพธ์และ log ต่อได้ทันที' },
    ],
  },
  {
    version: '0.2.44',
    date: '2026-07-03',
    highlight: 'Shopee Post เก็บ log ย้อนหลังได้เสถียรขึ้น',
    changes: [
      { type: 'fixed', text: 'บันทึก Activity ของ Shopee Post ตั้งแต่เริ่มกดโพสต์ รวมถึงกรณี Accessibility หรือ permission ยังไม่พร้อม' },
      { type: 'improved', text: 'เขียน log ล่าสุดลงเครื่องทันทีระหว่าง native automation เพื่อลดปัญหาเปิดเมนู Mobile แล้วไม่เจอ log' },
      { type: 'fixed', text: 'ปรับการแตะไอคอนโซ่ใน Shopee Post ให้ใช้ตำแหน่งจริงของหน้าจอแต่ละเครื่อง' },
    ],
  },
  {
    version: '0.2.43',
    date: '2026-07-03',
    highlight: 'ซิงก์คลังสินค้าไม่สร้างรายการซ้ำ',
    changes: [
      { type: 'fixed', text: 'แก้ปัญหากดซิงก์ cloud แล้วสินค้า Shopee ซ้ำในเครื่องเมื่อสินค้าเดียวกันมาจากคนละอุปกรณ์' },
      { type: 'improved', text: 'ปรับการรวมข้อมูลคลังสินค้าให้ใช้ข้อมูล cloud เป็นหลักและเก็บรายการสินค้าไว้ชุดเดียว' },
    ],
  },
  {
    version: '0.2.42',
    date: '2026-07-03',
    highlight: 'คลังสินค้าแสดงรูปจาก cloud ได้เสถียรขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้ปัญหาภาพสินค้าในคลังไม่ขึ้นเมื่อสินค้าถูกสร้างหรือซิงก์มาจากอุปกรณ์อื่น' },
      { type: 'improved', text: 'ปรับการซิงก์รูปสินค้าให้ข้ามไฟล์รูปที่ไม่รองรับโดยไม่ทำให้การซิงก์ทั้งคลังล้ม' },
    ],
  },
  {
    version: '0.2.41',
    date: '2026-07-03',
    highlight: 'Shopee Post เปิดป้ายกำกับ AI ได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้ปัญหาบางเครื่องเปิด toggle ป้ายกำกับ AI ไม่ติดก่อนโพสต์ Shopee' },
      { type: 'improved', text: 'ปรับการแตะสวิตช์ Shopee ให้แยกทิศทางเปิด/ปิดชัดเจนและยืนยันสถานะหลังแตะ' },
    ],
  },
  {
    version: '0.2.40',
    date: '2026-07-03',
    highlight: 'Shopee Post ตั้งค่า toggle ก่อนโพสต์ได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การกด toggle อนุญาตให้นำเนื้อหาไปใช้ซ้ำ/เผยแพร่ต่อ และป้ายกำกับ AI บางเครื่องที่กดกลางปุ่มแล้วไม่เปลี่ยนสถานะ' },
      { type: 'improved', text: 'ปรับตำแหน่งแตะ toggle ให้ตรงกับพฤติกรรม Shopee บนมือถือจริงมากขึ้นก่อนโพสต์วิดีโอ' },
    ],
  },
  {
    version: '0.2.39',
    date: '2026-07-03',
    highlight: 'Shopee Post แนบสินค้าและตั้งค่าโพสต์เสถียรขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับขั้นตอนหลังแนบสินค้า Shopee ให้กลับมาหน้าโพสต์นิ่งก่อนตั้งค่า toggle ลดปัญหาค้างที่ช่องแคปชั่น' },
      { type: 'improved', text: 'เพิ่มการตรวจสถานะ toggle จากหน้าจอและ log ให้ดูย้อนหลังได้มากขึ้นในแอป' },
    ],
  },
  {
    version: '0.2.38',
    date: '2026-07-02',
    highlight: 'Shopee Post ไม่กรอกผิดช่องค้นหาเมื่อกดไอคอนลิงก์ไม่สำเร็จ',
    changes: [
      { type: 'fixed', text: 'หลังแตะไอคอนโซ่หน้าเพิ่มสินค้า ต้องตรวจว่าหน้าใส่ลิงก์เปิดจริงก่อนจึงจะกรอกลิงก์สินค้า' },
      { type: 'fixed', text: 'ถ้ามีลิงก์สินค้าแต่เปิดหน้าใส่ลิงก์ไม่ได้ ระบบจะไม่ fallback ไปกรอกช่องค้นหาสินค้าแทน' },
    ],
  },
  {
    version: '0.2.37',
    date: '2026-07-02',
    highlight: 'ซ่อน overlay ระหว่างคุม Shopee เพื่อไม่ให้บังหรือถูกรวมใน Accessibility',
    changes: [
      { type: 'fixed', text: 'ซ่อน floating log และปุ่ม Stop ระหว่าง Shopee automation แทนการย้ายตำแหน่ง ลดโอกาสบังปุ่ม Shopee ทั้งด้านบนและด้านล่าง' },
      { type: 'improved', text: 'ยังเก็บ log และส่งกลับหน้าแอปเหมือนเดิม แต่ไม่สร้าง overlay ทับหน้าจอ Shopee ระหว่างดึงสินค้าและโพสต์วิดีโอ' },
    ],
  },
  {
    version: '0.2.36',
    date: '2026-07-02',
    highlight: 'ย้าย log automation ลงล่างเพื่อไม่ทับหัวหน้า Shopee',
    changes: [
      { type: 'fixed', text: 'ย้าย overlay log และปุ่ม Stop ของ automation ไปด้านล่างจอ ลดโอกาสบัง header และไอคอนโซ่ของ Shopee' },
      { type: 'improved', text: 'เว้นระยะ navigation bar ด้านล่าง เพื่อให้ log ลอยอยู่ในพื้นที่ที่เห็นได้ชัดแต่ไม่ชนขอบจอ' },
    ],
  },
  {
    version: '0.2.35',
    date: '2026-07-02',
    highlight: 'Shopee Post หาไอคอนโซ่บนหน้าจอเล็กได้ถูกต้องขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การกรองไอคอนโซ่มุมขวาบนหน้าเพิ่มสินค้า Shopee ที่บางเครื่องมีขนาดเล็กกว่า threshold เดิม ทำให้ระบบหา node ไม่เจอ' },
      { type: 'improved', text: 'ยังคงจำกัดการกดเฉพาะไอคอน ImageView ใน header หน้าเพิ่มสินค้า เพื่อไม่ให้เดากดตำแหน่งสุ่มและ debug ยาก' },
    ],
  },
  {
    version: '0.2.34',
    date: '2026-07-02',
    highlight: 'Shopee Post แสดงเวอร์ชันและลดปัญหา overlay บังไอคอนโซ่',
    changes: [
      { type: 'improved', text: 'เพิ่มเวอร์ชันแอปใน overlay และ log เริ่มงาน เพื่อให้ตรวจสอบ build จากรูปหน้าจอได้ชัดเจน' },
      { type: 'fixed', text: 'ซ่อน overlay และปุ่ม Stop ชั่วคราวก่อนหาและกดไอคอนโซ่ในหน้าเพิ่มสินค้า Shopee ลดปัญหา UI ของเราไปบัง node' },
    ],
  },
  {
    version: '0.2.33',
    date: '2026-07-02',
    highlight: 'Shopee Post หาไอคอนโซ่มุมขวาบนได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้บางเครื่องที่หน้าเพิ่มสินค้า Shopee แสดงไอคอนโซ่เป็นรูปเปล่าไม่มี label ทำให้ระบบหาไม่เจอ' },
      { type: 'improved', text: 'เพิ่มการตรวจไอคอน ImageView ขวาบนของหน้าเพิ่มสินค้า แล้วกดจาก bounds จริงของ UI แทนการเดาจากข้อความ' },
    ],
  },
  {
    version: '0.2.32',
    date: '2026-07-02',
    highlight: 'Shopee Post กดไอคอนลิงก์ไม่โดน Stop บัง',
    changes: [
      { type: 'fixed', text: 'แก้การกดไอคอนลิงก์ในหน้าเพิ่มสินค้า Shopee ให้ซ่อนปุ่ม Stop ชั่วคราวก่อนกด ลดปัญหา overlay บังปุ่ม' },
      { type: 'improved', text: 'ใช้พฤติกรรมกดแบบเดียวกับขั้นตอนกดแชร์ตอนดึงสินค้า เพื่อให้การ tap บนหน้าจอจริงเสถียรขึ้น' },
    ],
  },
  {
    version: '0.2.31',
    date: '2026-07-02',
    highlight: 'Shopee Post กดไอคอนลิงก์แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้ขั้นตอนแนบสินค้า Shopee หลังเข้าแตะเพื่อเพิ่มสินค้า ให้กดเฉพาะไอคอนลิงก์ที่ตรวจเจอจาก UI เท่านั้น' },
      { type: 'improved', text: 'ตัดการกดตำแหน่งสำรองของไอคอนลิงก์ออก เพื่อลดโอกาสกดโดนปุ่มอื่นและทำให้ debug ง่ายขึ้น' },
    ],
  },
  {
    version: '0.2.30',
    date: '2026-07-02',
    highlight: 'Shopee Post แนบสินค้าได้ตรงปุ่มขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การแนบสินค้าในหน้าโพสต์ Shopee หลังกรอกแคปชั่น ให้กดปุ่มแตะเพื่อเพิ่มสินค้าได้ตรงจุด' },
      { type: 'improved', text: 'ลดโอกาสกดโดนข้อความหัวข้อเพิ่มสินค้าแทนปุ่มเพิ่มสินค้าจริงในหน้า Shopee Post' },
    ],
  },
  {
    version: '0.2.29',
    date: '2026-07-02',
    highlight: 'Shopee Post แนบสินค้าได้เสถียรขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การแนบสินค้าในหน้าโพสต์ Shopee ให้รองรับขั้นตอนแตะเพื่อเพิ่มสินค้าและวางลิงก์รูปแบบใหม่' },
      { type: 'improved', text: 'ปรับการเปิดเมนู Shopee Post ให้ใช้ทางเดียวกับขั้นตอนดึงสินค้า ลดโอกาสเลื่อนหาเมนูเกินจำเป็น' },
      { type: 'improved', text: 'เพิ่มการรอและลองซ้ำเมื่อหน้าเพิ่มสินค้า Shopee โหลดช้า' },
    ],
  },
  {
    version: '0.2.28',
    date: '2026-07-02',
    highlight: 'Changelog โหลดจาก server และอ่านง่ายขึ้น',
    changes: [
      { type: 'improved', text: 'Changelog ในแอปรองรับข้อมูลจาก server และแยกหมวดอัปเดต เช่น Improvements และ Bug Fixes ได้แล้ว' },
      { type: 'improved', text: 'เพิ่ม cache/fallback ให้ยังเปิดดูรายการอัปเดตได้แม้โหลดข้อมูลล่าสุดไม่สำเร็จ' },
      { type: 'improved', text: 'ปรับตัวหนังสือ log บน Shopee overlay ให้อ่านสบายขึ้นและไม่เด่นเกินหน้าจอหลัก' },
    ],
  },
  {
    version: '0.2.27',
    date: '2026-07-02',
    highlight: 'Shopee Import และ Shopee Post เสถียรขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การซิงก์รูปสินค้า Shopee ขึ้น cloud บางเครื่องที่อัปโหลดไม่สำเร็จ' },
      { type: 'fixed', text: 'หลังดึงสินค้า Shopee เสร็จ คลังสินค้าจะรีเฟรชจากข้อมูลในเครื่องทันที ไม่ต้องกดซิงก์เอง' },
      { type: 'improved', text: 'รองรับหน้าจอโพสต์ Shopee รูปแบบใหม่ เช่น ช่องแคปชั่นและป้ายกำกับเนื้อหา AI' },
    ],
  },
  {
    version: '0.2.26',
    date: '2026-07-02',
    highlight: 'คลังสินค้า Shopee เก็บรูปบน cloud ได้ครบขึ้น',
    changes: [
      { type: 'improved', text: 'เมื่อดึงสินค้า Shopee ระบบจะเก็บรูปสินค้าไว้ในเครื่องก่อนใช้งาน ลดโอกาสรูปหายจากลิงก์ต้นทาง' },
      { type: 'improved', text: 'ซิงก์รูปสินค้า Shopee ขึ้น cloud เพื่อให้เปิดใช้จากอุปกรณ์อื่นได้เสถียรขึ้น' },
      { type: 'fixed', text: 'ปรับการแสดงรูปสินค้าในคลังและหน้า Auto ให้ใช้รูปที่บันทึกไว้ก่อนลิงก์จาก Shopee' },
    ],
  },
  {
    version: '0.2.25',
    date: '2026-07-02',
    highlight: 'Shopee Import ดึงสินค้าถูกใจแม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับการยืนยันมุมมองผู้ซื้อในหน้าถูกใจ Shopee ให้แม่นขึ้นก่อนเริ่มดึงสินค้า' },
      { type: 'improved', text: 'ลดโอกาสกดผิดตำแหน่งตอนสลับมุมมองและเพิ่ม log ให้เห็นสถานะหน้าถูกใจชัดขึ้น' },
      { type: 'improved', text: 'ปรับการเปิดสินค้าในรายการถูกใจให้ระวังพื้นที่แถบเมนูมากขึ้นบนหน้าจอหลายขนาด' },
    ],
  },
  {
    version: '0.2.23',
    date: '2026-07-01',
    highlight: 'Shopee Import ตรวจหน้า ฉัน ได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้บางเครื่องที่กดเมนู ฉัน สำเร็จแล้ว แต่ระบบยังยืนยันหน้า ฉัน ไม่ได้' },
      { type: 'improved', text: 'รองรับ marker หน้า ฉัน เพิ่ม เช่น My Wallet, Shopee Coins, Promotions และ E-Service' },
      { type: 'improved', text: 'เพิ่ม log รายละเอียดตอนตรวจหน้า ฉัน เพื่อบอกว่าเจอ tab, header, purchase, liked และ marker กี่รายการ' },
    ],
  },
  {
    version: '0.2.22',
    date: '2026-07-01',
    highlight: 'Auto Workflow ไม่ข้ามขั้นตอนสร้างรูป',
    changes: [
      { type: 'fixed', text: 'แก้กรณีเครื่องที่จำค่าเก่าไว้เป็นวิดีโออย่างเดียว แล้วเริ่มสร้างวิดีโอทันทีโดยไม่สร้างรูปก่อน' },
      { type: 'changed', text: 'เมื่อเปิดขั้นตอนวิดีโอ ระบบจะบังคับให้มีขั้นตอนรูปภาพนำหน้าเสมอ เพื่อให้แนบรูปสินค้า ตัวละคร และฉากก่อนสร้างวิดีโอ' },
      { type: 'improved', text: 'เพิ่ม log สรุปก่อนสร้างรูปฉากเดียวว่าอัปโหลด reference อะไรบ้าง เช่น รูปสินค้า รูปตัวละคร หรือรูปฉาก' },
    ],
  },
  {
    version: '0.2.21',
    date: '2026-07-01',
    highlight: 'แนบรูปวิดีโอจาก cache แทนเลือกรูปล่าสุด',
    changes: [
      { type: 'changed', text: 'เมื่อสร้างวิดีโอต่อจากรูปที่เพิ่งสร้าง ระบบจะอัปโหลดรูปจาก cache ของแอปเข้า Google Flow โดยตรง แทนการเลื่อนหาและเลือกรูปล่าสุดจาก dialog' },
      { type: 'improved', text: 'วิดีโอหลายฉากและมุมเดียวบนมือถือจะใช้รูปฉากที่แอปเก็บไว้เป็น reference โดยตรง ลดโอกาสเลือกผิดบนเครื่องที่รายการล่าสุดของ Google Flow ไม่นิ่ง' },
    ],
  },
  {
    version: '0.2.20',
    date: '2026-07-01',
    highlight: 'กดปุ่มแนบรูปใน Google Flow แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การหาปุ่ม + แนบรูปใน Google Flow ให้จำกัดอยู่กับ composer มากขึ้น ลดโอกาสกดโดนปุ่มของตัวอย่างหรือส่วนอื่นบนหน้า' },
      { type: 'changed', text: 'ปรับ logic ให้ใกล้ Desktop/Extension โดยใช้ปุ่ม dialog ที่มี add/add_2/create/start เป็นหลัก ไม่ใช้คำว่า Image/รูป เป็นตัวเลือกกด' },
    ],
  },
  {
    version: '0.2.19',
    date: '2026-07-01',
    highlight: 'อ่านข้อความ error ใน WebView ได้ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'ปรับ log overlay บน Google Flow WebView ให้ error แสดงหลายบรรทัด ไม่ถูกตัดท้ายข้อความ' },
      { type: 'improved', text: 'เพิ่มสีและพื้นที่ให้ log สำคัญ เช่น แนบรูปไม่สำเร็จ Retry หรือเปิด dialog ไม่ได้ เพื่อช่วยวิเคราะห์เครื่องที่มีปัญหา' },
    ],
  },
  {
    version: '0.2.18',
    date: '2026-07-01',
    highlight: 'Log แนบรูปใน Google Flow ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่ม log ฝั่งระบบก่อนเริ่มเปิด dialog แนบรูปและเลือกรูปล่าสุด เพื่อให้เห็นแน่นอนแม้ log จากหน้า Flow ไม่ส่งกลับมา' },
      { type: 'improved', text: 'เมื่อแนบรูปหรือเลือกรูปล่าสุดไม่สำเร็จ จะแสดง error จริงก่อนเข้าสู่ retry' },
    ],
  },
  {
    version: '0.2.17',
    date: '2026-07-01',
    highlight: 'แนบรูปใน Google Flow เสถียรขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้บางเครื่องกดปุ่ม + แล้ว dialog เลือกรูปไม่เปิด ทำให้แนบรูปไม่ได้' },
      { type: 'improved', text: 'เพิ่มการคลิก fallback หลายแบบและ log/error ชัดเจนเมื่อกด + แล้ว dialog ไม่เปิด' },
    ],
  }
];

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeChangeType(value: unknown): MobileChangelogItem['type'] {
  const type = cleanString(value).toLowerCase();
  if (type === 'feature' || type === 'features' || type === 'new') {
    return 'feature';
  }
  if (type === 'fix' || type === 'fixes' || type === 'bug' || type === 'bugfix' || type === 'bug-fix') {
    return 'fixed';
  }
  if (type === 'improvement' || type === 'improvements') {
    return 'improved';
  }
  if (type === 'change' || type === 'changes') {
    return 'changed';
  }
  if (type === 'remove') {
    return 'removed';
  }
  if (
    type === 'added' ||
    type === 'fixed' ||
    type === 'improved' ||
    type === 'changed' ||
    type === 'removed'
  ) {
    return type;
  }
  return 'improved';
}

function inferChangeTypeFromText(text: string, fallback: MobileChangelogItem['type'] = 'improved'): MobileChangelogItem['type'] {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return fallback;
  if (/^(แก้|fix|fixed|bug)/i.test(normalized)) return 'fixed';
  if (/^(เพิ่ม|added|add|รองรับ)/i.test(normalized)) return 'added';
  if (/^(ปรับ|ปรับปรุง|ลด|ซิงก์|improve|improved|support)/i.test(normalized)) return 'improved';
  if (/^(เปลี่ยน|ย้าย|changed|change)/i.test(normalized)) return 'changed';
  if (/^(ลบ|เอาออก|นำออก|removed|remove)/i.test(normalized)) return 'removed';
  return fallback;
}

function isReleaseMetadataLine(line: string): boolean {
  return /^(sha256|checksum|digest|versionCode|version_code|build|buildCode|minSupportedVersionCode|min_supported_version_code|minBuild|min_build|forceUpdate|force_update|force)\s*:/i.test(
    line.trim()
  );
}

function headingChangeType(line: string): MobileChangelogItem['type'] | null {
  const normalized = line
    .replace(/^#+\s*/, '')
    .replace(/:$/, '')
    .trim()
    .toLowerCase();

  if (/^(features?|added|new|เพิ่ม|ของใหม่)$/.test(normalized)) {
    return 'added';
  }
  if (/^(improvements?|improved|ปรับปรุง)$/.test(normalized)) {
    return 'improved';
  }
  if (/^(bug fixes?|fixes?|fixed|แก้ไข|แก้บั๊ก)$/.test(normalized)) {
    return 'fixed';
  }
  if (/^(changes?|changed|เปลี่ยนแปลง)$/.test(normalized)) {
    return 'changed';
  }
  if (/^(removed|remove|ลบ|นำออก)$/.test(normalized)) {
    return 'removed';
  }
  return null;
}

function parseChangesText(textValue: string): MobileChangelogItem[] {
  const changes: MobileChangelogItem[] = [];
  let currentType: MobileChangelogItem['type'] | null = null;

  for (const rawLine of textValue.replace(/\\n/g, '\n').split('\n')) {
    const raw = rawLine.trim();
    if (!raw) {
      continue;
    }

    const isBullet = /^[-*]\s+/.test(raw);
    const text = raw.replace(/^[-*]\s+/, '').trim();
    if (!text || isReleaseMetadataLine(text)) {
      continue;
    }

    const headingType = headingChangeType(text);
    if (headingType && !isBullet) {
      currentType = headingType;
      continue;
    }

    changes.push({
      type: currentType || inferChangeTypeFromText(text),
      text,
    });
  }

  return changes;
}

function parseRemoteChanges(changes: unknown): MobileChangelogItem[] {
  if (Array.isArray(changes)) {
    return changes
      .map((change) => {
        if (typeof change === 'string') {
          const text = change.trim();
          if (!text || isReleaseMetadataLine(text)) {
            return null;
          }
          return text ? { type: inferChangeTypeFromText(text), text } : null;
        }
        if (!change || typeof change !== 'object') {
          return null;
        }
        const candidate = change as { type?: unknown; text?: unknown };
        const text = cleanString(candidate.text);
        if (!text) {
          return null;
        }
        if (isReleaseMetadataLine(text)) {
          return null;
        }
        const normalizedType = normalizeChangeType(candidate.type);
        return {
          type: normalizedType === 'added' ? inferChangeTypeFromText(text, 'improved') : normalizedType,
          text,
        };
      })
      .filter(Boolean) as MobileChangelogItem[];
  }

  if (changes && typeof changes === 'object') {
    const objectChange = changes as { items?: unknown; changes?: unknown; type?: unknown; text?: unknown };
    if (Array.isArray(objectChange.items)) {
      return parseRemoteChanges(objectChange.items);
    }
    if (Array.isArray(objectChange.changes)) {
      return parseRemoteChanges(objectChange.changes);
    }

    const text = cleanString(objectChange.text);
    if (!text || isReleaseMetadataLine(text)) {
      return [];
    }

    return [{
      type: normalizeChangeType(objectChange.type),
      text,
    }];
  }

  if (typeof changes !== 'string' || !changes.trim()) {
    return [];
  }

  try {
    return parseRemoteChanges(JSON.parse(changes));
  } catch {
    return parseChangesText(changes);
  }
}

function normalizeRemoteRelease(release: RemoteRelease): MobileChangelogRelease | null {
  const version = cleanString(release.version).replace(/^v/i, '');
  if (!version) {
    return null;
  }

  const changes = parseRemoteChanges(release.changes);
  const highlight = cleanString(release.highlight);
  const fallbackChanges: MobileChangelogItem[] = highlight
    ? [{ type: 'improved', text: highlight }]
    : [{ type: 'improved', text: `อัปเดต Kubdee AI Mobile เป็นเวอร์ชัน ${version}` }];

  return {
    version,
    date: cleanString(release.date) || new Date().toISOString().split('T')[0] || '',
    highlight,
    changes: changes.length > 0 ? changes : fallbackChanges,
  };
}

function isMobileChangelogRelease(value: unknown): value is MobileChangelogRelease {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const release = value as Partial<MobileChangelogRelease>;
  return (
    typeof release.version === 'string' &&
    typeof release.date === 'string' &&
    typeof release.highlight === 'string' &&
    Array.isArray(release.changes)
  );
}

function isCachedMobileChangelog(value: unknown): value is CachedMobileChangelog {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const cached = value as Partial<CachedMobileChangelog>;
  return (
    typeof cached.cachedAt === 'number' &&
    Array.isArray(cached.releases) &&
    cached.releases.every(isMobileChangelogRelease)
  );
}

async function readCachedMobileChangelog(): Promise<CachedMobileChangelog | null> {
  const raw = await AsyncStorage.getItem(MOBILE_CHANGELOG_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isCachedMobileChangelog(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCachedMobileChangelog(releases: MobileChangelogRelease[]): Promise<void> {
  await AsyncStorage.setItem(
    MOBILE_CHANGELOG_CACHE_KEY,
    JSON.stringify({
      releases,
      cachedAt: Date.now(),
    } satisfies CachedMobileChangelog)
  );
}

function localChangelogResult(error: string | null = null): MobileChangelogLoadResult {
  return {
    releases: MOBILE_CHANGELOG,
    source: 'local',
    error,
  };
}

export async function loadMobileChangelog(token: string | null | undefined): Promise<MobileChangelogLoadResult> {
  if (token) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/releases?app=mobile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Client-App': CLIENT_APP,
          'X-App-Type': APP_TYPE,
        },
      });

      let body: RemoteReleaseResponse = {};
      try {
        body = (await response.json()) as RemoteReleaseResponse;
      } catch {
        body = {};
      }

      if (!response.ok) {
        throw new Error(body.error || body.message || `โหลด changelog ไม่สำเร็จ (${response.status})`);
      }

      const releases = Array.isArray(body.releases)
        ? body.releases
            .map((release) => normalizeRemoteRelease(release as RemoteRelease))
            .filter(Boolean) as MobileChangelogRelease[]
        : [];

      if (releases.length === 0) {
        throw new Error('ไม่พบข้อมูล changelog จาก server');
      }

      try {
        await writeCachedMobileChangelog(releases);
      } catch {
        // Cache is best-effort; valid remote data should still be shown.
      }

      return {
        releases,
        source: 'remote',
        error: null,
      };
    } catch (error) {
      const cached = await readCachedMobileChangelog();
      if (cached?.releases.length) {
        return {
          releases: cached.releases,
          source: 'cache',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return localChangelogResult(error instanceof Error ? error.message : String(error));
    }
  }

  const cached = await readCachedMobileChangelog();
  if (cached?.releases.length) {
    return {
      releases: cached.releases,
      source: 'cache',
      error: null,
    };
  }

  return localChangelogResult();
}

export const CURRENT_CHANGELOG_VERSION = MOBILE_CHANGELOG[0]?.version ?? '0.2.0';
