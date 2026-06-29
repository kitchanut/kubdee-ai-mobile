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
    version: '0.1.45',
    date: '2026-06-29',
    highlight: 'Auto Mobile จับรูปจาก Google Flow แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แก้การตรวจรูปที่สร้างจาก Google Flow ให้ไม่ตัดรูปจริงทิ้งเมื่อไฟล์มาจากโดเมน Google' },
      { type: 'improved', text: 'ปรับ logic รูปเดิม/รูปใหม่ให้ใกล้ Desktop มากขึ้นตอน poll ผลลัพธ์และดาวน์โหลดรูป' },
    ],
  },
  {
    version: '0.1.44',
    date: '2026-06-29',
    highlight: 'Auto Mobile ตรวจผลรูปภาพแม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'Auto Workflow: บันทึกสถานะรูปเดิมก่อนสร้าง และไม่นับรูปเก่าบน Google Flow เป็นผลงานใหม่' },
      { type: 'improved', text: 'เพิ่ม log สถานะเดิมก่อน submit เพื่อช่วยตรวจงานรูปและวิดีโอได้ใกล้เคียง Desktop มากขึ้น' },
    ],
  },
  {
    version: '0.1.43',
    date: '2026-06-29',
    highlight: 'อัปเดต Mobile Changelog ให้ใช้งานง่ายขึ้น',
    changes: [
      { type: 'improved', text: 'ปรับหน้าตา Changelog เป็น modal กลางจอให้ใกล้เคียง Desktop มากขึ้น' },
      { type: 'improved', text: 'ออก APK เวอร์ชันใหม่ให้ระบบเช็คอัปเดตและดาวน์โหลดได้ต่อเนื่อง' },
    ],
  },
  {
    version: '0.1.42',
    date: '2026-06-29',
    highlight: 'วิดีโอหลายฉากบน Mobile คุมบทและเสียงพากย์ตรงขึ้น',
    changes: [
      { type: 'fixed', text: 'วิดีโอหลายฉาก: ถ้าปิด AI คิดบท ระบบจะไม่แทรกบทพูดเอง แต่ให้ Google Flow คิดบทจาก prompt และรูปฉากตามปกติ' },
      { type: 'fixed', text: 'เสียงพากย์: ถ้า AI ส่งบทแยกฉากมาแต่ไม่มีบทพากย์รวม ระบบจะรวมบทฉากที่ AI คิดไว้จริงไปสร้างเสียงแทนการ fallback ไปใช้บททั่วไป' },
    ],
  },
  {
    version: '0.1.41',
    date: '2026-06-29',
    highlight: 'อัปเดตแพ็กเกจ Mobile รุ่นใหม่',
    changes: [
      { type: 'improved', text: 'ออก APK เวอร์ชันใหม่ให้ระบบเช็คอัปเดตและดาวน์โหลดได้ต่อเนื่อง' },
      { type: 'improved', text: 'ปรับข้อมูลเวอร์ชันและ changelog ให้ตรงกับ release ล่าสุด' },
    ],
  },
  {
    version: '0.1.40',
    date: '2026-06-29',
    highlight: 'หน้า Logs เห็นสถานะ Google Flow ล่าสุดง่ายขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่มสรุปสถานะ Google Flow ล่าสุดบนการ์ด Activity เพื่อดูจำนวนกำลังสร้าง คิว สำเร็จ ล้มเหลว และเปอร์เซ็นต์ได้เร็วขึ้น' },
      { type: 'improved', text: 'ช่วยให้ติดตามงาน Auto Mobile จากหน้า Logs ได้ใกล้เคียง Desktop มากขึ้น' },
    ],
  },
  {
    version: '0.1.39',
    date: '2026-06-29',
    highlight: 'Activity Log แสดงขั้นตอนตั้งค่า Google Flow ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'แสดง log ระหว่างตั้งค่า Google Flow เช่น model, สัดส่วน, จำนวน และความยาววิดีโอแบบละเอียดขึ้น' },
      { type: 'improved', text: 'ช่วยให้ตามปัญหาตอนสร้างงาน Auto Mobile ได้ใกล้เคียง Desktop มากขึ้น' },
    ],
  },
  {
    version: '0.1.38',
    date: '2026-06-29',
    highlight: 'อัปเดตแพ็กเกจ Mobile รุ่นใหม่',
    changes: [
      { type: 'improved', text: 'ออก APK เวอร์ชันใหม่ให้ระบบเช็คอัปเดตและดาวน์โหลดได้ต่อเนื่อง' },
      { type: 'improved', text: 'ปรับข้อมูลเวอร์ชันและ changelog ให้ตรงกับ release ล่าสุด' },
    ],
  },
  {
    version: '0.1.37',
    date: '2026-06-29',
    highlight: 'แท็บ Logs แสดงสถานะ Google Flow ได้ละเอียดขึ้น',
    changes: [
      { type: 'improved', text: 'Activity ของ Auto Workflow จะเก็บสถานะ Google Flow ไปพร้อมกับ log ล่าสุด' },
      { type: 'improved', text: 'แท็บ Logs แสดงตัวเลขกำลังสร้าง คิว สำเร็จ ล้มเหลว เปอร์เซ็นต์ และจำนวน tile เมื่อมีข้อมูล' },
      { type: 'improved', text: 'ช่วยให้ตามงาน Auto Mobile ได้ต่อเนื่อง แม้ออกจากหน้า Auto ไปดู Activity รวม' },
    ],
  },
  {
    version: '0.1.36',
    date: '2026-06-29',
    highlight: 'Activity Log แสดงผลตรวจ Prompt ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่ม log แสดงผลตรวจ prompt หลังกรอกใน Google Flow ว่ากรอกได้ครบกี่ตัวอักษร' },
      { type: 'improved', text: 'ถ้า Google Flow รับ prompt ไม่ครบ ระบบจะแจ้งจำนวนที่กรอกได้ เพื่อช่วยวิเคราะห์และ retype ได้ชัดขึ้น' },
      { type: 'improved', text: 'ช่วยให้การติดตามปัญหาตอนกดสร้างรูปหรือวิดีโอใน Auto Mobile ทำได้ง่ายขึ้น' },
    ],
  },
  {
    version: '0.1.35',
    date: '2026-06-29',
    highlight: 'ตรวจ Prompt ก่อนสร้างงานแม่นขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่มการตรวจสอบ prompt หลังกรอกใน Google Flow ให้จับกรณีกรอกไม่ครบได้ดีขึ้น' },
      { type: 'improved', text: 'ลดโอกาสกดสร้างงานด้วย prompt ที่ขาดบางส่วนในหน้า Auto Mobile' },
      { type: 'improved', text: 'ช่วยให้ระบบ retype prompt ทำงานได้ถูกจังหวะมากขึ้นเมื่อ Google Flow รับข้อความไม่ครบ' },
    ],
  },
  {
    version: '0.1.34',
    date: '2026-06-29',
    highlight: 'ปรับ Changelog เป็น Modal แบบใหม่',
    changes: [
      { type: 'improved', text: 'ปรับหน้าตา Changelog ให้ใช้งานใกล้เคียง Desktop มากขึ้น' },
      { type: 'improved', text: 'จัดรายการอัปเดตเป็น modal พร้อม timeline และกลุ่มประเภทที่อ่านง่ายขึ้น' },
      { type: 'improved', text: 'ปรับหน้าตาเวอร์ชันและรายละเอียดอัปเดตให้ดูสอดคล้องกันมากขึ้น' },
    ],
  },
  {
    version: '0.1.33',
    date: '2026-06-29',
    highlight: 'ปรับเวลาใน Activity Log ให้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'Activity Log ที่แสดงเฉพาะรายการท้าย ๆ จะคำนวณเวลาห่างจาก log ก่อนหน้าจริง ไม่เริ่มเป็น +0s ผิดตำแหน่ง' },
      { type: 'improved', text: 'รายละเอียด Auto และหน้า Activity ใช้เวลา elapsed ต่อรอบได้ตรงขึ้นเวลาไล่ดูงานย้อนหลัง' },
    ],
  },
  {
    version: '0.1.32',
    date: '2026-06-29',
    highlight: 'ปรับจำนวนวิดีโอให้ตรงกับโหมดหลายฉาก',
    changes: [
      { type: 'fixed', text: 'เมื่อเลือกวิดีโอหลายฉาก หน้า Auto จะแสดงจำนวนวิดีโอเป็น 1 ให้ตรงกับผลลัพธ์จริง' },
      { type: 'improved', text: 'ปิดตัวเลือกจำนวนวิดีโอที่ไม่ใช้ในโหมดหลายฉาก เพื่อลดความสับสนตอนสร้างงาน' },
    ],
  },
  {
    version: '0.1.31',
    date: '2026-06-29',
    highlight: 'ปรับเสียงพากย์ให้แสดงเฉพาะโหมดหลายฉากจริง',
    changes: [
      { type: 'fixed', text: 'ถ้าลดจำนวนฉากกลับเป็น 1 ฉาก ระบบจะไม่แสดงตัวเลือกเสียงพากย์ค้างจากโหมดหลายฉากเดิม' },
      { type: 'improved', text: 'ยังจำรูปแบบหลายฉากล่าสุดไว้ได้ เมื่อกลับมาเลือกหลายฉากอีกครั้ง' },
      { type: 'improved', text: 'ลดความสับสนระหว่างเสียงพูดปกติและเสียงพากย์ในหน้า Auto Mobile' },
    ],
  },
  {
    version: '0.1.30',
    date: '2026-06-29',
    highlight: 'รูปฉากหลายฉาก retry เฉพาะฉากที่ล้มเหลว',
    changes: [
      { type: 'improved', text: 'ถ้ารูปฉากในวิดีโอหลายฉากสร้างไม่สำเร็จ ระบบจะลองใหม่เฉพาะฉากนั้นโดยแนบ reference เดิม' },
      { type: 'improved', text: 'ลดโอกาสงานหลายฉากหยุดทั้งงานจาก error ชั่วคราวของ Google Flow' },
      { type: 'improved', text: 'เพิ่มสถานะ Activity Log สำหรับ retry รูปฉากให้ตามงานได้ชัดขึ้น' },
    ],
  },
  {
    version: '0.1.29',
    date: '2026-06-29',
    highlight: 'วิดีโอหลายฉาก retry ได้เฉพาะฉากที่ล้มเหลว',
    changes: [
      { type: 'improved', text: 'ถ้าวิดีโอหลายฉากสร้างบางฉากไม่สำเร็จ ระบบจะลองใหม่เฉพาะฉากนั้นโดยใช้รูปเดิม' },
      { type: 'improved', text: 'รองรับ AI rewrite prompt ก่อน retry ฉากวิดีโอที่ล้มเหลว เพื่อลดการหยุดทั้งงาน' },
      { type: 'improved', text: 'เพิ่มสถานะ Activity Log สำหรับ retry วิดีโอหลายฉากให้ตามงานได้ชัดขึ้น' },
    ],
  },
  {
    version: '0.1.28',
    date: '2026-06-29',
    highlight: 'หน้า Auto เลือกตัวละครและฉากจากคลังได้จริง',
    changes: [
      { type: 'added', text: 'ตั้งค่ารูปภาพใน Auto สามารถเลือกตัวละครและฉากจากคลัง local ได้แล้ว' },
      { type: 'improved', text: 'แนบรูป reference ตัวละครหรือฉากตอนสร้างรูป เพื่อให้ workflow ใกล้ desktop มากขึ้น' },
      { type: 'improved', text: 'เพิ่ม log ขั้นตอนแนบตัวละครและฉากใน Activity Log' },
    ],
  },
  {
    version: '0.1.27',
    date: '2026-06-29',
    highlight: 'ปรับปรุงความพร้อมของระบบอัปเดตมือถือ',
    changes: [
      { type: 'improved', text: 'ออก APK เวอร์ชันใหม่สำหรับตรวจอัปเดตและดาวน์โหลดผ่านหน้า Mobile' },
      { type: 'improved', text: 'ปรับข้อมูล changelog ให้ตรงกับ patch release ล่าสุด' },
    ],
  },
  {
    version: '0.1.26',
    date: '2026-06-29',
    highlight: 'ปรับ Activity Log ให้ตามเวลาทำงานได้ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'แสดงเวลาที่ใช้และช่วงเวลาระหว่างแต่ละ log ในหน้ารายละเอียด activity' },
      { type: 'improved', text: 'อัปเดตสถานะกำลังทำงานให้เห็นเวลารวมแบบต่อเนื่อง' },
    ],
  },
  {
    version: '0.1.25',
    date: '2026-06-29',
    highlight: 'อัปเดตเวอร์ชันสำหรับระบบอัปเดตอัตโนมัติ',
    changes: [
      { type: 'improved', text: 'เตรียม APK เวอร์ชันใหม่ให้ตรวจพบและดาวน์โหลดจากหน้าอัปเดตได้ต่อเนื่อง' },
      { type: 'improved', text: 'ปรับข้อมูล changelog ให้ตรงกับเวอร์ชันล่าสุดของแอปมือถือ' },
    ],
  },
  {
    version: '0.1.24',
    date: '2026-06-29',
    highlight: 'ปรับ AI คิดบทหลายฉากให้ทำงานต่อได้ดีขึ้น',
    changes: [
      { type: 'fixed', text: 'ลดโอกาสงานหยุดเมื่อ AI ตอบบทหลายฉากมาไม่ตรงรูปแบบเป๊ะ' },
      { type: 'improved', text: 'รองรับการอ่านบทฉากจากข้อความของ AI ได้ยืดหยุ่นขึ้น' },
    ],
  },
  {
    version: '0.1.23',
    date: '2026-06-29',
    highlight: 'ปรับวิดีโอหลายฉากให้คุม reference ได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'แนบรูปสินค้าเป็น reference ทุกครั้งที่สร้างรูปฉากในวิดีโอหลายฉาก' },
      { type: 'fixed', text: 'เปลี่ยนกลับเป็นขยายฉากอัตโนมัติเมื่อเลือกจำนวนฉากเป็น 1 ฉาก' },
    ],
  },
  {
    version: '0.1.22',
    date: '2026-06-29',
    highlight: 'ปรับวิดีโอหลายฉากให้ใช้สไตล์ภาพได้ครบขึ้น',
    changes: [
      { type: 'improved', text: 'คงสไตล์รูปภาพและรายละเอียดสินค้าเมื่อสร้างวิดีโอหลายฉาก แม้เลือกสร้างเฉพาะวิดีโอ' },
      { type: 'improved', text: 'ปรับ prompt รูปของแต่ละฉากให้ต่อยอดจากค่าตั้งต้นได้สม่ำเสมอขึ้น' },
    ],
  },
  {
    version: '0.1.21',
    date: '2026-06-29',
    highlight: 'เพิ่มการฟังตัวอย่างเสียงก่อนสร้างวิดีโอ',
    changes: [
      { type: 'added', text: 'เพิ่มปุ่ม Preview สำหรับฟังตัวอย่างเสียงพูดและเสียงพากย์ในตั้งค่าวิดีโอ' },
      { type: 'improved', text: 'ช่วยให้เลือกโทนเสียงผู้หญิง ผู้ชาย และเสียงพากย์ได้แม่นขึ้นก่อนเริ่มงาน' },
    ],
  },
  {
    version: '0.1.20',
    date: '2026-06-29',
    highlight: 'ปรับ Auto Workflow และตัวเลือกเสียงให้ใช้งานต่อเนื่องขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับ Auto Workflow ให้ทำงานต่อได้เมื่อบางขั้นตอนสร้างงานไม่สำเร็จ' },
      { type: 'improved', text: 'จัดกลุ่มเสียงพากย์ให้เลือกเสียงผู้หญิง ผู้ชาย และเสียงกลางได้ชัดขึ้น' },
      { type: 'improved', text: 'ซ่อนตัวเลือกเสียงพูดเมื่อไม่ได้เปิดใช้เสียงในวิดีโอ' },
    ],
  },
  {
    version: '0.1.19',
    date: '2026-06-29',
    highlight: 'ปรับการตั้งค่าวิดีโอใน Google Flow ให้เลือก reference ได้ถูกต้องขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับการเลือกช่องอ้างอิงวิดีโอให้ตรงกับ Google Flow รุ่นล่าสุด' },
      { type: 'improved', text: 'ลดโอกาสเลือกโหมดอ้างอิงผิดตอนสร้างวิดีโอจากรูปที่สร้างไว้' },
    ],
  },
  {
    version: '0.1.18',
    date: '2026-06-29',
    highlight: 'ปรับหน้าต่าง Google Flow ให้ติดตามงาน Auto Workflow ได้ละเอียดขึ้น',
    changes: [
      { type: 'added', text: 'เพิ่มตัวนับรูปและวิดีโอที่สร้างได้เทียบกับจำนวนที่วางแผนไว้' },
      { type: 'improved', text: 'แสดงเวลาที่ใช้และช่วงเวลาระหว่าง log บนหน้าต่าง Google Flow' },
      { type: 'fixed', text: 'ปรับสถานะตอนกดหยุดงานให้แสดงเป็นขั้นตอนกำลังหยุดได้ชัดเจนขึ้น' },
    ],
  },
  {
    version: '0.1.17',
    date: '2026-06-29',
    highlight: 'ปรับ Activity Log ของ Auto Workflow ให้อ่านสถานะได้ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'เพิ่มป้ายขั้นตอนใน log ของ Auto Workflow ทั้งหน้า Auto และหน้าประวัติ' },
      { type: 'improved', text: 'แสดงเวลาที่ใช้และเวลาระหว่างเหตุการณ์ใน log ให้ดูต่อเนื่องขึ้น' },
      { type: 'fixed', text: 'ปรับสถานะหลัง Retype และสถานะจบงานให้แสดงตรงกับขั้นตอนจริงมากขึ้น' },
    ],
  },
  {
    version: '0.1.16',
    date: '2026-06-29',
    highlight: 'ปรับ Auto Workflow ให้ retry และนับผลลัพธ์ได้แม่นขึ้น',
    changes: [
      { type: 'fixed', text: 'รอผลรูปและวิดีโอให้ครบตามจำนวนที่ตั้งไว้ก่อนสรุปงาน' },
      { type: 'improved', text: 'ปรับการนับผลสำเร็จและล้มเหลวใน Auto Workflow ให้ตรงกับจำนวนที่วางแผนไว้' },
      { type: 'improved', text: 'เพิ่มการลองใช้ prompt จากงานล่าสุดก่อน retry แบบทำ Flow ใหม่' },
    ],
  },
  {
    version: '0.1.15',
    date: '2026-06-29',
    highlight: 'ปรับสถานะ Auto Workflow ระหว่างทำงานบน Google Flow ให้ชัดขึ้น',
    changes: [
      { type: 'improved', text: 'แสดงสถานะล่าสุดในหน้าต่าง Google Flow ระหว่างรันงาน' },
      { type: 'improved', text: 'ปรับชื่อขั้นตอน Auto Workflow ให้สอดคล้องกันระหว่างหน้า Auto และหน้าต่าง Flow' },
      { type: 'fixed', text: 'ปรับการนับผลลัพธ์รูปและวิดีโอหลังดึงเข้าคลังให้แม่นขึ้น' },
    ],
  },
  {
    version: '0.1.14',
    date: '2026-06-29',
    highlight: 'ปรับวิดีโอหลายฉากและสถานะ Auto Workflow ให้ตรงงานจริงขึ้น',
    changes: [
      { type: 'fixed', text: 'ปรับวิดีโอหลายฉากมุมเดียวให้เลือกรูปล่าสุดเป็น reference ได้ถูกต้องขึ้น' },
      { type: 'fixed', text: 'ปรับจำนวนวิดีโอที่วางแผนไว้ให้ตรงกับผลลัพธ์รวมของวิดีโอหลายฉาก' },
      { type: 'improved', text: 'เพิ่มสถานะระหว่างตั้งค่า Flow สำหรับรูปและวิดีโอหลายฉากให้อ่านง่ายขึ้น' },
    ],
  },
  {
    version: '0.1.13',
    date: '2026-06-29',
    highlight: 'ปรับการติดตาม Auto Workflow บน Google Flow ให้ชัดเจนขึ้น',
    changes: [
      { type: 'added', text: 'เพิ่มแถบสถานะรอบ สินค้า ขั้นตอน และสถานะ Flow ระหว่างรันงาน' },
      { type: 'improved', text: 'ปรับการส่งคำสั่งสร้างงานให้ลดปัญหา prompt ค้างหลังเริ่มสร้าง' },
      { type: 'improved', text: 'แสดงงานที่กำลังทำในหน้าต่าง Google Flow ได้อ่านง่ายขึ้น' },
    ],
  },
  {
    version: '0.1.12',
    date: '2026-06-29',
    highlight: 'ปรับ Auto Workflow ให้ตั้งค่ารอบและติดตามจำนวนงานได้ละเอียดขึ้น',
    changes: [
      { type: 'added', text: 'เพิ่มตัวเลือกจำนวนรอบและหน่วงเวลาให้ยืดหยุ่นกว่าเดิม' },
      { type: 'added', text: 'เพิ่มการแสดงจำนวนรูปและวิดีโอที่วางแผนไว้ระหว่างรันงาน' },
      { type: 'improved', text: 'ปรับจำนวนฉากวิดีโอหลายฉากให้ตรงกับ Desktop มากขึ้น' },
      { type: 'improved', text: 'ปรับสถานะรอบแบบไม่สิ้นสุดให้แสดงผลเข้าใจง่ายขึ้น' },
    ],
  },
  {
    version: '0.1.11',
    date: '2026-06-29',
    highlight: 'ปรับการติดตามผล Google Flow ให้แม่นขึ้นระหว่างสร้างงาน',
    changes: [
      { type: 'improved', text: 'เพิ่มการรอให้ Google Flow เริ่มสร้างงานจริงก่อนสรุปล้มเหลว' },
      { type: 'improved', text: 'เพิ่มการรอ URL และ Preview หลัง progress หาย เพื่อไม่พลาดผลงานที่เพิ่งเสร็จ' },
      { type: 'fixed', text: 'แสดงข้อความล้มเหลวจาก Flow ใน Activity Log ได้ชัดเจนขึ้น' },
      { type: 'improved', text: 'เพิ่มจำนวน tile ที่ตรวจพบใน log สถานะ Flow ระหว่างสร้างรูปและวิดีโอ' },
    ],
  },
  {
    version: '0.1.10',
    date: '2026-06-29',
    highlight: 'ปรับ Auto Workflow และ Activity Log ให้ตามงานบน Google Flow ได้ชัดเจนขึ้น',
    changes: [
      { type: 'added', text: 'เพิ่ม Activity Log ของ Auto Workflow พร้อมเวลาในแต่ละเหตุการณ์' },
      { type: 'added', text: 'เพิ่มตัวเลือกลบโปรเจกต์ Google Flow ล่าสุดหลังจบงานต่อสินค้า' },
      { type: 'improved', text: 'ปรับการแสดงความคืบหน้าระหว่าง Google Flow กำลังสร้างรูปหรือวิดีโอ' },
      { type: 'improved', text: 'เพิ่มเวลาใน log ที่แสดงบนหน้าต่าง Google Flow ระหว่างรันงาน' },
    ],
  },
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

export const CURRENT_CHANGELOG_VERSION = MOBILE_CHANGELOG[0]?.version ?? '0.1.45';
